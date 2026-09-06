# Viewer de mosaïque tout-ciel

## Contrat visuel

La page `/mosaic` représente la sphère céleste complète et ne dépend pas du catalogue `astro_objects` pour autoriser la navigation.

- Le fond n'est plus une couleur « non couverte » : une référence HiPS publique fournit toujours le contexte céleste.
- La référence de base est 2MASS, puis des HiPS optiques/profonds sont superposés par priorité lorsque leurs tuiles existent : DESI Legacy Surveys, Pan-STARRS, Euclid, HST et HST PHAT.
- Les HiPS externes restent servis par leurs producteurs/CDS. Ils ne sont jamais recopiés dans Supabase Storage.
- Les publications Sky Map sont des overlays distincts au-dessus de ces références. L'utilisateur peut les masquer pour comparer directement le gain apporté par Sky Map.
- Le pan et le zoom restent libres sur toutes les coordonnées ICRS.
- La projection Aitoff est la vue initiale tout-ciel ; une projection SIN reste disponible pour l'exploration locale.

## Pyramide fédérée de référence

Le frontend Aladin Lite compose une pile déterministe :

1. `CDS/P/2MASS/color` garantit une couverture tout-ciel.
2. `CDS/P/DESI-Legacy-Surveys/DR10/color` ajoute une référence optique large jusqu'à N11.
3. `CDS/P/PanSTARRS/DR1/color-i-r-g` ajoute Pan-STARRS jusqu'à N11 là où il est disponible.
4. `CDS/P/Euclid/Q1/color` ajoute les champs Euclid Q1 jusqu'à N13.
5. `CDS/P/HST/color` ajoute les champs HST jusqu'à N13.
6. `CDS/P/HST/PHAT/color` ajoute le relevé profond PHAT de M31 jusqu'à N14.

Une indisponibilité d'un HiPS externe ne fait pas tomber la carte : les autres références restent utilisables. Cette pile est une composition de visualisation ; elle ne mélange pas les pixels scientifiques ni les bandes spectrales dans les FITS Sky Map.

## Raffinement Sky Map

Deux publications propriétaires et immuables peuvent être affichées au-dessus des références :

- `hips-ivoa/public-optical-r/current.json` : produit standard, actuellement construit à N9 pour la couverture optique `r` validée ;
- `hips-ivoa/public-optical-r-deep/current.json` : produit Deep facultatif, construit uniquement à partir de sources dont l'échelle de pixel astrométrique native est suffisamment fine.

Le frontend accepte les ordres HiPS standards jusqu'à N29 afin de ne plus bloquer artificiellement une publication future. Le worker impose cependant un plafond opérationnel beaucoup plus prudent au profil Deep : N10 à N14.

Le profil Deep choisit automatiquement le premier ordre dont l'échelle angulaire de pixel HiPS est au moins aussi fine que la meilleure source admissible, puis plafonne à N14. Il ne transforme donc pas une image grossière en faux détail par simple sur-échantillonnage.

## Sélection des nouvelles images publiques

L'ingestion continue d'utiliser les APIs officielles des archives MAST, IRSA, ESO et NOIRLab et respecte les règles de redistribution enregistrées dans le projet.

Avant de consommer le quota de téléchargement et de Storage, les candidats redistribuables encore inconnus sont maintenant classés par la politique `quality-v1` :

1. produit scientifiquement calibré (`calibration_level >= 2`) ;
2. résolution angulaire connue ;
3. résolution angulaire la plus fine ;
4. niveau de calibration le plus élevé ;
5. temps d'exposition le plus long ;
6. identifiant d'archive comme dernier départage déterministe.

Cette priorité ne remplace pas la qualification réelle du worker : WCS, FWHM, SNR, saturation, couverture utile, licence, provenance et déduplication continuent d'être contrôlés après téléchargement.

## Qualité et traçabilité

La migration `20260907003000_federated_hips_reference_registry.sql` ajoute :

- `hips_reference_surveys`, registre des références fédérées et de leur politique d'utilisation ;
- `mosaic_quality_decisions`, journal privé destiné aux futures décisions `promote`, `retain`, `reject` ou `needs_review` par région et rôle spectral ;
- l'index manquant sur `mosaic_layers.current_generation_id` pour les bascules atomiques de génération.

Les références externes sont marquées `federate-only` et `ingestion_allowed=false` : leur présence dans le viewer n'autorise pas la copie de leurs tuiles dans Sky Map.

## Rétention Storage

Le workflow `Prune obsolete Sky Map HiPS storage` applique la même politique aux profils `standard` et `deep` :

- conserver la génération active ;
- conserver une génération complète précédente pour rollback ;
- conserver toute génération de moins de 24 heures ;
- supprimer uniquement des générations immuables devenues obsolètes ;
- supprimer exclusivement via l'API Storage, par lots bornés.

L'absence de `current.json` pour le profil Deep est un état normal tant qu'aucune source assez fine n'a encore permis une première publication ; la rétention est alors un no-op.

## Limite volontaire de cette étape

La publication HiPS propriétaire reconstruit encore l'inventaire admissible du profil lorsqu'il change. La prochaine optimisation structurelle est un builder persistant utilisant les mécanismes incrémentaux de Hipsgen sur les seules régions impactées, avec comparaison scientifique avant promotion. Cette optimisation doit rester séparée du rendu fédéré : elle ne doit jamais conduire à recopier les HiPS CDS ni à publier une source dont le gain de qualité n'est pas mesuré.
