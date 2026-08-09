# Sky science worker

Conteneur CPU isolé chargé de la qualification WCS, des métriques SEP, du
stacking, du clustering Cosmos Live et de la publication des tuiles dérivées.

Il requiert `DATABASE_URL`, `SUPABASE_URL` et `SUPABASE_SECRET_KEY`. L’image
embarque les index Astrometry.net 2MASS 4204–4219, couvrant les champs
d’environ 8 minutes d’arc à 33 degrés. Un disque persistant monté sous
`/var/data` fournit l’espace temporaire des traitements volumineux.
Les originaux sont obtenus avec des URL signées de courte durée et ne sont
jamais journalisés.

## Exécution sur un PC Windows

Le profil `compose.windows.yml` exécute une seule réplique locale, sans port
entrant, sous un utilisateur non privilégié et avec un volume Docker persistant.
Depuis PowerShell, à la racine du dépôt :

```powershell
.\scripts\windows-science-worker.ps1 configure
.\scripts\windows-science-worker.ps1 start
.\scripts\windows-science-worker.ps1 status
.\scripts\windows-science-worker.ps1 logs
```

Le script demande les trois secrets sans les afficher, crée
`.env.worker.local`, limite ses droits au compte Windows courant et vérifie
Docker Compose avant le démarrage. Le fichier secret est ignoré par Git.

Le PC doit rester allumé et Docker Desktop doit démarrer avec la session
Windows. Le conteneur utilise `restart: unless-stopped`; après une coupure, les
jobs non terminés redeviennent disponibles quand leur bail Supabase expire.

## Ingestion vérifiée d’archives publiques

L’image fournit également `sky-archive-ingest`. La première source prise en
charge est le service officiel MAST Pan-STARRS1. L’ingesteur n’accepte que
l’hôte fixe `ps1images.stsci.edu`, vérifie que chaque réponse est un FITS,
contrôle le WCS par rapport à la position demandée, conserve l’identifiant et
les conditions de l’archive, calcule le SHA-256 et applique des plafonds fermes
sur le nombre de fichiers et les octets téléchargés.

Les produits publics utilisent `source_kind=public_archive`. Ils ne se font pas
passer pour une contribution communautaire et ne donnent aucun XP utilisateur.
L’accusé de réception MAST/PS1 et les identifiants sources sont inscrits dans le
manifeste de la mosaïque.

Sous Windows, le pilote M31 est limité à 24 FITS et 2 Gio :

```powershell
.\scripts\windows-science-worker.ps1 ingest-m31
```

La commande découvre et enregistre les découpes centrales en bande `r`, attend
leur qualification par le worker persistant, puis construit la première
génération HEALPix cellule par cellule. Les identifiants d’archive et les
empreintes rendent les relances idempotentes. État des lots :

```powershell
.\scripts\windows-science-worker.ps1 archive-status
```

Le bootstrap `2026-08-09.8` corrige les incidents qui ont laissé le premier
lot M31 en `extracting` ou `solving` : l'adaptation JSON Psycopg, la tentative
inutile de résoudre à nouveau les produits PS1 de niveau 3, le traitement des
pixels non finis et les seuils de qualité inadaptés aux stacks scientifiques
calibrés. Le WCS fourni par PS1 n'est
accepté directement que si la provenance publique, le type de produit,
l'identifiant d'archive, la position céleste et le SHA-256 ont été vérifiés.
Les fichiers communautaires continuent de passer par Astrometry.net et gardent
leurs seuils existants. La reprise bornée reconstruit d'abord le worker,
réinitialise uniquement les jobs PS1 touchés par ces erreurs ou par l'ancienne
politique, attend leur qualification puis construit la mosaïque :

```powershell
.\scripts\windows-science-worker.ps1 repair-m31
```

Le bootstrap `2026-08-09.9` reconstruit uniquement les produits dérivés à
partir des 13 FITS PS1 déjà publiés. Il prend le WCS qualifié persistant comme
autorité, construit un master TAN à résolution adaptative bornée, exige une
contribution non nulle de chaque source, puis fabrique une pyramide HEALPix
cohérente depuis le masque du master. Le nombre attendu de tuiles est figé par
le plan de publication et n'est jamais abaissé au nombre effectivement produit.
Le master et la nouvelle génération ne deviennent courants qu'au terme d'une
activation atomique vérifiant sources, tuiles, manifeste et empreintes.

Ce lot couvre seulement une partie de M31 : l'interface le signale comme
master initial/partiel et publie sa fraction de couverture. La commande v9 ne
retélécharge rien et ne relance aucune qualification :

```powershell
.\scripts\windows-science-worker.ps1 rebuild-m31
```

Le FITS master est refusé avant upload s'il dépasse 500 Mio. Le canvas est
plafonné à 40 millions de pixels et la dégradation d'échelle est elle-même
bornée, afin qu'une future couverture plus large échoue explicitement au lieu
de réduire silencieusement la résolution ou de dépasser le bucket dérivé.

AstroStack interroge l'état public toutes les cinq secondes. Les tuiles HEALPix
apparaissent donc progressivement dans l'application ; elles restent signalées
comme provisoires jusqu'à validation du manifeste complet.

## Reconstruction distante M31

Le workflow GitHub Actions `Rebuild M31 master v9` permet d'exécuter la même
reconstruction sans poste Windows. Sur une pull request il valide le code sans
secret ni accès à la production. Après son ajout à `main`, il s'exécute une fois
automatiquement, puis reste disponible via `workflow_dispatch`.

Le mode `--inline-worker` loue exclusivement l'identifiant du job créé par
`rebuild`; il ne peut donc pas consommer un autre travail présent dans la file.
La concurrence GitHub n'annule jamais un calcul en cours et les artefacts v9
restent immuables et réutilisables après une interruption.

N’augmentez le budget qu’après validation du pilote et contrôle du stockage :

```powershell
.\scripts\windows-science-worker.ps1 ingest-m31 -MaxFiles 100 -MaxGiB 8
```
