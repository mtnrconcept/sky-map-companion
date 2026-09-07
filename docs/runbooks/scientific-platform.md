# AstroStack, Cosmos Live et mosaïque — exploitation

## Architecture de production

Vercel sert l’interface et les routes d’API authentifiées. Supabase conserve les
originaux privés, les jobs, les solutions astrométriques, les métriques, les
droits d’attribution et les générations de mosaïque. Le worker Python exécute
les calculs CPU longs dans un conteneur persistant : décodage RAW/FITS,
Astrometry.net, SEP, calibration, alignement, stack, HEALPix et triangulation.

Les originaux `astro-raw` et les preuves `cosmos-evidence` restent privés. Seuls
les aperçus, masters approuvés, manifestes et tuiles immuables du bucket
`astro-derived` sont publics. Les générations HiPS IVOA obsolètes sont soumises
à la politique de rétention décrite plus bas. Les coordonnées publiques de
Cosmos sont arrondies à 0,1 degré ; la base exacte n’est lisible que par le
déclarant et le service.

La migration Cloudflare R2 est progressive. Supabase reste la source de vérité
pour Postgres, Auth, RLS, `processing_jobs`, provenance et décisions
scientifiques. R2 n’est qu’un backend objet ; le changement de stockage ne doit
jamais modifier une règle d’admission scientifique.

## Ordre de déploiement

1. Déployer `supabase/migrations/20260808234639_complete_science_platform.sql`.
2. Vérifier les advisors Supabase de sécurité et de performance.
3. Construire `workers/science/Dockerfile` et déployer une réplique sur un hôte
   de conteneurs avec stockage temporaire suffisant pour trois RAW au minimum.
4. Vérifier que l’image contient les index Astrometry.net 2MASS 4204–4219 et
   monter un disque de travail persistant sous `/var/data`.
5. Déployer l’application Vercel après la migration, puis lancer un test avec un
   petit FITS synthétique avant d’ouvrir les uploads RAW.

Le worker ne peut pas être exécuté dans une fonction Vercel ou Supabase Edge :
les binaires Astrometry.net, le temps CPU et la taille des RAW exigent un runtime
de conteneur persistant.

## Variables du worker

| Variable                | Portée        | Description                                                  |
| ----------------------- | ------------- | ------------------------------------------------------------ |
| `DATABASE_URL`          | secret worker | Connexion PostgreSQL directe avec SSL requis                 |
| `SUPABASE_URL`          | worker        | URL du projet Supabase                                       |
| `SUPABASE_SECRET_KEY`   | secret worker | Clé serveur, jamais injectée dans Vercel côté client         |
| `WORKER_ID`             | worker        | Identifiant unique de la réplique                            |
| `PIPELINE_VERSION`      | worker        | Version déterministe, par exemple `science-v1`               |
| `LEASE_SECONDS`         | worker        | Bail de job, 300 secondes par défaut                         |
| `POLL_SECONDS`          | worker        | Intervalle sans job, 2 secondes par défaut                   |
| `STORAGE_PRIMARY`       | worker        | `supabase` par défaut ; `r2` uniquement pendant le cutover   |
| `R2_ENDPOINT`           | worker        | Endpoint S3 `https://ACCOUNT_ID.r2.cloudflarestorage.com`    |
| `R2_REGION`             | worker        | Région S3, `auto` pour Cloudflare R2                          |
| `R2_ACCESS_KEY_ID`      | secret worker | Identifiant d’accès R2                                       |
| `R2_SECRET_ACCESS_KEY`  | secret worker | Secret d’accès R2                                            |
| `R2_RAW_BUCKET`         | worker        | Bucket RAW, par exemple `sky-raw`                             |
| `R2_DERIVED_BUCKET`     | worker        | Bucket dérivés, par exemple `sky-derived`                     |
| `R2_HIPS_BUCKET`        | worker        | Bucket HiPS, par exemple `sky-hips`                           |
| `R2_PUBLIC_BASE_URL`    | worker        | Base publique optionnelle pour les artefacts publiés         |

Les trois variables Supabase restent obligatoires. Chaque réplique renouvelle
son bail toutes les `LEASE_SECONDS / 3`; les sorties sont adressées par checksum
et les écritures de solution, XP, génération et tuile sont idempotentes.

### Fondation R2 et rollback

La migration `20260907040000_object_storage_backends.sql` ajoute uniquement des
métadonnées de localisation sur `astro_uploads`. Elle ne supprime ni ne renomme
`storage_path`, et ne supprime aucun objet Storage. Les anciennes lignes restent
lisibles avec `storage_backend='supabase'` et `storage_key=storage_path`.

La fondation supporte une lecture R2 avec fallback vers
`legacy_storage_path` dans Supabase. L’équivalence d’une copie n’est admise que
si sa taille et son SHA-256 correspondent. Une collision d’écriture sur un
artefact immuable est refusée si le contenu diffère.

