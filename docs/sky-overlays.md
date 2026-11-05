# Couches de la mosaïque céleste

## Utilisation

Ouvrir `/mosaic`, puis **Couches & catalogues** dans l’en-tête de la carte principale.
Le panneau **Couches du ciel** est visible à droite sur grand écran et sous la carte
sur mobile. Chaque case active ou masque uniquement sa propre couche. Les couleurs
du panneau correspondent aux repères de la carte. Un clic sur un objet ouvre ses
informations et ses coordonnées.

Les choix sont mémorisés dans le navigateur, séparément pour la carte principale
et pour la carte de comparaison. Un stockage local inaccessible n’empêche pas
l’utilisation des commandes.

| Groupe               | Couches                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| Catalogues           | Étoiles brillantes locales, Gaia DR3, SIMBAD, sources ponctuelles 2MASS            |
| Ciel profond         | Galaxies, nébuleuses, amas d’étoiles du catalogue local                            |
| Repères célestes     | Tracés et noms des constellations, grille équatoriale, plan galactique, écliptique |
| Comparaison d’images | Pan-STARRS, DESI, Euclid, HST, HST PHAT, DSS2, 2MASS, AllWISE, GALEX               |

Les images s’affichent au-dessus du fond avec une opacité réglable de 0 à 100 %.
**Aucune superposition** retire la comparaison sans effacer les étoiles ni modifier
le fond. Une image qui ne peut pas se charger laisse la précédente visible, avec
un message explicite et une commande pour réessayer.

Le panneau de comparaison externe est initialisé lors de sa première ouverture.
Le refermer conserve sa carte, sa position et ses préférences ; le rouvrir ne crée
pas une nouvelle instance du moteur.

## Étendue réelle des catalogues

Les étoiles brillantes et les objets locaux sont disponibles sur tout le ciel.
Ils constituent un catalogue fini, pas un recensement exhaustif de l’Univers.
Gaia, SIMBAD et 2MASS utilisent les catalogues HiPS progressifs officiels : la
densité de repères s’adapte au zoom. Le compteur indique les repères chargés,
pas le nombre total de sources du catalogue ni une garantie d’exhaustivité du champ.

Si le service HiPS ne répond pas, des recherches par champ prennent le relais :

| Catalogue | Service de secours                            | Limite                      |
| --------- | --------------------------------------------- | --------------------------- |
| Gaia DR3  | Heidelberg, via `/api/mosaic/stars`           | 650 repères, vue jusqu’à 8° |
| SIMBAD    | Miroir Harvard, via `/api/mosaic/catalog`     | 400 repères, vue jusqu’à 8° |
| 2MASS     | NASA/IPAC IRSA TAP, via `/api/mosaic/catalog` | 400 repères, vue jusqu’à 8° |

Le mode de secours est indiqué dans le panneau. Le zoom reste utilisable sous
0,02° : seul le champ envoyé au service est borné à 0,02°, sans modifier les
coordonnées des objets affichés. Les recherches SIMBAD/2MASS sont
limitées à un cône de rayon maximal de 2° ; elles ne couvrent donc pas nécessairement
les coins ou l’intégralité d’un champ large. La réponse contient toujours
`limited: true`. Les marqueurs locaux restent indépendants des services distants.

Les relevés photographiques ont leur propre couverture. Hubble et Euclid couvrent
des champs ciblés ; une région sans image n’est pas une preuve de panne. Les bandes
optiques, infrarouges et ultraviolettes restent identifiées séparément.

## Garanties d’intégration

- Le paquet Aladin Lite 3.8.2 est servi par l’application. La création d’un objet
  HiPS ne vaut pas confirmation de chargement : les métadonnées et l’attachement
  de la couche sont attendus avant de signaler le succès.
- Les fonds et superpositions ont des identifiants de cache distincts. Masquer une
  image ne peut pas mémoriser une opacité nulle pour un fond.
- Une nouvelle sélection annule le suivi de l’ancienne. Une réponse retardée ne
  doit ni réactiver une couche masquée ni remplacer le dernier choix de fond.
- Les raffinements Sky Map sont maintenus sous l’image de comparaison.
- Les popups échappent les valeurs des catalogues avant leur insertion dans le DOM.
- Les services de secours acceptent des catalogues fixes et des coordonnées
  numériques validées. Ils n’acceptent ni URL arbitraire ni requête ADQL fournie
  par le client. Les réponses sont bornées à 300 000 octets et les requêtes à
  12 secondes, avec propagation de l’annulation et cache public court.
- Aucune migration, nouveau secret ou modification des données scientifiques n’est
  nécessaire. Les images originales et les contributions AstroStack sont conservées.

## Vérification et exploitation

Les tests couvrent les annulations, les réponses tardives, le nettoyage individuel,
les modes de secours, les erreurs de métadonnées, l’échappement HTML, les sélections
successives du fond et les limites des requêtes.

```sh
npm run typecheck
npm run lint
npm run test:unit
VERCEL=1 npm run build
VERCEL=1 node scripts/verify-ssr-service.mjs
```

Le 5 novembre 2026, des appels réels au gestionnaire de secours ont renvoyé
239 sources SIMBAD près de M31 et quatre sources 2MASS près de
RA 66,769575°, Dec 26,104530°, avec un champ de 0,02°. Le serveur HiPS des catalogues
CDS n’était pas joignable depuis l’environnement de vérification.

Le navigateur de vérification disponible ne prend pas en charge WebGL2 ; il ne
permet donc pas de certifier visuellement le rendu GPU d’Aladin. La recette visuelle
doit vérifier, dans un navigateur compatible, l’apparition des marqueurs, le
déplacement/zoom, la sélection des objets, la transparence, le maintien de la
comparaison au-dessus des raffinements et la restauration des préférences.

Pour revenir à la version précédente, annuler le commit de fusion et laisser le
déploiement habituel reconstruire l’application. Aucun retour arrière de schéma
ou de données n’est requis.

## Références officielles

- [API Aladin Lite](https://cds-astro.github.io/aladin-lite/A.html)
- [Implémentation Aladin Lite](https://github.com/cds-astro/aladin-lite)
- [Registre des relevés HiPS](https://aladin.cds.unistra.fr/hips/list)
- [SIMBAD Harvard](https://simbad.harvard.edu/simbad/)
- [IRSA TAP](https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html)
