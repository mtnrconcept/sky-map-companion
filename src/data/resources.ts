// Données de la section Ressources (extraites de la page pour être partagées entre sous-pages).
export interface Tutorial {
  level: string;
  title: string;
  duration: string;
  gear: string;
  intro: string;
  steps: string[];
  settings: string;
  pitfalls: string[];
}

export const TUTORIALS: Tutorial[] = [
  {
    level: "Débutant",
    title: "Photographier la Lune au smartphone (méthode afocale)",
    duration: "30 min",
    gear: "Smartphone · télescope ou jumelles sur trépied · support smartphone (~30 €)",
    intro:
      "La Lune est l'objet le plus lumineux du ciel nocturne : aucune pose longue n'est nécessaire, et un simple téléphone posé derrière un oculaire donne déjà des images de cratères très nettes. L'ennemi n'est pas le manque de lumière mais la surexposition et les vibrations.",
    steps: [
      "Mettez le télescope au point à l'œil sur le bord (limbe) lunaire avec un oculaire de 20-25 mm : le bord doit être franc, sans liseré flou.",
      "Fixez le support smartphone sur l'oculaire, puis centrez l'objectif du téléphone exactement dans l'axe : si l'image est en tunnel sombre, décalez de quelques millimètres jusqu'à obtenir un disque plein.",
      "Passez l'appareil photo en mode Pro/Manuel. Verrouillez la mise au point sur l'infini (AF-L) et la balance des blancs sur lumière du jour (5200 K).",
      "Baissez l'exposition de 2 crans (-2 EV) : l'écran doit montrer une Lune grise détaillée, pas un disque blanc.",
      "Déclenchez avec le retardateur 3 s ou un écouteur filaire pour ne pas faire vibrer le tube.",
      "Prenez 30 à 50 photos d'affilée : la turbulence change à chaque instant, vous en garderez les 5 meilleures.",
      "Sur un ordinateur, recadrez, montez la clarté/microcontraste de 10-20 % et laissez la saturation basse. Évitez la netteté extrême qui crée un halo noir sur le limbe.",
    ],
    settings: "ISO 50-100 · 1/125 à 1/250 s · -2 EV · mise au point infini verrouillée · RAW si disponible",
    pitfalls: [
      "Photographier la pleine Lune : elle est plate, sans ombres. Préférez le premier ou dernier quartier.",
      "Zoom numérique du téléphone : dégrade l'image. Zoomez plutôt avec un oculaire plus court.",
      "Toucher le tube au déclenchement : utilisez toujours un retardateur.",
    ],
  },
  {
    level: "Débutant",
    title: "Premier ciel étoilé sur trépied : la règle des 500",
    duration: "1 h sur le terrain",
    gear: "Reflex/hybride · objectif grand-angle f/2.8 ou plus lumineux · trépied · télécommande",
    intro:
      "Sans suivi, la rotation de la Terre transforme les étoiles en petits traits au-delà d'une certaine durée de pose. La règle des 500 donne cette durée limite : 500 divisé par la focale équivalente 24×36.",
    steps: [
      "Calculez votre pose maximale : 500 / focale. À 20 mm plein format → 25 s. Sur APS-C, multipliez d'abord la focale par 1,5 (20 mm → 30 mm → 16 s). Sur micro 4/3, multipliez par 2.",
      "Réglez l'appareil en manuel, RAW, stabilisation désactivée (elle nuit sur trépied).",
      "Ouvrez au maximum, mais fermez d'un tiers de diaphragme si les étoiles des coins ont des ailes de mouette (coma).",
      "Mise au point : visez une étoile brillante en Live View, zoom numérique ×10, tournez la bague jusqu'à obtenir le point le plus petit possible. Scotchez ensuite la bague.",
      "ISO 1600 à 3200 pour commencer. Vérifiez l'histogramme : le pic doit être détaché du bord gauche, au premier tiers.",
      "Composez avec un premier plan (arbre, relief, cabane) : une photo de Voie lactée sans repère terrestre est vite monotone.",
      "Enchaînez 20 poses identiques + 20 poses objectif bouché (darks) : vous pourrez les empiler plus tard.",
    ],
    settings: "f/2.8 · ISO 1600-3200 · 15 à 25 s · RAW · balance des blancs 4000 K · stabilisation OFF",
    pitfalls: [
      "Autofocus en pleine nuit : il pompe et rate. Toujours en manuel.",
      "Pose trop longue « pour avoir plus de signal » : les étoiles s'allongent, l'image est irrécupérable.",
      "JPEG : impossible de rattraper la balance des blancs et le gradient. RAW obligatoire.",
    ],
  },
  {
    level: "Intermédiaire",
    title: "Empilement (stacking) : diviser le bruit par 10",
    duration: "2 h de prise de vue + 1 h de traitement",
    gear: "Appareil photo · Siril / DeepSkyStacker / Sequator (gratuits)",
    intro:
      "Le bruit d'une image décroît comme la racine carrée du nombre de poses empilées : 100 images bien alignées valent 10 fois moins de bruit qu'une seule. C'est la marche la plus rentable de toute l'astrophoto, et elle est gratuite.",
    steps: [
      "Lights : 50 à 200 poses de votre cible, toutes aux mêmes réglages, sans toucher la mise au point.",
      "Darks : 20 à 40 poses, même durée, même ISO, même température, objectif bouché. Elles retirent le signal thermique.",
      "Flats : 20 à 30 poses d'une surface uniforme (écran blanc à travers un tee-shirt, ciel crépusculaire), à même orientation de bague de mise au point. Elles corrigent le vignetage et les poussières.",
      "Offsets (bias) : 30 à 50 poses au temps le plus court possible, objectif bouché.",
      "Dans Siril, utilisez le script OSC_Preprocessing : il calibre, aligne et empile automatiquement.",
      "Sur le résultat linéaire, retirez le gradient (outil Extraction de fond ou GraXpert), puis calibrez la couleur avec la photométrie par étoiles.",
      "Étirez l'histogramme progressivement (transformation par arcsinus) plutôt qu'en une fois : les étoiles gardent leur couleur.",
    ],
    settings: "Darks + flats + offsets obligatoires · rejet Winsorized Sigma Clipping · empilement en 32 bits",
    pitfalls: [
      "Empiler sans flats : un halo sombre dans les coins qui résiste à tout traitement.",
      "Changer d'ISO en cours de séance : les darks ne correspondent plus.",
      "Étirer avant de retirer le gradient : la pollution lumineuse devient impossible à enlever.",
    ],
  },
  {
    level: "Intermédiaire",
    title: "Mise en station et suivi équatorial précis",
    duration: "45 min la première fois, 10 min ensuite",
    gear: "Monture équatoriale motorisée · viseur polaire ou caméra type PoleMaster · niveau à bulle",
    intro:
      "Une monture équatoriale bien alignée sur l'axe du monde compense la rotation terrestre avec un seul moteur. La qualité de l'alignement détermine directement la durée de pose possible.",
    steps: [
      "Mettez le trépied de niveau, jambes bien enfoncées, puis réglez la latitude de la monture sur celle de votre lieu.",
      "Orientez l'axe polaire vers le nord géographique (pas magnétique : appliquez la déclinaison locale, environ +2° en France).",
      "Dans le viseur polaire, placez la Polaire sur son cercle horaire à la position indiquée par une application de mise en station.",
      "Équilibrez : d'abord l'axe d'ascension droite (contrepoids), puis l'axe de déclinaison (tube). Un léger déséquilibre côté est réduit le jeu d'engrenage.",
      "Faites l'alignement 2 ou 3 étoiles du GoTo pour affiner le pointage.",
      "Testez la dérive : cadrez une étoile, laissez tourner 5 minutes, mesurez son déplacement. Corrigez l'azimut si elle dérive en déclinaison.",
      "Au-delà de 2 minutes de pose, passez à l'autoguidage (lunette guide + caméra + PHD2) : la précision passe de la minute d'arc à la seconde d'arc.",
    ],
    settings: "Erreur de mise en station < 5' pour 2 min de pose à 500 mm · autoguidage visé RMS < 1\"",
    pitfalls: [
      "Trépied posé sur une terrasse en bois ou du sable : vibrations et affaissement garantis.",
      "Oublier de déverrouiller le frein d'un axe : les moteurs forcent et sautent des pas.",
      "Nord magnétique au lieu du nord géographique : jusqu'à 3° d'erreur.",
    ],
  },
  {
    level: "Avancé",
    title: "Imagerie planétaire : la technique du lucky imaging",
    duration: "3 h avec le traitement",
    gear: "Télescope 150 mm et plus · caméra planétaire (ASI, QHY) · Barlow 2-3× · roue à filtres facultative",
    intro:
      "En planétaire, la limite n'est pas la lumière mais la turbulence atmosphérique. On filme des milliers d'images très courtes et on ne garde que les instants où l'atmosphère s'est calmée : c'est le lucky imaging.",
    steps: [
      "Laissez le télescope se mettre en température au moins 45 minutes (1 h 30 pour un gros Newton) : sinon des veines de chaleur brouillent l'image.",
      "Collimatez sur une étoile défocalisée : les anneaux doivent être parfaitement concentriques.",
      "Ajoutez la Barlow pour atteindre un rapport F/D d'environ 5× la taille du pixel en microns (pixel 2,9 µm → F/D ≈ 15).",
      "Réduisez la fenêtre de capture (ROI) à la planète : la cadence monte à 100-200 images/s.",
      "Réglez l'exposition pour un histogramme à 70-80 %, gain le plus bas possible qui le permet.",
      "Filmez 2 à 3 minutes maximum sur Jupiter (rotation rapide), 5 minutes sur Mars ou Saturne. Format SER, pas AVI.",
      "Dans AutoStakkert!, activez Surface, 200-400 points d'alignement, gardez les 10-25 % meilleures images.",
      "Ondelettes dans RegiStax ou WaveSharp : montez les couches 2 et 3 doucement, la couche 1 amplifie surtout le bruit.",
      "Terminez par la dérotation avec WinJUPOS si vous avez cumulé plusieurs films.",
    ],
    settings: "Barlow 2-3× · ROI 640×480 · 100-200 img/s · SER 8 bits · 10-25 % conservés",
    pitfalls: [
      "Observer une planète basse sur l'horizon : la dispersion atmosphérique colore les bords. Utilisez un ADC ou attendez qu'elle culmine.",
      "Gain trop élevé : bruit granuleux que les ondelettes transforment en artefacts.",
      "Film trop long : la rotation de Jupiter floute les détails au-delà de 3 minutes.",
    ],
  },
  {
    level: "Avancé",
    title: "Bande étroite Hα/OIII : imager depuis une ville",
    duration: "Plusieurs nuits",
    gear: "Caméra refroidie mono ou couleur · filtre dual-band ou jeu SHO · monture guidée",
    intro:
      "Les nébuleuses en émission ne rayonnent que dans quelques raies très fines. Un filtre à bande étroite laisse passer ces raies et bloque tout le reste, y compris l'essentiel de la pollution lumineuse : c'est le seul moyen d'imager sérieusement depuis une zone urbaine.",
    steps: [
      "Choisissez le filtre : dual-band Hα/OIII (7 nm) pour caméra couleur, jeu Hα/OIII/SII pour caméra monochrome.",
      "Refroidissez la caméra à une consigne stable (-10 °C typiquement) et refaites vos darks à cette température.",
      "Allongez les poses : 180 à 600 s, car le filtre coupe beaucoup de lumière. L'autoguidage devient indispensable.",
      "Utilisez le gain unitaire de votre capteur (souvent gain 100 sur IMX571) et de nombreuses poses plutôt que des poses extrêmes.",
      "Refaites la mise au point à chaque changement de filtre : les points focaux diffèrent de quelques dizaines de microns.",
      "En mono, cumulez au moins 4 h par couche. Assemblez ensuite en palette Hubble (SHO) ou HOO.",
      "Réduisez les étoiles avec StarNet++ : traitez la nébuleuse séparément, puis réintégrez les étoiles en mode écran.",
    ],
    settings: "Poses 180-300 s · gain unitaire · -10 °C · 4 h minimum par couche · dithering activé",
    pitfalls: [
      "Filtre bande étroite sur une galaxie : inutile, les galaxies rayonnent en continu.",
      "Halos autour des étoiles brillantes : signe d'un filtre bas de gamme ou mal orienté.",
      "Oublier le dithering : des motifs de bruit fixes apparaissent à l'empilement.",
    ],
  },
  {
    level: "Traitement",
    title: "Traitement Siril de A à Z (gratuit)",
    duration: "1 h 30",
    gear: "Siril · GraXpert · StarNet++ · GIMP ou Photoshop",
    intro:
      "Siril suffit à produire une image publiable sans dépenser un euro. Le fil conducteur : tout ce qui est linéaire (calibration, gradient, couleur) doit être fait avant l'étirement, tout ce qui est esthétique après.",
    steps: [
      "Chargez vos lights/darks/flats/offsets dans les dossiers du script, lancez OSC_Preprocessing.",
      "Ouvrez result.fit : image sombre, c'est normal, elle est linéaire. Passez l'affichage en Autostretch pour voir ce que vous faites.",
      "Recadrez les bords abîmés par l'alignement.",
      "Extraction du gradient : échantillon RBF, tolérance 1,0. Ou GraXpert en IA pour les cas difficiles.",
      "Calibration des couleurs par photométrie (Photometric Color Calibration) : Siril interroge un catalogue et corrige la teinte objectivement.",
      "Réduction de bruit sur l'image encore linéaire, avec parcimonie.",
      "Étirement : Generalised Hyperbolic Stretch ou Asinh, en 3 petites passes plutôt qu'une brutale.",
      "Séparez les étoiles avec StarNet++, étirez la nébuleuse, réduisez les étoiles, recombinez.",
      "Saturation +15 à +25 % en toute fin, puis export en TIFF 16 bits et finitions dans GIMP.",
    ],
    settings: "Siril 1.2+ · empilement 32 bits · étirement asinh · saturation en dernier",
    pitfalls: [
      "Écraser le fond de ciel à zéro : l'image paraît « propre » mais toute la nébulosité faible est perdue. Visez un fond à 15-25/255.",
      "Saturation avant étirement : couleurs fausses et étoiles roses.",
      "Trop de réduction de bruit : aspect plastique et étoiles rondes comme des billes.",
    ],
  },
  {
    level: "Terrain",
    title: "Préparer une nuit d'observation efficace",
    duration: "20 min de préparation",
    gear: "Cartes, liste d'objets, lampe rouge, vêtements chauds",
    intro:
      "Une bonne nuit se joue avant de sortir : météo, phase lunaire, liste d'objets réalistes et confort. Beaucoup d'abandons viennent du froid ou de la frustration de ne rien trouver.",
    steps: [
      "Vérifiez la couverture nuageuse par couche et le seeing (Meteoblue, Clear Outside) et la phase de la Lune : au-delà du premier quartier, oubliez les nébuleuses faibles.",
      "Préparez une liste de 5 à 8 objets classés par heure de culmination, avec les magnitudes et l'instrument requis — l'explorateur de cette application le fait pour votre position.",
      "Repérez un site dégagé au sud et à l'abri des lampadaires. La carte lightpollutionmap.info donne la classe de Bortle.",
      "Habillez-vous pour 10 °C de moins que la température annoncée : on reste immobile pendant des heures.",
      "Sur place, laissez le télescope se mettre en température pendant que vos yeux s'adaptent (20-30 minutes d'obscurité complète).",
      "N'utilisez que du rouge à faible intensité : le mode nuit de cette application est prévu pour ça.",
      "Cherchez les objets faibles en vision décalée : regardez à côté de l'objet, la périphérie de la rétine est bien plus sensible.",
      "Notez ce que vous voyez (croquis, carnet) : c'est ce qui fait progresser le plus vite en visuel.",
    ],
    settings: "Vision décalée · lampe rouge < 5 lux · adaptation 20-30 min · thermos et siège assis",
    pitfalls: [
      "Regarder son téléphone en mode jour : 20 minutes d'adaptation perdues en 2 secondes.",
      "Viser trop d'objets : mieux vaut 5 objets vraiment observés que 20 survolés.",
      "Grossir trop : sur le ciel profond, le faible grossissement montre presque toujours plus.",
    ],
  },
  {
    level: "Débutant",
    title: "Choisir son premier télescope sans se tromper",
    duration: "Lecture 10 min",
    gear: "Budget 200 à 800 €",
    intro:
      "Le meilleur télescope est celui que vous sortez souvent. Le diamètre fait la performance, mais l'encombrement fait la fréquence d'usage — et un instrument qui reste au placard ne montre rien.",
    steps: [
      "Définissez d'abord l'usage : planètes et Lune (longue focale), ciel profond visuel (grand diamètre), astrophoto (monture avant tout).",
      "Visuel polyvalent, petit budget : Dobson 150 à 250 mm. Rapport diamètre/prix imbattable, prise en main immédiate.",
      "Balcon ou transport fréquent : Maksutov 90-127 mm ou lunette 80 mm ED sur monture azimutale.",
      "Astrophoto : investissez 60 % du budget dans la monture (HEQ5, EQ6-R, Star Adventurer GTi) et seulement 40 % dans l'optique.",
      "Prévoyez systématiquement 15 % du budget en accessoires : un bon oculaire grand champ, un filtre UHC, un chercheur point rouge, un Barlow.",
      "Évitez les télescopes de grande surface vendus sur le grossissement (« 675× ») : la monture est inutilisable.",
      "Achetez d'occasion sur les forums spécialisés : le matériel astro se déprécie fortement et vieillit très bien.",
    ],
    settings: "Grossissement utile max ≈ 2 × diamètre en mm · oculaire principal ≈ focale/50 pour le ciel profond",
    pitfalls: [
      "Acheter un 300 mm quand on habite au 4e étage sans ascenseur.",
      "Monture trop légère pour le tube : image qui tremble à chaque effleurement.",
      "Négliger la collimation d'un Newton : images floues attribuées à tort à l'optique.",
    ],
  },
  {
    level: "Intermédiaire",
    title: "Filés d'étoiles et time-lapse nocturne",
    duration: "Une nuit complète",
    gear: "Appareil photo · intervallomètre · batteries de rechange · StarStaX (gratuit)",
    intro:
      "Le filé d'étoiles matérialise la rotation terrestre en cercles concentriques autour de la Polaire. On ne fait plus une pose de 2 h (bruit thermique énorme) mais des centaines de poses courtes que l'on fusionne.",
    steps: [
      "Cadrez en incluant la Polaire pour des cercles complets, ou plein est/ouest pour des traînées rectilignes.",
      "Réglez 30 s de pose, f/4, ISO 800, et un intervalle de 1 s entre les poses pour éviter les trous dans les traînées.",
      "Désactivez la réduction du bruit sur pose longue : elle double le temps entre deux images et crée des interruptions.",
      "Lancez l'intervallomètre pour 200 à 400 images (1 h 40 à 3 h 20). Prévoyez une batterie externe.",
      "Prenez 10 darks en fin de séance sans changer les réglages.",
      "Dans StarStaX, mode Gap Filling pour combler les micro-trous, puis fusion en mode Lighten.",
      "Pour un time-lapse, exportez les mêmes images en séquence à 24 im/s : 400 images donnent environ 17 secondes de vidéo.",
    ],
    settings: "30 s · f/4 · ISO 800 · intervalle 1 s · NR longue pose OFF · 200-400 images",
    pitfalls: [
      "Buée sur l'objectif après une heure : posez une résistance chauffante ou une chaufferette.",
      "Un avion ou un phare de voiture qui traverse : gardez les images, supprimez seulement les fautives.",
      "Autofocus laissé actif : une seule image floue casse toute la série.",
    ],
  },
];

