#CarteduCiel—planétariumweb

Unclonewebdel'app"Carteduciel":unecarteducielinteractiveentempsréel,centréesurlesobjetsréellementobservablesauxjumellesetautélescopeamateur.

##Écrans

**/—Lacarteduciel(écranprincipal)**
Vuepleinécranducielau-dessusdevotreposition,avec:
-Étoilesbrillantes(magnitude<5)ettracésdesconstellations
-Soleil,Lune(avecsaphase)etlesplanètesvisibles
-Objetsducielprofond:nébuleuses(Orion,Lagune,Anneau…),galaxies(Andromède,Tourbillon…),amas(Pléiades,Hercule,Ruche)—lecatalogueMessierplusquelquesCaldwellnotables
-Horizon,pointscardinaux,zénith,lignedel'écliptique
-Navigation:glisserpourpivoter,molette/pincementpourzoomer,plusunmodeboussolesurmobilequisuitl'orientationdutéléphone
-Curseurtemporel:avancer/reculerl'heure,revenirà«maintenant»
-Modenuit(rouge)pourl'observationsurleterrain

**Ficheobjet(panneauauclicsurunobjet)**
Nom,type,magnitude,distance,constellation,hauteurau-dessusdel'horizon,heuredelever/coucher,instrumentconseillé(œilnu/jumelles/petittélescope),courtedescription,etboutonfavori.

**/objets—Catalogue**
Listefiltrable(type,instrument,visiblemaintenant)avecrecherche;cliquercentrelacartesurl'objet.

**/ce-soir—Cesoir**
Sélectiondesmeilleursobjetsobservablescettenuitdepuisvotrelieu,classésparfacilité,pluslaphaselunaireetlesheuresdecrépuscule.

**/moi—Moncompte**
Lieuxenregistrés,objetsfavoris,journald'observationsimple(objet,date,note).

**/auth—Connexion**
E-mail/motdepasse+Google.

##Design

Interfacesombreastronomique:noirprofondbleuté,étoilesblanc-bleu,accentsambrepourlesobjetssélectionnés,typographiefineettechnique,chromeminimalensurimpressionsurleciel.Modenuitenrougemonochrome.Pasdedégradésvioletsgénériques.

##Détailstechniques

-RenduducielenCanvas2Davecprojectionstéréographiqueazimut/hauteur;boucled'animationàlaposition/heurecourante.
-Calculsastronomiquesréelscôtéclient:tempssidéral,conversionéquatorial→horizontal,positionsduSoleil/Lune/planètesparélémentsorbitauxVSOPsimplifiés,phaselunaire,lever/coucher/crépuscule.
-CataloguesembarquésenJSONstatiquedans`src/data/`:~500étoilesbrillantes(Hipparcosréduit),lignesdeconstellations,110objetsMessier+Caldwellsélectionnésavecmagnitude,tailleapparenteetinstrumentconseillé.Aucunappelréseaunécessairepourlacarte.
-Position:`navigator.geolocation`avecreplisurunesaisiemanuelledeville/coordonnées,mémoriséelocalementpuissynchroniséeaucompte.
-Boussole:`DeviceOrientationEvent`avecdemandedepermissioniOS;interactionmolette/pincementaveczoomancrésurlecurseuretlistener`wheel`nonpassif.
-BackendLovableCloud:authentification(e-mail/motdepasse+Google)ettables`profiles`,`saved_locations`,`favorites`,`observations`,toutesprotégéesparRLSscopéesà`auth.uid()`,aveclesGRANTnécessaires.Lecture/écritureviaserverfunctionsauthentifiées.
-RoutesséparéesavecmétadonnéesSEOpropresàchacune.

##Étapes

1.ActivationdeLovableCloud,schéma+RLS,écrand'authentification.
2.Moteurastronomiqueetcataloguesdedonnées.
3.Carteducielencanvas:rendu,navigation,zoom,boussole,curseurtemporel.
4.Ficheobjet,cataloguefiltrable,page«Cesoir».
5.Compte:lieux,favoris,journald'observation,modenuit.
