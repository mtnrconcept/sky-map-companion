# AstroStack, Cosmos Live et mosaïque — exploitation

## Architecture de production

Vercel sert l’interface et les routes d’API authentifiées. Supabase conserve les
originaux privés, les jobs, les solutions astrométriques, les métriques, les
droits d’attribution et les générations de mosaïque. Le worker Python exécute
les calculs CPU longs dans un conteneur persistant : décodage RAW/FITS,
Astrometry.net, SEP, calibration, alignement, stack, HEALPix et triangulation.

Les originaux `astro-raw` et les preuves `cosmos-evidence` restent privés. Seuls
les aperçus, masters approuvés, manifestes et tuiles immuables du bucket
`astro-derived` sont publics. Les coordonnées publiques de Cosmos sont arrondies
à 0,1 degré ; la base exacte n’est lisible que par le déclarant et le service.

## Ordre de déploiement

1. Déployer `supabase/migrations/20260808063605_complete_science_platform.sql`.
2. Vérifier les advisors Supabase de sécurité et de performance.
3. Construire `workers/science/Dockerfile` et déployer une réplique sur un hôte
   de conteneurs avec stockage temporaire suffisant pour trois RAW au minimum.
4. Monter les index Astrometry.net nécessaires en lecture seule sous
   `/usr/share/astrometry`.
5. Déployer l’application Vercel après la migration, puis lancer un test avec un
   petit FITS synthétique avant d’ouvrir les uploads RAW.

Le worker ne peut pas être exécuté dans une fonction Vercel ou Supabase Edge :
les binaires Astrometry.net, le temps CPU et la taille des RAW exigent un runtime
de conteneur persistant.

## Variables du worker

| Variable              | Portée        | Description                                          |
| --------------------- | ------------- | ---------------------------------------------------- |
| `DATABASE_URL`        | secret worker | Connexion PostgreSQL directe avec SSL requis         |
| `SUPABASE_URL`        | worker        | URL du projet Supabase                               |
| `SUPABASE_SECRET_KEY` | secret worker | Clé serveur, jamais injectée dans Vercel côté client |
| `WORKER_ID`           | worker        | Identifiant unique de la réplique                    |
| `PIPELINE_VERSION`    | worker        | Version déterministe, par exemple `science-v1`       |
| `LEASE_SECONDS`       | worker        | Bail de job, 300 secondes par défaut                 |
| `POLL_SECONDS`        | worker        | Intervalle sans job, 2 secondes par défaut           |

Les trois premières variables sont obligatoires. Chaque réplique renouvelle son
bail toutes les `LEASE_SECONDS / 3`; les sorties sont adressées par checksum et
les écritures de solution, XP, génération et tuile sont idempotentes.

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

## Reprise et rollback

Pour réessayer une dead letter après correction, créer un nouveau job avec une
nouvelle clé d’idempotence et conserver l’ancien pour l’audit. Ne jamais modifier
manuellement les XP ou la première attribution d’une cellule.

Pour revenir à une mosaïque précédente, exécuter une transaction de service qui
verrouille `mosaic_layers`, vérifie que la génération cible est `published`, puis
remplace `current_generation_id`. Les objets Storage sont immuables : le rollback
ne supprime aucune tuile et reste instantanément réversible.

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
python -m pytest workers/science/tests
docker build -t sky-science-worker:verify workers/science
```

Les tests pgTAP sont dans
`supabase/tests/database/complete_science_platform.test.sql`. Ils doivent être
exécutés sur une base Supabase locale ou éphémère, jamais avec les secrets de
production.