export interface GearCategory {
  title: string;
  blurb: string;
  items: { name: string; desc: string; price: string; url: string }[];
}

const SHOP = "https://www.astroshop.de/fr";
const search = (q: string) => `${SHOP}/search?sSearch=${encodeURIComponent(q)}`;

export const GEAR: GearCategory[] = [
  {
    title: "Télescopes",
    blurb:
      "Le diamètre détermine la quantité de lumière collectée et le pouvoir séparateur. Un Dobson offre le plus de diamètre par euro ; une lunette apochromatique offre la meilleure qualité d'image par millimètre.",
    items: [
      { name: "Télescopes (toutes catégories)", desc: "Le rayon complet : Newton, Dobson, lunettes, Maksutov, Schmidt-Cassegrain.", price: "dès 100 €", url: `${SHOP}/telescopes/c/1` },
      { name: "Dobson 150-250 mm", desc: "Le meilleur rapport diamètre/prix pour le visuel ciel profond.", price: "250-800 €", url: search("dobson") },
      { name: "Newton sur équatoriale", desc: "Polyvalent visuel et photo, à condition d'une monture suffisante.", price: "400-1200 €", url: search("newton equatorial") },
      { name: "Lunette apochromatique ED", desc: "Piqué et couleurs parfaites, la référence pour l'astrophoto grand champ.", price: "500-3000 €", url: search("lunette apochromatique") },
      { name: "Maksutov 90-150 mm", desc: "Compact et longue focale : Lune, planètes, étoiles doubles.", price: "250-900 €", url: search("maksutov") },
      { name: "Télescopes intelligents", desc: "Instruments automatisés type Seestar / eVscope, prêts en 2 minutes.", price: "500-4000 €", url: search("telescope intelligent") },
    ],
  },
  {
    title: "Montures et trépieds",
    blurb:
      "En photo, la monture compte plus que l'optique. Règle : la charge photo utile vaut environ la moitié de la charge annoncée par le fabricant.",
    items: [
      { name: "Montures (catalogue)", desc: "Azimutales, équatoriales, GoTo, harmoniques.", price: "dès 150 €", url: `${SHOP}/montures/c/3` },
      { name: "Monture équatoriale GoTo", desc: "Suivi motorisé et pointage automatique de milliers d'objets.", price: "400-2500 €", url: search("monture goto equatoriale") },
      { name: "Star Adventurer / monture de voyage", desc: "Suivi léger pour appareil photo et petite lunette.", price: "300-600 €", url: search("star adventurer") },
      { name: "Montures harmoniques", desc: "Très forte charge pour un poids minime, sans contrepoids.", price: "1000-3000 €", url: search("monture harmonique") },
      { name: "Trépieds et colonnes", desc: "Base stable : le maillon faible le plus souvent négligé.", price: "100-800 €", url: search("trepied colonne") },
    ],
  },
  {
    title: "Oculaires et Barlow",
    blurb:
      "Grossissement = focale du télescope ÷ focale de l'oculaire. Trois oculaires bien choisis (grand champ, moyen, fort) couvrent tous les usages.",
    items: [
      { name: "Oculaires (catalogue)", desc: "Plössl, grand champ 68-82°, ultra grand champ 100°.", price: "dès 30 €", url: `${SHOP}/oculaires/c/2` },
      { name: "Oculaires grand champ 68-82°", desc: "Confort d'observation et immersion sur les grands objets.", price: "80-400 €", url: search("oculaire grand champ") },
      { name: "Lentilles de Barlow", desc: "Doublent ou triplent le grossissement : indispensables en planétaire.", price: "40-250 €", url: search("barlow") },
      { name: "Zoom oculaires", desc: "8-24 mm : un seul accessoire pour balayer la plage de grossissements.", price: "100-350 €", url: search("oculaire zoom") },
      { name: "Renvois coudés", desc: "Confort de visée sur lunettes et Cassegrain, diélectriques de préférence.", price: "40-300 €", url: search("renvoi coude") },
    ],
  },
  {
    title: "Caméras et astrophoto",
    blurb:
      "Une caméra refroidie dédiée bat un reflex sur le ciel profond grâce au refroidissement et à l'absence de filtre infrarouge.",
    items: [
      { name: "Caméras astronomiques", desc: "Le catalogue complet : planétaire, ciel profond, guidage.", price: "dès 150 €", url: `${SHOP}/cameras-astronomiques/c/18` },
      { name: "Caméras planétaires", desc: "Haute cadence pour le lucky imaging (ASI664, QHY5III).", price: "200-600 €", url: search("camera planetaire") },
      { name: "Caméras refroidies ciel profond", desc: "Capteurs APS-C/4/3 refroidis, bruit thermique quasi nul.", price: "700-3500 €", url: search("camera refroidie") },
      { name: "Autoguidage (lunette + caméra)", desc: "Corrige les erreurs de suivi, autorise les poses de 5 à 10 minutes.", price: "200-500 €", url: search("autoguidage lunette guide") },
      { name: "Correcteurs et réducteurs de champ", desc: "Étoiles rondes jusque dans les coins du capteur.", price: "150-700 €", url: search("correcteur de coma reducteur") },
      { name: "Adaptateurs et bagues T2", desc: "Relier boîtier photo, filtres et tirage optique correct.", price: "15-120 €", url: search("bague T2 adaptateur") },
    ],
  },
  {
    title: "Filtres",
    blurb:
      "Un filtre ne crée pas de signal : il en supprime moins que le fond de ciel. En ville, c'est ce qui change tout sur les nébuleuses.",
    items: [
      { name: "Filtres (catalogue)", desc: "UHC, OIII, bande étroite, solaires, planétaires.", price: "dès 25 €", url: `${SHOP}/filtres/c/13` },
      { name: "Filtres UHC / anti-pollution", desc: "Contraste immédiat sur les nébuleuses en visuel urbain.", price: "60-250 €", url: search("filtre UHC") },
      { name: "Filtres dual-band Hα/OIII", desc: "Astrophoto couleur sous ciel pollué, le plus rentable des filtres photo.", price: "200-500 €", url: search("filtre dual band") },
      { name: "Filtres solaires et Hα", desc: "Feuille AstroSolar ou lunette Hα dédiée. Sécurité absolue exigée.", price: "30-2000 €", url: search("filtre solaire") },
      { name: "Filtres planétaires colorés", desc: "Renforcent les calottes martiennes ou les bandes de Jupiter.", price: "20-80 €", url: search("filtre planetaire") },
    ],
  },
  {
    title: "Jumelles",
    blurb:
      "Les 10×50 restent l'instrument le plus utilisé des astronomes expérimentés : champ large, mise en œuvre immédiate, aucune collimation.",
    items: [
      { name: "Jumelles (catalogue)", desc: "Toutes les jumelles d'observation astronomique.", price: "dès 60 €", url: `${SHOP}/jumelles/c/6` },
      { name: "Jumelles 10×50", desc: "Le standard universel : Pléiades, Andromède, amas d'Hercule.", price: "80-300 €", url: search("jumelles 10x50") },
      { name: "Jumelles géantes 15×70 / 20×80", desc: "Beaucoup plus de lumière, mais trépied obligatoire.", price: "150-500 €", url: search("jumelles 20x80") },
      { name: "Adaptateurs jumelles-trépied", desc: "Indispensable au-delà de 10× pour stabiliser l'image.", price: "15-60 €", url: search("adaptateur jumelles trepied") },
    ],
  },
  {
    title: "Accessoires de terrain",
    blurb: "Le confort et la lutte contre la buée décident souvent de la durée réelle d'une séance.",
    items: [
      { name: "Résistances chauffantes anti-buée", desc: "Empêchent la condensation sur l'optique et le chercheur.", price: "25-120 €", url: search("resistance chauffante anti buee") },
      { name: "Lampes rouges frontales", desc: "Préservent la vision nocturne, à intensité réglable.", price: "10-60 €", url: search("lampe rouge astronomie") },
      { name: "Alimentations et batteries", desc: "Powerbank 12 V pour monture, caméra et dew heater.", price: "60-400 €", url: search("alimentation 12V astronomie") },
      { name: "Masques de Bahtinov", desc: "Mise au point parfaite en 30 secondes grâce aux aigrettes.", price: "15-70 €", url: search("masque bahtinov") },
      { name: "Chercheurs et point rouge", desc: "Pointer vite et sans se tordre le cou.", price: "30-200 €", url: search("chercheur point rouge") },
      { name: "Valises et sacs de transport", desc: "Protéger optiques et oculaires en déplacement.", price: "40-300 €", url: search("valise transport telescope") },
    ],
  },
  {
    title: "Livres, atlas et cartes",
    blurb: "Un atlas papier reste plus rapide qu'un écran sur le terrain, et n'a pas besoin de batterie.",
    items: [
      { name: "Atlas et cartes du ciel", desc: "Pocket Sky Atlas, Interstellarum Deep Sky Atlas.", price: "20-90 €", url: search("atlas du ciel") },
      { name: "Livres d'astronomie", desc: "Guides d'observation, astrophoto, astrophysique.", price: "15-80 €", url: search("livre astronomie") },
      { name: "Planisphères", desc: "Carte tournante réglée sur la date et l'heure.", price: "10-30 €", url: search("planisphere") },
    ],
  },
];

