# Mosaïque collaborative de l’Univers — Spécification de conception

## 1. Vision

Construire une carte céleste mondiale alimentée par les astrophotographes. Les utilisateurs peuvent naviguer et zoomer sur toute la sphère céleste, voir les zones encore manquantes, contribuer des images scientifiquement qualifiées, gagner de l’expérience et devenir le premier contributeur affiché sur une zone.

La première version représente le ciel en 2D par coordonnées équatoriales ascension droite/déclinaison. Le modèle reste compatible avec une future vue 3D utilisant les distances lorsqu’elles sont connues.

## 2. Architecture spatiale

La conception combine :

- HEALPix NESTED pour l’indexation hiérarchique, équi-surfacique et multi-résolution ;
- une empreinte WCS exacte par image pour conserver la géométrie réellement observée ;
- PostGIS avec index GiST pour les recherches d’empreintes dans le champ visible ;
- des tuiles HiPS pour le rendu progressif du ciel.

HEALPix fournit une hiérarchie adaptée aux grands volumes et aux changements de zoom. HiPS est une recommandation IVOA fondée sur HEALPix pour le panoramique et le zoom multi-résolution : [IVOA HiPS 1.0](https://www.ivoa.net/documents/HiPS/) et [HEALPix Primer](https://healpix.sourceforge.io/doc/html/intro.htm).

## 3. Niveaux de contribution

| Classe | Ordre HEALPix | Taille indicative | Échantillonnage maximal | Focale indicative pour pixels de 4,3 µm | XP par nouvelle cellule |
|---|---:|---:|---:|---:|---:|
| Découverte | 6 | 55′ | 12″/pixel | 75 mm | 2 |
| Grand champ | 7 | 27′ | 6″/pixel | 150 mm | 5 |
| Détaillée | 8 | 14′ | 3″/pixel | 300 mm | 10 |
| Haute définition | 9 | 7′ | 1,5″/pixel | 600 mm | 20 |

La focale n’est qu’une indication pédagogique. La classe réelle provient de la solution WCS mesurée et de la résolution native. Un agrandissement logiciel ne change pas de classe.

Une même région peut donc avoir plusieurs pionniers, un par niveau de détail. Le nom visible au zoom courant correspond au pionnier de la cellule et de l’ordre affichés.

## 4. Qualification scientifique

Une contribution attribuable respecte toutes les contraintes suivantes :

- au moins 20 étoiles de référence appariées ;
- erreur WCS inférieure à 1,5 pixel ;
- au moins 70 % de la cellule couverte par des pixels exploitables ;
- FWHM stellaire inférieur à 2,5 fois l’échantillonnage théorique ;
- excentricité médiane inférieure à 0,65 ;
- absence de bougé majeur, nuage dense ou défaut de suivi invalidant ;
- moins de 2 % de pixels saturés et moins de 1 % de noirs écrêtés ;
- signal/bruit minimal adapté au filtre et au type d’objet ;
- métadonnées, provenance et licence complètes ;
- absence de doublon perceptuel ou binaire déjà récompensé.

Le score sur 100 est composé de : astrométrie 25, netteté/suivi 25, signal/bruit 20, dynamique 15, couverture 10, provenance 5. Il faut au moins 70/100 et aucun critère éliminatoire.

Les décisions automatisées sont explicables. Une contestation ouvre une revue humaine auditée, sans attribuer d’XP tant que la décision n’est pas finale.

## 5. Modèle de données

### 5.1 Tables existantes étendues

`astro_uploads` reste l’entité source et reçoit :

- `content_hash` et `perceptual_hash` ;
- `license_code`, `license_url` et `attribution_text` ;
- `moderation_status`, `pipeline_version` et `quality_score` ;
- confidentialité de la localisation et préférence d’affichage du nom ;
- chemins séparés pour l’original privé, l’aperçu et les dérivés.

`astro_objects` et `astro_masters` restent compatibles avec les mosaïques par objet déjà prévues.

### 5.2 Nouvelles tables

- `astrometric_solutions` : solution WCS versionnée, centre, rotation, échelle, erreur, confiance et empreinte PostGIS.
- `astro_upload_cells` : upload, ordre HEALPix, index NESTED, fraction couverte, classe de qualité et décision.
- `sky_coverage_cells` : ordre/index, premier upload, premier utilisateur, date d’attribution et meilleur niveau publié.
- `xp_ledger` : événement immuable, utilisateur, type, points, sujet et clé d’idempotence unique.
- `mosaic_tiles` : ordre HiPS, index de tuile, version, URL, checksum et état de publication.
- `moderation_events` : acteur, décision, raison, version de métriques et horodatage.
- `processing_jobs` : étape, tentatives, prochaine exécution, erreur structurée et identifiant d’idempotence.

Toutes les tables exposées ont RLS activée. Les vues publiques utilisent `security_invoker = true` ou des fonctions explicitement sécurisées.

## 6. Attribution atomique et XP

L’attribution s’exécute uniquement après validation finale par un worker de confiance :

1. Le worker ouvre une transaction.
2. Il insère les cellules éligibles avec `ON CONFLICT DO NOTHING` sur `(healpix_order, healpix_index)`.
3. Les lignes effectivement insérées déterminent les nouvelles zones pionnières.
4. Il crée un événement `xp_ledger` par cellule avec une clé d’idempotence dérivée de l’upload, de l’ordre et de l’index.
5. Il plafonne la récompense à 500 XP par image validée tout en conservant toutes les attributions pionnières.
6. Il publie un événement temps réel après commit.

Aucun compteur XP n’est directement modifiable par le client. Le total est une agrégation du registre ou une projection serveur reconstruisible.

## 7. Sécurité et confidentialité

- Les originaux restent dans un bucket privé organisé par identifiant utilisateur.
- Les uploads volumineux utilisent TUS et l’hôte Storage direct.
- Les aperçus et tuiles deviennent publics uniquement après validation.
- Les RLS Storage limitent insertion, lecture, mise à jour et suppression au propriétaire ou au service de traitement autorisé.
- La clé `service_role` n’apparaît jamais dans le navigateur.
- Le statut de validation, les cellules, l’XP et les tuiles ne sont modifiables que par le pipeline serveur.
- La localisation d’acquisition précise est privée par défaut et peut être arrondie ou masquée.
- L’utilisateur choisit entre son nom public et « Contributeur anonyme » pour l’affichage cartographique.
- Une licence explicite compatible avec la mosaïque est obligatoire.

## 8. Expérience utilisateur validée

L’interface est un « Observatoire adaptatif » :

- mode Découverte immersif et peu chargé ;
- mode Expert avec couches, coordonnées, résolution, métriques et télémétrie ;
- carte centrale zoomable ;
- couches de couverture par niveau de détail ;
- zones libres en ambre, couvertes en cyan, en validation en violet et contestées avec un motif distinct ;
- panneau de cellule montrant coordonnées, équipement indicatif, seuils et récompense ;
- nom du pionnier affiché sur la zone couverte ;
- accessibilité clavier, contrastes AA et réduction des animations.

## 9. Parcours de contribution validé

1. Choisir une mission ou une zone libre.
2. Importer FITS, TIFF 16/32 bits ou RAW par transfert reprenable.
3. Vérifier les métadonnées extraites : instrument, caméra, focale, filtre, pose, licence et visibilité.
4. Lancer la qualification scientifique.
5. Prévisualiser l’empreinte, le score et les cellules potentiellement nouvelles.
6. Recevoir le résultat final : cellules pionnières, cellules déjà couvertes, XP et rapport de qualité.

## 10. Gestion des erreurs

- Upload interrompu : reprise TUS.
- WCS impossible : brouillon conservé, aucune publication ni récompense.
- Qualité insuffisante : rapport détaillé et nouvelle soumission possible.
- Doublon : aucun XP supplémentaire.
- Course entre contributeurs : un seul pionnier transactionnel ; le perdant garde les autres nouvelles cellules.
- Pipeline indisponible : job réessayé avec backoff et file d’erreurs après épuisement.
- Tuile absente : repli sur un ordre inférieur.
- Image retirée : mosaïque recalculée ; attribution historique anonymisable et audit conservé.

## 11. Critères d’acceptation

- L’utilisateur peut zoomer de la vue globale à la haute définition sans rupture de navigation.
- Les zones non quadrillées sont visibles pour chaque couche de résolution.
- Une image validée produit une empreinte, des cellules et des tuiles consultables.
- Deux validations concurrentes ne produisent jamais deux pionniers pour la même cellule et le même ordre.
- Le premier contributeur ou son choix anonyme apparaît sur la cellule.
- Les XP sont exacts, plafonnés, idempotents et reconstruisibles.
- Un utilisateur ne peut ni s’attribuer une cellule ni modifier son XP depuis le client.
- Les originaux privés ne sont pas accessibles à un autre utilisateur.
