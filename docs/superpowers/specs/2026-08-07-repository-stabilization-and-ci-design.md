# Stabilisation du dépôt et CI — Spécification de conception

## 1. Objectif

Rendre le dépôt Sky Map Companion reproductible, lisible et vérifiable avant d’ajouter la mosaïque collaborative. Le résultat doit éliminer la corruption de texte actuelle, empêcher sa réapparition et fournir une CI qui teste réellement le code, les migrations et le workflow lui-même.

## 2. État constaté

- Le commit `df78a82` a retiré les espaces lexicaux dans 147 fichiers suivis.
- Des commandes valides sont devenues `vitebuild`, du JSX est devenu `<mainclassName=...>` et du SQL est devenu `CREATETABLE...`.
- Le parent direct `818fecc45acd79e7340d00f12632da084e8cfd45` conserve les espaces et les scripts valides.
- La branche actuelle contient aussi des changements postérieurs qu’il faut examiner et préserver lorsqu’ils sont sémantiques.
- `npm run build` échoue avant Vite et `npm run lint` remonte des centaines d’erreurs.
- Le workflow actuel vérifie l’UTF‑8, le lint et le build, mais ne contient aucun test applicatif, SQL, E2E ou contrat de workflow.
- `package-lock.json` comporte une modification locale qui appartient à l’utilisateur et ne doit pas être écrasée implicitement.

## 3. Limites

Cette phase ne modifie pas le comportement produit, le schéma de données ou la logique d’attribution. Elle restaure le comportement déjà prévu, met en place les outils de test et produit une base verte pour la suite.

Elle ne réécrit pas l’historique Git publié : aucun rebase, amendement, squash ou force-push.

## 4. Stratégie de restauration

1. Construire la liste exacte des chemins modifiés par `df78a82`.
2. Restaurer leur contenu lexical depuis son parent direct `818fecc...`.
3. Examiner séparément les commits suivants (`f5fe8e1` à `208a5ad`) et réappliquer uniquement leurs changements sémantiques utiles.
4. Régénérer les artefacts générés, notamment `src/routeTree.gen.ts`, avec l’outil officiel plutôt que par fusion manuelle.
5. Préserver la modification locale de `package-lock.json` hors des changements de restauration. Son intention sera comparée au futur verrou pnpm avant toute suppression.
6. Supprimer le script de réparation destructif ou le remplacer par un validateur strictement non mutateur.
7. Exécuter Prettier seulement après que TypeScript, JSX, JSON et SQL sont de nouveau syntaxiquement valides.

La restauration doit être mécanique et traçable. Aucun algorithme ne doit tenter de « deviner » les espaces manquants dans les fichiers corrompus.

## 5. Gestionnaire de paquets et runtime

- Node.js : version majeure 22.
- Gestionnaire : `pnpm@10.28.1` via Corepack.
- Le manifeste doit déclarer le champ `packageManager`.
- `pnpm-lock.yaml` devient la source de verrouillage utilisée par la CI.
- Les workflows ne doivent pas contenir `npm ci` une fois la migration pnpm achevée.
- Le `package-lock.json` local modifié est préservé jusqu’à ce que son delta ait été audité et que toute intention utile ait été transférée.

## 6. Garde-fous de formatage et d’encodage

Un script non mutateur `scripts/validate-source-integrity.mjs` vérifie :

- décodage UTF‑8 strict de tous les fichiers texte suivis ;
- absence du caractère de remplacement `U+FFFD` ;
- normalisation Unicode NFC des contenus destinés aux utilisateurs ;
- JSON parseable ;
- commandes npm/pnpm connues et non fusionnées ;
- absence de signatures de corruption connues (`vitebuild`, `<mainclassName`, `CREATETABLE`, etc.) ;
- fins de ligne acceptées selon `.gitattributes` ;
- cohérence entre `package.json`, le verrou et les commandes du workflow.

Prettier fonctionne en mode `--check` dans la CI. Le formatage automatique reste une commande locale explicite et ne s’exécute jamais comme réparation d’encodage.

## 7. Architecture de test

### 7.1 Outils

- Vitest pour les unités et intégrations TypeScript.
- Testing Library pour les composants React.
- Playwright pour les parcours navigateur.
- pgTAP et Supabase local pour les contraintes, fonctions et politiques RLS.
- Actionlint pour la syntaxe et les expressions GitHub Actions.
- Un test de contrat TypeScript parse `.github/workflows/ci.yml` et vérifie les invariants du projet.

### 7.2 Contrats du workflow

Les tests du workflow doivent échouer si :

- Node n’est pas fixé à 22 ;
- pnpm n’est pas fixé à `10.28.1` ;
- l’installation n’utilise pas `--frozen-lockfile` ;
- un job de validation obligatoire est absent ;
- le résumé ne dépend pas de tous les jobs obligatoires ;
- un secret est exposé à un job de pull request non approuvé ;
- une action tierce n’est pas épinglée de façon reproductible ;
- le build peut s’exécuter sans le lint, les types ou les tests requis.

### 7.3 Jobs cibles

1. `source-integrity`
2. `workflow-lint`
3. `lint-and-types`
4. `unit-and-component-tests`
5. `database-tests`
6. `e2e-tests`
7. `production-build`
8. `security-audit`
9. `ci-summary`

Les jobs sans secrets s’exécutent sur les pull requests externes. Les tests nécessitant des secrets utilisent des services locaux ou sont réservés aux branches de confiance avec condition explicite.

## 8. Seuils de qualité

- Couverture globale initiale : 80 % des lignes et branches du code testable.
- Logique d’attribution et XP : 95 % des branches.
- Zéro erreur Actionlint, TypeScript, ESLint ou Prettier.
- Zéro migration ajoutée sans test pgTAP correspondant.
- Zéro secret requis pour les tests unitaires et composants.
- Build de production reproductible avec un verrou gelé.

## 9. Critères d’acceptation

- Tous les fichiers corrompus sont restaurés sans perte des correctifs sémantiques postérieurs.
- Le README, les chaînes françaises, les scripts, le JSX et le SQL sont lisibles.
- `pnpm install --frozen-lockfile`, le lint, les types, les tests et le build terminent avec le code 0.
- La CI échoue volontairement sur un fichier UTF‑8 invalide, une commande fusionnée et un workflow incomplet.
- La modification locale initiale de `package-lock.json` n’est ni écrasée ni incluse dans les commits sans justification explicite.