export const SOFTWARE = [
  { name: "Siril", desc: "Prétraitement et traitement complet, gratuit et open source. Le cœur d'une chaîne moderne.", url: "https://siril.org/" },
  { name: "DeepSkyStacker", desc: "Empilement classique pour le ciel profond sous Windows, très simple.", url: "http://deepskystacker.free.fr/french/index.html" },
  { name: "AutoStakkert!", desc: "Référence du stacking planétaire à partir de vidéos SER/AVI.", url: "https://www.autostakkert.com/" },
  { name: "RegiStax", desc: "Ondelettes : l'outil historique pour révéler les détails planétaires.", url: "https://www.astronomie.be/registax/" },
  { name: "GraXpert", desc: "Suppression automatique par IA des gradients de pollution lumineuse.", url: "https://www.graxpert.com/" },
  { name: "StarNet++", desc: "Sépare les étoiles de la nébuleuse pour les traiter indépendamment.", url: "https://www.starnetastro.com/" },
  { name: "PHD2 Guiding", desc: "Autoguidage gratuit, standard de fait sur toutes les montures.", url: "https://openphdguiding.org/" },
  { name: "N.I.N.A.", desc: "Séquenceur complet pour automatiser une nuit entière d'acquisition.", url: "https://nighttime-imaging.eu/" },
  { name: "ASTAP", desc: "Astrométrie (plate solving) rapide et empilement, gratuit.", url: "https://www.hnsky.org/astap.htm" },
  { name: "WinJUPOS", desc: "Dérotation planétaire et mesures sur Jupiter, Mars et Saturne.", url: "http://jupos.privat.t-online.de/" },
  { name: "Stellarium", desc: "Planétarium bureau et web pour préparer chaque séance.", url: "https://stellarium.org/fr/" },
  { name: "StarStaX", desc: "Fusion de filés d'étoiles avec comblement des interruptions.", url: "https://markus-enzweiler.de/software/starstax/" },
  { name: "Sequator", desc: "Empilement paysage nocturne très simple, ciel et sol séparés.", url: "https://sites.google.com/site/sequatorglobal/" },
  { name: "PixInsight", desc: "La suite professionnelle payante, courbe d'apprentissage raide mais sans équivalent.", url: "https://pixinsight.com/" },
];

