# Cosmos Live

Cosmos Live collecte des signalements manuels authentifiés. Le flux public reste consultable sans compte ni autorisation de géolocalisation. Une carte vide signifie qu’aucun signalement récent n’a été reçu ; aucune observation de démonstration n’est injectée dans la production.

## Parcours

1. Consulter la carte, filtrer les phénomènes et choisir les deux dernières heures ou les dernières 24 heures.
2. Se connecter, activer le GPS ou renseigner le lieu réel d’observation.
3. Décrire le phénomène et son heure. Ajouter les directions uniquement si elles ont été mesurées. Une preuve JPEG, PNG, WebP, MP4 ou MOV de 100 Mio maximum est facultative et reste privée.
4. Le serveur enregistre le signalement puis exécute immédiatement une corrélation bornée. Le traitement ne dépend pas de l’ordinateur Windows.
5. Suivre le résultat dans « Mes signalements ». Une panne de calcul conserve le signalement et permet de relancer son analyse sans le soumettre de nouveau.

## Contrats et confidentialité

- `GET /api/cosmos/feed?since_minutes=120|1440` fournit les observations publiques, les événements des dernières 24 h, la date de génération et la disponibilité du traitement. Le navigateur rafraîchit le flux indépendamment du GPS. Les réponses ne sont pas mises en cache.
- Un jeton valide ajoute uniquement les 30 derniers signalements de son propriétaire et leurs jobs. Une erreur de lecture privée reste distincte d’un flux public vide.
- `POST /api/cosmos/report` accepte un UUID d’idempotence, des coordonnées numériques, un type, une description, une heure et des mesures facultatives. L’UUID est conservé avec l’heure, le lieu et le chemin de preuve pendant une nouvelle tentative.
- La transaction de soumission vérifie l’empreinte de la requête. Une répétition ne crée ni observation ni job supplémentaire. La limite de 20 nouveaux signalements par compte sur dix minutes n’empêche pas de récupérer le reçu d’une tentative déjà enregistrée.
- Les coordonnées exactes, l’identité, les directions et les fichiers restent côté serveur. Le flux public arrondit les positions à 0,1°. Les accès directs d’écriture sont retirés des rôles publics ; les fonctions de traitement sont réservées au serveur.
- Le fond cartographique provient d’OpenStreetMap, avec attribution et chargement des seules tuiles visibles. Si ce fond est indisponible, les points, leurs coordonnées, la liste et les commandes restent accessibles.

## Traitement et concurrence

La soumission et le job sont créés dans la même transaction. Les jobs du nouveau parcours portent `lease_scope: inline`, déjà exclu des workers scientifiques génériques. Les anciennes soumissions restent compatibles avec leur worker.

Le serveur lit un instantané borné des candidats, effectue le calcul puis transmet son résultat à `complete_cosmos_analysis`. Cette fonction prend un verrou transactionnel commun avec le worker Python, vérifie que l’instantané est toujours actuel, conserve l’identité d’un événement existant et recalcule ses compteurs. Un conflit concurrent déclenche au plus trois lectures/calculs. Aucun résultat partiel n’est publié si le plafond de 500 candidats pertinents est dépassé.

Les groupes remplacés sont conservés, leurs estimations obsolètes sont invalidées et les groupes devenus vides sont retirés du flux public. Les traitements terminés sont observables dans `processing_jobs` et `processing_job_events`. Le code `COSMOS_ANALYSIS_RETRY` indique qu’une observation enregistrée attend une reprise.

## Portée scientifique

Une corrélation recherche des signalements du même type à moins de 500 km et 15 minutes. Elle exige au moins deux comptes distincts pour créer un événement. Elle établit un rapprochement à vérifier, sans démontrer qu’il s’agit du même objet.

L’estimation géométrique utilise une Terre sphérique et des lignes de visée. Elle exige au moins deux observateurs distincts, des stations séparées d’au moins 1 km, des directions utilisables et un intervalle d’observation de 30 secondes maximum. Les directions parallèles, intersections derrière l’observateur, solutions sous le sol et géométries trop instables sont refusées. Les objets étendus ou lointains, comme les aurores, comètes et supernovas, ne sont pas triangulés par cette méthode.

Les seuils de calcul sont documentés dans `src/features/cosmos/domain/science.ts` et conservés en parité avec `workers/science/src/sky_worker/cosmos.py`. Ce sont des garde-fous techniques, pas des incertitudes instrumentales calibrées. L’écart aux lignes de visée n’est pas une marge d’erreur statistique. Aucun pourcentage de confiance ni confirmation scientifique automatique n’est fabriqué. Voir [Vida et al., méthode de résolution des trajectoires de météores](https://arxiv.org/abs/1911.02979).

## Validation et déploiement

Exécuter les tests du domaine et du serveur avec `npm run test:unit -- src/features/cosmos`, puis le typage, le lint et le build de production. Les tests scientifiques Python couvrent les mêmes géométries de référence. Le scénario SQL versionné vérifie les privilèges, la soumission idempotente, le rapprochement de plusieurs témoins, la concurrence et la protection de la projection publique dans une transaction annulée.

Appliquer `20261106103815_cosmos_live_runtime.sql` avant de déployer l’application. Cette migration ajoute une colonne, des fonctions et des restrictions d’écriture ; elle ne supprime aucune donnée ni table. Les anciennes routes serveur utilisant le compte de service restent compatibles pendant la transition. Le worker Python corrigé concerne les jobs historiques et ne conditionne pas le nouveau parcours.

Après déploiement, vérifier `/cosmos-live`, le flux public et les refus anonymes des endpoints d’écriture. Une recette avec un véritable observateur connecté reste nécessaire pour confirmer les autorisations GPS et le transfert de fichiers sur son appareil. Les tests synthétiques doivent rester dans une base isolée.

En cas de régression applicative, revenir au déploiement précédent ; conserver la migration additive et ses restrictions. Les signalements restent enregistrés. Relancer les analyses depuis le parcours corrigé lorsqu’il est rétabli, sans réinitialiser ni effacer les jobs historiques.
