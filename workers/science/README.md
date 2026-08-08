# Sky science worker

Conteneur CPU isolé chargé de la qualification WCS, des métriques SEP, du
stacking, du clustering Cosmos Live et de la publication des tuiles dérivées.

Il requiert `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` et un jeu
d’index Astrometry.net monté en lecture seule sous `/usr/share/astrometry`.
Les originaux sont obtenus avec des URL signées de courte durée et ne sont
jamais journalisés.