export const PLANNING = [
  { name: "Light pollution map", desc: "Classe de Bortle et sites sombres autour de chez vous.", url: "https://www.lightpollutionmap.info/" },
  { name: "Clear Outside", desc: "Météo astro : nuages par couche, seeing, transparence, humidité.", url: "https://clearoutside.com/" },
  { name: "Meteoblue Astronomy", desc: "Seeing et jet stream sur 3 jours, très fiable en Europe.", url: "https://www.meteoblue.com/fr/meteo/outdoorsports/seeing" },
  { name: "Heavens-Above", desc: "Passages ISS, satellites Starlink, éphémérides planétaires.", url: "https://heavens-above.com/" },
  { name: "IMO — pluies de météores", desc: "Calendrier officiel annuel des essaims et de leur ZHR.", url: "https://www.imo.net/resources/calendar/" },
  { name: "Telescopius", desc: "Planificateur de cibles, cadrage du capteur, listes d'objets.", url: "https://telescopius.com/" },
  { name: "IMCCE — éphémérides", desc: "Éphémérides officielles françaises : éclipses, occultations, phénomènes.", url: "https://www.imcce.fr/" },
  { name: "Astrometry.net", desc: "Résolution astrométrique en ligne de n'importe quelle photo du ciel.", url: "https://nova.astrometry.net/" },
];

