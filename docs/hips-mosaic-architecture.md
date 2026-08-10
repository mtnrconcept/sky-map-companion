# Architecture de mosaïque HiPS fédérée

## Objectif

La mosaïque Sky Map Companion doit se comporter comme un atlas scientifique moderne : déplacement libre, zoom continu et remplacement progressif des tuiles par des niveaux de résolution plus fins sans recharger une image monolithique.

Le format de diffusion cible est **HiPS (Hierarchical Progressive Surveys)** sur HEALPix. La couche de couverture associée est un **MOC (Multi-Order Coverage map)**. Le client de référence est **Aladin Lite v3**, chargé dans l'application avec une version fixe.

L'architecture sépare deux usages :

1. **fédération directe** : afficher un HiPS public sans recopier les données ;
2. **ingestion scientifique** : découvrir des FITS via des protocoles IVOA, les qualifier, puis publier les produits retenus dans notre propre HiPS versionné.

## HiPS publics affichés directement

| Priorité | Survey | Identifiant HiPS CDS | Usage |
| --- | --- | --- | --- |
| 1 | Pan-STARRS DR1 couleur | `CDS/P/PanSTARRS/DR1/color-i-r-g` | fond optique haute résolution, notamment M31 |
| 1 | Euclid Q1 couleur | `CDS/P/Euclid/Q1/color` | champs Euclid très profonds |
| 2 | DSS2 couleur | `CDS/P/DSS2/color` | secours optique quasi tout-ciel |
| 2 | 2MASS couleur | `CDS/P/2MASS/color` | proche infrarouge tout-ciel |
| 2 | AllWISE couleur | `CDS/P/allWISE/color` | infrarouge tout-ciel |
| 3 | GALEX GR6/7 couleur | `CDS/P/GALEXGR6_7/color` | ultraviolet |

Ces couches ne sont pas dupliquées dans Supabase. Elles sont demandées directement au réseau HiPS et restent identifiées comme couches externes.

## Archives à ingérer dans notre mosaïque

### 1. ESO Science Archive — priorité maximale

- Protocole de découverte : **TAP / ADQL**.
- Endpoint : `https://archive.eso.org/tap_obs`.
- Tables principales : `ivoa.ObsCore` pour les produits réduits et `dbo.raw` pour les données brutes.
- Relations/calibrations : **DataLink** `https://archive.eso.org/datalink` et calSelector.
- Découpes : **SODA** `https://dataportal.eso.org/dataPortal/soda`.
- Politique : l'ESO autorise la redistribution de ses données RAW et processed sous CC BY 4.0 sous réserve d'attribution et de conservation de la provenance/headers.

**Décision :** premier connecteur complet à implémenter. Les produits calibrés image sont privilégiés pour le fond de mosaïque ; les RAW et calibrations servent aux pipelines spécialisés lorsque leur valeur dépasse le produit déjà réduit.

### 2. MAST — Hubble, JWST et missions STScI

- Protocole principal : **CAOM SIAv2**.
- Endpoint : `https://mast.stsci.edu/vo-sia/api/v0.1/query`.
- Recherche spatiale : `POS=CIRCLE ...`, collection par mission (`HST`, `JWST`, etc.).
- Téléchargement : `access_url` retournée par SIAv2 / services MAST.

**Décision :** deuxième connecteur d'ingestion. Les droits doivent être validés par collection/produit avant réhébergement. Le fait qu'un produit soit publiquement téléchargeable ne suffit pas à lui attribuer automatiquement une licence de redistribution uniforme.

### 3. NASA/IPAC IRSA

- Protocole principal : **SIA v2**.
- Endpoint : `https://irsa.ipac.caltech.edu/SIA`.
- Contraintes utiles : `POS`, `COLLECTION`, `CALIB`, `BAND`, `DPTYPE`, `TIME`, `SPATRES`.
- Exemples de collections utiles : `wise_allwise`, `twomass_allsky`, Spitzer et produits Euclid lorsque disponibles via SIA2.
- TAP IRSA est utilisé pour les catalogues et les requêtes relationnelles complexes.

**Décision :** troisième connecteur. Pour les grands relevés déjà disponibles en HiPS, préférer l'affichage fédéré. Ingestion uniquement pour les FITS nécessaires au composite propriétaire ou aux zones où la couche Sky Map doit dépasser la référence existante.

### 4. NOIRLab Astro Data Lab

- Protocole images : **SIA**.
- Endpoint général des images calibrées : `https://datalab.noirlab.edu/sia/calibrated_all`.
- TAP/SCS pour les catalogues.

**Décision :** quatrième connecteur. Les conditions d'utilisation et d'attribution sont enregistrées au niveau du dataset avant tout réhébergement automatique.

### 5. Gaia

Gaia est utilisé comme **catalogue astrométrique/photométrique progressif**, pas comme fond d'image. Les étoiles Gaia servent à la résolution astrométrique, au contrôle photométrique et aux overlays. À grande échelle, préférer un catalogue HiPS/HATS ou TAP plutôt que recopier des milliards de lignes dans le client.

### 6. NASA PDS

