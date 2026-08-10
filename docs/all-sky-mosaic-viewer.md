# Viewer de mosaïque tout-ciel

## Contrat visuel

La page `/mosaic` représente désormais la sphère céleste complète et ne dépend pas du catalogue `astro_objects` pour autoriser la navigation.

- Une cellule HEALPix sans tuile Sky Map active est rendue en rouge sombre.
- Une cellule HEALPix couverte est rendue avec la meilleure tuile WebP d'une génération actuellement activée.
- Le pan et le zoom restent libres sur toutes les coordonnées ICRS.
- La projection Aitoff est la vue initiale tout-ciel ; une projection SIN reste disponible pour l'exploration locale.

## HiPS virtuel global

Le endpoint `/api/mosaic/hips/*` expose un HiPS virtuel au-dessus des générations Sky Map existantes :

1. `properties` décrit le survey global.
2. Chaque requête `Norder.../Dir.../Npix....webp` est validée strictement.
3. Pour les ordres 6 à 9, le serveur résout la meilleure tuile active à cette cellule sans dépendre d'un objet sélectionné.
4. Si aucune tuile active n'existe, le serveur renvoie une tuile rouge WebP.
5. Une tuile couverte est servie par redirection vers l'objet immuable du bucket `astro-derived`.

Le fallback rouge utilise un cache court afin qu'une cellule nouvellement couverte remplace rapidement l'état « non couvert ». Les vraies tuiles restent stockées sous leurs chemins de génération immuables.

## Limite actuelle

Le publisher scientifique v9 produit actuellement ses niveaux photographiques à partir de l'ordre HEALPix 6. Les ordres 0 à 5 restent donc rouges dans le HiPS global. À ces échelles très larges, les champs actuels sont extrêmement petits ; une phase ultérieure doit générer les parents tout-ciel et `Allsky` pour rendre les petites zones couvertes visibles même au zoom maximal arrière.

Cette limite n'empêche pas la navigation sur le ciel entier ni l'affichage des photographies lorsque le niveau HEALPix correspondant à une génération publiée est atteint.