export const BLOGS = [
  { name: "Astrosurf", desc: "La communauté francophone historique : forums, tutoriels, tests matériel.", url: "https://www.astrosurf.com/" },
  { name: "Webastro", desc: "Forum francophone très actif, section débutants exemplaire et petites annonces.", url: "https://www.webastro.net/" },
  { name: "Ciel & Espace", desc: "Actualité astronomique et éphémérides en français.", url: "https://www.cieletespace.fr/" },
  { name: "Sky & Telescope", desc: "Guides d'observation hebdomadaires et cartes du ciel.", url: "https://skyandtelescope.org/" },
  { name: "Astrobin", desc: "Galerie d'astrophotos avec tous les réglages et le matériel de chaque image.", url: "https://www.astrobin.com/" },
  { name: "Cloudy Nights", desc: "Le plus grand forum anglophone : tests, conseils, occasions.", url: "https://www.cloudynights.com/" },
  { name: "AFA — Association française d'astronomie", desc: "Nuits des étoiles, revue Ciel & Espace, clubs partout en France.", url: "https://www.afastronomie.fr/" },
  { name: "APOD (NASA)", desc: "Une image astronomique commentée chaque jour depuis 1995.", url: "https://apod.nasa.gov/apod/astropix.html" },
  { name: "ESA/Hubble", desc: "Images en pleine résolution et explications scientifiques libres de droits.", url: "https://esahubble.org/images/" },
  { name: "Astronomes.com", desc: "Ressources et guides francophones pour débuter.", url: "https://www.astronomes.com/" },
];