PDS est reporté à une couche « Système solaire ». Les objets mobiles, surfaces planétaires et géométries de mission ne doivent pas être mélangés au pipeline statique ICRS de la mosaïque extragalactique.

## Modèle interne normalisé

Chaque résultat externe doit être converti vers un contrat de type ObsCore avant téléchargement :

- `provider_id`
- `collection_id`
- `provider_record_id`
- `access_url`
- `access_format`
- `rights_uri`
- `attribution_text`
- `redistribution_allowed`
- `dataproduct_type`
- `calibration_level`
- `ra_deg`, `dec_deg`, `footprint`
- `spatial_resolution_arcsec`
- `em_min_m`, `em_max_m`, `filter_name`
- `observed_at`, `exposure_s`
- `facility`, `instrument`
- `content_sha256`
- `provenance`

Aucune donnée externe ne rejoint la mosaïque scientifique sans provenance et politique de droits explicites.

## Pipeline cible

```text
HiPS publics ---------------------------> Viewer Aladin (lecture directe)
                                             |
ESO TAP/DataLink/SODA ----\                 |
MAST SIAv2 ---------------+--> normalisation ObsCore
IRSA SIA2 ----------------+--> droits/provenance
NOIRLab SIA --------------/--> sélection spatiale
                              |
                              v
                         FITS candidats
                              |
                    qualification scientifique
                              |
              astrométrie / SNR / FWHM / couverture
                              |
                 rejet ou inventaire qualifié
                              |
                    coadd / amélioration locale
                              |
                 génération HiPS propriétaire
                  FITS + PNG + MOC + Allsky
                              |
                              v
                  Sky Map HiPS versionné
                              |
                  Viewer Aladin + CDN/cache
```

## HiPS propriétaire Sky Map

Le répertoire actuel `hips/<layer>/<generation>/Norder...` est HiPS-like mais doit devenir un HiPS IVOA complet. Une génération publiée doit contenir au minimum :

- `properties` ;
- `Moc.fits` ;
- les répertoires `Norder.../Dir.../Npix...` ;
- les niveaux parents permettant le zoom progressif ;
- `Allsky` pour les vues larges ;
- des tuiles **FITS** pour la donnée scientifique ;
- des tuiles **PNG** de visualisation avec transparence pour le composite ;
- un manifeste Sky Map séparé contenant checksums, génération et provenance des contributions.

Le générateur recommandé est **CDS Hipsgen**, épinglé à une version et un SHA-256 vérifiés. Son mode `APPEND`/incrémental et les weight tiles permettent d'étendre progressivement le survey sans reconstruire tout le ciel à chaque contribution. Une génération est préparée sous un préfixe immuable puis activée atomiquement après validation (`Hipsgen LINT`, MOC, nombre de tuiles, checksums).

## Fusion avec les astrophotographes amateurs

Les archives publiques forment la **référence scientifique**. Les amateurs ne sont pas écrasés dans cette référence : ils constituent une couche de contribution traçable.

Pour chaque cellule/région, une contribution amateur peut devenir préférée si :

1. elle passe tous les critères d'acceptation actuels ;
2. sa résolution effective est meilleure que la référence disponible ;
3. son astrométrie est vérifiée ;
4. son score qualité dépasse le seuil de publication ;
5. la licence autorise l'usage dans la mosaïque ;
6. le gain est mesurable (résolution, SNR, profondeur ou bande spectrale) ;
7. la provenance reste accessible jusqu'aux fichiers sources.

Les bandes incompatibles ne sont jamais mélangées aveuglément. On maintient des couches séparées (optique couleur, Hα, OIII, SII, UV, proche IR, IR) puis le viewer choisit un composite adapté.

## Performance

- Le client ne demande plus une liste de milliers de cellules à chaque zoom.
- Aladin choisit automatiquement le niveau HiPS correspondant au champ visible.
- Les URLs de générations Sky Map sont immuables et fortement cacheables par CDN.
- Le MOC permet de savoir immédiatement où une couche possède des données.
- Les changements de RA/Dec et de FoV servent aux overlays et à la découverte asynchrone, pas au rendu de chaque tuile.
- Les catalogues massifs utilisent HiPS/HATS ou TAP côté serveur.

## Phases de livraison

### Phase A — viewer fédéré

- Aladin Lite v3 épinglé ;
- Pan-STARRS, Euclid, DSS2, 2MASS, AllWISE, GALEX ;
- pan/zoom natif WebGL ;
- coordonnées et FoV live.

### Phase B — ingestion multi-archives

- adaptateur ESO TAP/DataLink/SODA ;
- adaptateur MAST SIAv2 ;
- adaptateur IRSA SIA2 ;
- adaptateur NOIRLab SIA ;
- déduplication par identifiant fournisseur + checksum ;
- droits et provenance obligatoires.

### Phase C — HiPS Sky Map IVOA

- Hipsgen déterministe et versionné ;
- FITS + PNG ;
- MOC + Allsky ;
- activation atomique ;
- exposition HTTP/CDN comme survey privé compatible Aladin.

### Phase D — amélioration communautaire

- sélection automatique des régions où une contribution amateur apporte un gain ;
- coadd multi-contributeurs ;
- historique de versions ;
- provenance et attribution consultables depuis une position de la mosaïque.
