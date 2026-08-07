# Carte du Ciel — planétarium web

Un clone web de l'app "Carte du ciel" : une carte du ciel interactive en temps réel, centrée sur les objets réellement observables aux jumelles et au télescope amateur.

## Écrans

**/ — La carte du ciel (écran principal)**
Vue plein écran du ciel au-dessus de votre position, avec :
- Étoiles brillantes (magnitude < 5) et tracés des constellations
- Soleil, Lune (avec sa phase) et les planètes visibles
- Objets du ciel profond : nébuleuses (Orion, Lagune, Anneau…), galaxies (Andromède, Tourbillon…), amas (Pléiades, Hercule, Ruche) — le catalogue Messier plus quelques Caldwell notables
- Horizon, points cardinaux, zénith, ligne de l'écliptique
- Navigation : glisser pour pivoter, molette/pincement pour zoomer, plus un mode boussole sur mobile qui suit l'orientation du téléphone
- Curseur temporel : avancer/reculer l'heure, revenir à « maintenant »
- Mode nuit (rouge) pour l'observation sur le terrain

**Fiche objet (panneau au clic sur un objet)**
Nom, type, magnitude, distance, constellation, hauteur au-dessus de l'horizon, heure de lever/coucher, instrument conseillé (œil nu / jumelles / petit télescope), courte description, et bouton favori.

**/objets — Catalogue**
Liste filtrable (type, instrument, visible maintenant) avec recherche ; cliquer centre la carte sur l'objet.

**/ce-soir — Ce soir**
Sélection des meilleurs objets observables cette nuit depuis votre lieu, classés par facilité, plus la phase lunaire et les heures de crépuscule.

**/moi — Mon compte**
Lieux enregistrés, objets favoris, journal d'observation simple (objet, date, note).

**/auth — Connexion**
E-mail/mot de passe + Google.

## Design

Interface sombre astronomique : noir profond bleuté, étoiles blanc-bleu, accents ambre pour les objets sélectionnés, typographie fine et technique, chrome minimal en surimpression sur le ciel. Mode nuit en rouge monochrome. Pas de dégradés violets génériques.

## Détails techniques

- Rendu du ciel en Canvas 2D avec projection stéréographique azimut/hauteur ; boucle d'animation à la position/heure courante.
- Calculs astronomiques réels côté client : temps sidéral, conversion équatorial → horizontal, positions du Soleil/Lune/planètes par éléments orbitaux VSOP simplifiés, phase lunaire, lever/coucher/crépuscule.
- Catalogues embarqués en JSON statique dans `src/data/` : ~500 étoiles brillantes (Hipparcos réduit), lignes de constellations, 110 objets Messier + Caldwell sélectionnés avec magnitude, taille apparente et instrument conseillé. Aucun appel réseau nécessaire pour la carte.
- Position : `navigator.geolocation` avec repli sur une saisie manuelle de ville/coordonnées, mémorisée localement puis synchronisée au compte.
- Boussole : `DeviceOrientationEvent` avec demande de permission iOS ; interaction molette/pincement avec zoom ancré sur le curseur et listener `wheel` non passif.
- Backend Lovable Cloud : authentification (e-mail/mot de passe + Google) et tables `profiles`, `saved_locations`, `favorites`, `observations`, toutes protégées par RLS scopées à `auth.uid()`, avec les GRANT nécessaires. Lecture/écriture via server functions authentifiées.
- Routes séparées avec métadonnées SEO propres à chacune.

## Étapes

1. Activation de Lovable Cloud, schéma + RLS, écran d'authentification.
2. Moteur astronomique et catalogues de données.
3. Carte du ciel en canvas : rendu, navigation, zoom, boussole, curseur temporel.
4. Fiche objet, catalogue filtrable, page « Ce soir ».
5. Compte : lieux, favoris, journal d'observation, mode nuit.