export const VIDEOS = [
  { name: "AstroBackyard", desc: "Astrophoto du ciel profond, matériel et traitement pas à pas.", url: "https://www.youtube.com/@AstroBackyard" },
  { name: "Cuiv, The Lazy Geek", desc: "Tests de matériel et automatisation de l'astrophoto.", url: "https://www.youtube.com/@CuivTheLazyGeek" },
  { name: "Nebula Photos", desc: "Astrophoto accessible, en ville et à petit budget.", url: "https://www.youtube.com/@NebulaPhotos" },
  { name: "Deep Sky Detail", desc: "Traitement avancé sous PixInsight expliqué clairement.", url: "https://www.youtube.com/@DeepSkyDetail" },
  { name: "Astro Guigeek", desc: "Chaîne francophone : tutoriels, tests et sorties terrain.", url: "https://www.youtube.com/@AstroGuigeek" },
  { name: "Le Sptinik", desc: "Vulgarisation astronomique en français.", url: "https://www.youtube.com/@LeSptinik" },
  { name: "La Chaîne Astro", desc: "Actualité et observation commentées en français.", url: "https://www.youtube.com/@LaChaineAstro" },
  { name: "Astro Photons", desc: "Astrophotographie francophone, du matériel au traitement Siril.", url: "https://www.youtube.com/@AstroPhotons" },
  { name: "Peter Zelinka", desc: "Paysage nocturne et Voie lactée, très pédagogique.", url: "https://www.youtube.com/@PeterZelinka" },
  { name: "Late Night Astronomy", desc: "Sessions d'observation et conseils d'achat sans langue de bois.", url: "https://www.youtube.com/@LateNightAstronomy" },
];
