# Sky science worker

Conteneur CPU isolé chargé de la qualification WCS, des métriques SEP, du
stacking, du clustering Cosmos Live et de la publication des tuiles dérivées.

Il requiert `DATABASE_URL`, `SUPABASE_URL` et `SUPABASE_SECRET_KEY`. L’image
embarque les index Astrometry.net 2MASS 4204–4219, couvrant les champs
d’environ 8 minutes d’arc à 33 degrés. Un disque persistant monté sous
`/var/data` fournit l’espace temporaire des traitements volumineux.
Les originaux sont obtenus avec des URL signées de courte durée et ne sont
jamais journalisés.
