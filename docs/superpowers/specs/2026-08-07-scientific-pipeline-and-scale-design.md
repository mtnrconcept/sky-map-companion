# Pipeline scientifique et montée en charge — Spécification de conception

## 1. Objectif

Transformer les contributions brutes en produits célestes fiables, reproductibles et diffusables à l’échelle mondiale. Ce sous-projet industrialise la qualification, la fabrication HiPS, la modération, l’observabilité et la capacité de traitement.

## 2. Frontières du système

### Application React/TanStack

- sélection de mission et navigation ;
- upload reprenable ;
- édition des métadonnées non extractibles ;
- suivi de traitement en temps réel ;
- affichage HiPS, couverture, pionniers et profils.

### Supabase

- Auth et profils ;
- PostgreSQL, RLS et registre transactionnel ;
- Storage pour originaux et dérivés ;
- Realtime pour l’état des jobs et les nouvelles attributions ;
- fonctions légères d’orchestration et de validation d’accès.

### Worker scientifique isolé

Les opérations lourdes ne s’exécutent pas dans une fonction Edge courte :

- lecture FITS/RAW et extraction des en-têtes ;
- résolution astrométrique ;
- calcul FWHM, excentricité, saturation, bruit, gradient et masque exploitable ;
- génération de l’empreinte WCS ;
- reprojection et assemblage ;
- génération des tuiles HiPS ;
- checksum et publication des dérivés.

Le worker utilise des identifiants de job et des sorties déterministes. Il ne reçoit qu’un accès temporaire et limité aux objets nécessaires.

## 3. Machine à états

`uploaded → extracting → solving → qualifying → awaiting_review → approved → tiling → published`

États terminaux alternatifs : `rejected`, `duplicate`, `failed`. `failed` reste rejouable après correction ; `rejected` et `duplicate` exigent une nouvelle version ou une revue.

Chaque transition est conditionnelle sur l’état précédent. Une transition répétée avec la même clé d’idempotence renvoie le résultat existant.

## 4. File de traitement

- `processing_jobs` est dans un schéma privé.
- Les jobs sont réclamés avec verrouillage évitant le double traitement.
- Chaque étape possède un nombre maximal de tentatives et un backoff exponentiel borné.
- Après épuisement, le job passe dans une file d’erreurs inspectable.
- Les opérations longues émettent une progression structurée.
- Un watchdog remet en file les jobs dont le lease a expiré.
- La priorité favorise les missions contenant des zones encore vides sans affamer les autres contributions.

## 5. Production HiPS

HiPS est le format de diffusion principal : arborescence directe, tuiles HEALPix et ordres progressifs. Il permet le panoramique et le zoom sans charger la mosaïque entière.

Le pipeline :

1. reprojette l’image validée dans le repère céleste cible ;
2. applique un masque de pixels exploitables ;
3. produit les tuiles aux ordres admissibles ;
4. fusionne avec la génération courante selon une recette versionnée ;
5. écrit vers un nouveau chemin immuable ;
6. vérifie checksum et dimensions ;
7. bascule atomiquement le manifeste de génération.

Les chemins de tuiles sont immuables pour éviter les incohérences CDN. Une génération précédente reste disponible pendant le déploiement de la suivante.

Le renderer conserve `SkyCanvas` comme intégration React. L’utilisation éventuelle d’Aladin Lite doit faire l’objet d’une revue de licence ; le protocole HiPS reste indépendant du renderer.

## 6. Fusion scientifique

La mosaïque publique ne remplace pas les originaux. Chaque tuile conserve sa provenance : uploads, poids, version du pipeline et date.

Les règles de fusion tiennent compte de :

- résolution angulaire et PSF ;
- signal/bruit ;
- transparence du ciel et gradient ;
- filtre et bande spectrale ;
- calibration photométrique ;
- dynamique et saturation ;
- recouvrement avec les tuiles voisines.

Les bandes incompatibles ne sont pas mélangées silencieusement. Elles deviennent des couches distinctes ou passent par une recette explicitement versionnée.

## 7. Modération et droits

- Validation automatique pour les contributions respectant tous les seuils à haute confiance.
- Revue humaine obligatoire pour les cas limites, conflits de licence, anomalies et signalements.
- Historique append-only des décisions.
- Possibilité de retirer rapidement une dérivée publique tout en conservant les éléments d’audit nécessaires.
- Traçabilité de la licence jusqu’à chaque tuile et export d’attributions.
- Outils anti-abus : hash, similarité perceptuelle, limites de débit, réputation et détection de métadonnées incohérentes.

## 8. Observabilité

Mesures minimales :

- taille, débit et taux d’échec des uploads ;
- latence par étape du pipeline ;
- taux de résolution WCS ;
- distribution des scores qualité ;
- files actives, leases expirés et dead letters ;
- cellules nouvellement couvertes par ordre ;
- temps de génération et poids des tuiles ;
- erreurs de rendu et taux de repli vers un ordre inférieur ;
- coût de stockage et d’egress par génération.

Les logs sont corrélés par `upload_id`, `job_id` et `pipeline_version`, sans secret ni localisation privée précise.

## 9. Tests et performances

### Tests fonctionnels

- fixtures FITS valides, corrompues, sans WCS, saturées, floues et dupliquées ;
- golden files pour les empreintes et tuiles ;
- tests de version de recette ;
- tests de reprise après crash à chaque transition ;
- tests de retrait et reconstruction de génération.

### Tests de charge

- milliers de cellules dans un viewport ;
- uploads parallèles volumineux ;
- rafales de validations concurrentes ;
- génération partielle puis bascule de manifeste ;
- cache chaud et cache froid ;
- comportement mobile et réseau lent.

Objectifs initiaux : interaction cartographique fluide à 60 FPS sur machine de référence, première tuile utile sous 2,5 secondes sur connexion mobile correcte et requête de couverture visible sous 300 ms au 95e percentile, hors incident fournisseur.

## 10. Déploiement progressif

1. Mode privé avec fixtures et comptes internes.
2. Bêta sur une région céleste et un niveau de résolution.
3. Ouverture aux astrophotographes approuvés.
4. Extension des ordres et automatisation accrue de la modération.
5. Ouverture mondiale avec quotas dynamiques et capacité horizontale.

Chaque étape est contrôlée par feature flag côté serveur et peut revenir à la génération HiPS précédente sans supprimer les contributions.

## 11. Critères d’acceptation

- Le pipeline peut reprendre après une interruption sans double attribution ni double XP.
- Chaque produit publié est relié à ses sources et à une version de recette.
- Une génération incomplète n’est jamais exposée comme courante.
- Les tuiles se chargent progressivement et se replient proprement.
- Les métriques permettent d’identifier un blocage ou une régression de qualité.
- Le retrait d’une image déclenche une reconstruction sûre des dérivés concernés.
- La montée en charge n’affaiblit ni RLS, ni confidentialité, ni idempotence.