Pendant cette première étape, `STORAGE_PRIMARY=supabase` doit rester actif en
production. Certains générateurs historiques HiPS/public-sky accèdent encore au
client Storage Supabase directement ; leur conversion et le Worker/Queue/
Container Cloudflare appartiennent aux étapes suivantes. Les identifiants R2
peuvent être présents pour tester des lectures ciblées, sans faire de R2 le
backend d’écriture global.

Rollback immédiat de la fondation :

```text
STORAGE_PRIMARY=supabase
```

Aucun rollback SQL n’est nécessaire : les colonnes legacy restent en place et
aucune suppression Supabase n’est autorisée à cette étape.

## Contrôles de santé

- Le conteneur doit rester `healthy` et ne jamais redémarrer en boucle.
- Les jobs `failed` dont `completed_at` est vide sont réessayés avec backoff.
- Un job avec `attempts >= max_attempts` est une dead letter et demande une
  inspection manuelle de `error_code`, `error_detail` et des événements.
- Une génération ne devient active que si son manifeste, son checksum et le
  nombre de tuiles publiées sont cohérents.
- Les logs JSON ne doivent contenir ni secret, ni URL signée, ni en-tête FITS,
  ni coordonnées GPS exactes.

Requêtes d’inspection en lecture seule :

```sql
select id, job_type, status, attempts, max_attempts, error_code, updated_at
from public.processing_jobs
where completed_at is null or status = 'failed'
order by updated_at desc;

select id, layer_id, generation, status, expected_tiles, published_tiles,
       manifest_sha256, activated_at
from public.mosaic_generations
order by created_at desc;
```

## Rétention des objets volumineux

Le workflow `Prune obsolete Sky Map HiPS storage` s’exécute quotidiennement et
utilise exclusivement l’API Storage pour éviter les blobs orphelins. Il ne cible
que les générations sous `hips-ivoa/public-optical-r/` et conserve toujours :

- la génération désignée par `current.json` ;
- la génération complète précédente pour un rollback ;
- toute génération modifiée depuis moins de 24 heures.

Les publications interrompues plus anciennes et les générations complètes
supplantées sont supprimées par lots de 1 000 objets, avec un plafond de
200 000 objets par exécution. Le pointeur actif est validé avant le calcul et
relu avant chaque lot ; au moindre changement ou format inattendu, la commande
s’arrête. Une exécution manuelle est une simulation par défaut : décocher
`dry_run` est nécessaire pour supprimer réellement les objets.

Les RAW `astro-raw`, les masters courants, les aperçus et les preuves Cosmos ne
sont pas concernés. Le générateur HiPS actuel reconstruit encore toute la
hiérarchie à partir des RAW qualifiés ; ces sources ne deviennent donc pas
inutiles après une première publication.

Simulation locale avec une clé serveur :

```bash
sky-storage-retention --retain-complete-generations 2 --grace-hours 24
```

Ajouter `--apply` rend la suppression permanente. Ne jamais supprimer les
entrées de `storage.objects` par SQL : cela laisserait les blobs facturés et
inaccessibles dans le backend Storage.

## Reprise et rollback

Pour réessayer une dead letter après correction, créer un nouveau job avec une
nouvelle clé d’idempotence et conserver l’ancien pour l’audit. Ne jamais modifier
manuellement les XP ou la première attribution d’une cellule.

Pour revenir à une mosaïque précédente, exécuter une transaction de service qui
verrouille `mosaic_layers`, vérifie que la génération cible est `published`, puis
remplace `current_generation_id`. Pour le HiPS IVOA, utiliser la génération
complète de secours conservée par la rétention et remplacer atomiquement
`current.json`. Les objets Storage d’une génération sont immuables ; une
génération plus ancienne déjà purgée doit être reconstruite depuis les RAW.

En cas d’incident de confidentialité, suspendre d’abord le worker, rendre le
bucket dérivé privé si nécessaire, révoquer la clé serveur, puis examiner les
`moderation_events` avant toute republication.

## Validation avant ouverture

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
python -m pip install -e 'workers/science[test]'
python -m pytest workers/science/tests/test_object_storage_contract.py \
  workers/science/tests/test_supabase_storage_backend.py \
  workers/science/tests/test_s3_storage_backend.py \
  workers/science/tests/test_storage_config.py \
  workers/science/tests/test_gateway_storage_fallback.py -q
python -m pytest workers/science/tests
docker build -t sky-science-worker:verify workers/science
```

Les tests pgTAP sont dans
`supabase/tests/database/complete_science_platform.test.sql`. Ils doivent être
exécutés sur une base Supabase locale ou éphémère, jamais avec les secrets de
production.
