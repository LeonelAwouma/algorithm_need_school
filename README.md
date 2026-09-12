# Planification des enseignants

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active%20development-blue.svg)](#état-du-projet)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](#contribuer)

**Planification des enseignants** est une application open source de simulation et d’aide à la décision pour l’affectation séquentielle des enseignants du primaire public.

À partir de deux fichiers — **établissements** et **enseignants** — l’application calcule un barème individuel, évalue la compatibilité entre un enseignant et un poste, puis propose des affectations en plusieurs phases : commune, département, règles ciblées et traitement des postes restants.

> ⚠️ **Important : ceci est un outil de simulation.**
>
> Les résultats produits sont des estimations basées sur des règles, des hypothèses et des paramètres configurables.
>
> Ils ne constituent ni des mutations administrativement approuvées, ni un quota officiel de recrutement, ni une décision d’une administration publique.

---

## Sommaire

* [Pourquoi ce projet ?](#pourquoi-ce-projet-)
* [Objectifs](#objectifs)
* [Principes open source](#principes-open-source)
* [Fonctionnalités](#fonctionnalités)
* [Fonctionnement du moteur](#fonctionnement-du-moteur)
* [Architecture technique](#architecture-technique)
* [Installation](#installation)
* [Format des données](#format-des-données)
* [État du projet](#état-du-projet)
* [Utilisateurs et cas d’usage](#utilisateurs-et-cas-dusage)
* [Problèmes connus](#problèmes-connus)
* [Roadmap](#roadmap)
* [Contribuer](#contribuer)
* [Maintenance et gouvernance](#maintenance-et-gouvernance)
* [Historique du développement](#historique-du-développement)
* [Sécurité et confidentialité](#sécurité-et-confidentialité)
* [Licence](#licence)
* [Avertissement](#avertissement)

---

# Pourquoi ce projet ?

La répartition des enseignants entre établissements scolaires peut devenir complexe lorsque plusieurs facteurs doivent être considérés simultanément :

* besoins réels des écoles ;
* disponibilité des enseignants ;
* proximité géographique ;
* ancienneté ;
* ancienneté au poste ;
* situation familiale ;
* âge ;
* zone d’affectation ;
* classes multigrades ;
* priorités territoriales ;
* règles administratives ou métier.

Lorsque ces critères sont appliqués manuellement sur un grand nombre d’établissements et d’enseignants, l’analyse peut devenir difficile à reproduire, à expliquer et à auditer.

Ce projet explore donc une approche algorithmique permettant de transformer ces règles en un processus de simulation :

```text
Données
   ↓
Nettoyage
   ↓
Calcul des besoins
   ↓
Construction du vivier
   ↓
Barème des enseignants
   ↓
Score enseignant ↔ poste
   ↓
Affectation séquentielle
   ↓
Résultats et indicateurs
```

L’objectif n’est pas de remplacer la décision humaine, mais de fournir un **outil transparent permettant d’analyser différents scénarios d’affectation**.

---

# Objectifs

Le projet cherche à fournir un moteur :

### Transparent

Les règles utilisées pour effectuer une simulation sont accessibles dans le code source.

### Configurable

Les principaux seuils, poids et règles peuvent être modifiés sans réécrire entièrement l’algorithme.

### Reproductible

Une même configuration appliquée aux mêmes données doit permettre de reproduire le même scénario.

### Auditable

Il doit être possible de comprendre comment et pourquoi une proposition d’affectation a été obtenue.

### Extensible

Le moteur doit pouvoir évoluer vers d’autres règles d’affectation, méthodes d’optimisation ou contextes éducatifs.

### Collaboratif

Chercheurs, développeurs, professionnels de l’éducation et contributeurs open source peuvent proposer des améliorations.

---

# Principes open source

Ce projet est publié en open source autour de plusieurs principes.

## Transparence

Les règles de calcul, les pondérations et les différentes étapes du moteur sont consultables directement dans le dépôt.

## Auditabilité

Les contributeurs peuvent analyser les règles existantes, signaler leurs limites et proposer des alternatives.

## Reproductibilité

Les simulations doivent pouvoir être reproduites à partir :

* des mêmes données ;
* de la même version du moteur ;
* de la même configuration.

## Explicabilité

L’objectif est de limiter autant que possible les décisions opaques.

Une affectation devrait pouvoir être expliquée à travers les critères qui ont contribué à son score.

## Amélioration collective

Les contributions sont encouragées pour :

* le moteur algorithmique ;
* les tests ;
* la méthodologie ;
* l’interface utilisateur ;
* les performances ;
* la documentation ;
* la sécurité ;
* l’accessibilité ;
* les traductions.

## Protection des données

Les données liées au personnel enseignant peuvent être sensibles.

**Aucune donnée personnelle réelle ne doit être publiée dans le dépôt public.**

Les tests et démonstrations doivent utiliser des données :

* synthétiques ;
* anonymisées ;
* ou fictives.

---

# Fonctionnalités

## Import des données

Import manuel de deux fichiers principaux :

* établissements ;
* enseignants.

Les fichiers peuvent être analysés directement depuis l’application.

---

## Tableau de bord

Le tableau de bord affiche notamment :

* besoin total ;
* nombre d’enseignants disponibles ;
* nombre d’enseignants affectés ;
* enseignants non affectés ;
* postes non pourvus ;
* besoin restant ;
* indicateurs liés aux établissements.

---

## Écoles en besoin

Identification des établissements disposant de postes ouverts ou présentant un besoin en personnel.

---

## Écoles fournisseurs

Identification des établissements pouvant alimenter le vivier d’enseignants potentiellement mobilisables.

---

## Vivier potentiel

Construction d’une liste d’enseignants éligibles à une éventuelle affectation.

Chaque enseignant peut notamment être associé à :

* son établissement d’origine ;
* son ancienneté ;
* son âge ;
* son barème ;
* son statut ;
* son éventuelle destination.

---

## Barème individuel

Un score individuel peut être calculé en utilisant plusieurs critères pondérés.

Exemples :

* ancienneté de carrière ;
* ancienneté au poste ;
* situation familiale ;
* nombre d’enfants ;
* formation continue ;
* âge ajusté.

---

## Score enseignant-poste

Chaque combinaison :

```text
Enseignant → Poste
```

peut recevoir un score.

Ce score peut notamment prendre en compte :

* le barème de l’enseignant ;
* la proximité ;
* l’ancienneté au poste ;
* la situation familiale ;
* des règles liées à l’âge ;
* des règles liées à la zone d’affectation.

---

## Affectation séquentielle

Le moteur peut effectuer les propositions d’affectation en plusieurs phases.

Exemple conceptuel :

```text
Phase 1
Même commune

        ↓

Phase 2
Même département

        ↓

Phase 3
Règles ciblées

        ↓

Phase 4
Traitement des postes restants
```

---

## Paramétrage du moteur

L’interface permet de modifier différents paramètres :

* seuils ;
* poids du barème ;
* poids du score enseignant-poste ;
* points attribués à la proximité ;
* règles d’affectation ;
* critères métier.

La configuration peut également être importée ou exportée au format JSON.

---

## Affectations proposées

L’application affiche les affectations calculées avec notamment :

* l’enseignant ;
* l’établissement d’origine ;
* le poste proposé ;
* la destination ;
* la phase ;
* le barème ;
* le score d’affectation.

---

## Enseignants non affectés

Les enseignants restant dans le vivier après la simulation sont identifiés séparément.

---

## Postes non pourvus

Les postes qui n’ont pas pu être couverts par le moteur sont également affichés.

---

## Méthodologie

Une section dédiée explique en langage accessible :

* les indicateurs ;
* les règles ;
* les calculs ;
* les limites du moteur.

Cette méthodologie peut être exportée en document Word.

---

## Export Excel

L’application peut produire un rapport Excel contenant plusieurs feuilles, par exemple :

* synthèse ;
* établissements ;
* affectations ;
* vivier ;
* enseignants non affectés ;
* postes non pourvus.

---

# Fonctionnement du moteur

Le cœur du moteur se trouve principalement dans :

```text
lib/affectation-engine.ts
```

Le traitement suit globalement les étapes suivantes.

## 1. Lecture des données

Les feuilles Excel sont transformées en tableaux puis en objets TypeScript.

```text
Excel
  ↓
Rows
  ↓
Records
```

---

## 2. Nettoyage des enseignants

Les données sont normalisées avant utilisation.

Certains statuts peuvent être exclus du vivier selon les règles du moteur.

---

## 3. Enrichissement des établissements

Le moteur calcule différents indicateurs à partir des informations disponibles.

Exemples :

* nombre de classes ;
* nombre d’enseignants ;
* nombre de postes ouverts ;
* taux d’encadrement ;
* zone ;
* priorité locale ;
* classes multigrades.

---

## 4. Construction du vivier

Le moteur identifie les enseignants potentiellement mobilisables.

---

## 5. Calcul du barème individuel

Chaque enseignant reçoit un score basé sur plusieurs critères.

Conceptuellement :

```text
Barème enseignant
=
w1 × Ancienneté carrière
+
w2 × Ancienneté poste
+
w3 × Situation familiale
+
w4 × Nombre d'enfants
+
w5 × Formation
+
w6 × Âge
```

Les valeurs et pondérations sont configurables.

---

## 6. Création des postes

Les établissements en besoin génèrent les postes devant potentiellement être couverts.

---

## 7. Calcul de la compatibilité enseignant-poste

Chaque enseignant peut être comparé à différents postes.

Conceptuellement :

```text
Score(E, P)
=
w1 × Barème enseignant
+
w2 × Proximité
+
w3 × Ancienneté
+
w4 × Situation familiale
+
w5 × Règle âge
+
w6 × Règle zone
```

---

## 8. Affectation séquentielle

Les candidats sont analysés selon les phases activées dans la configuration.

---

## 9. Production des résultats

Le moteur produit :

```text
Simulation
├── Synthèse
├── Écoles en besoin
├── Écoles fournisseurs
├── Affectations
├── Enseignants non affectés
├── Postes non pourvus
└── Vivier
```

---

# Architecture technique

Le projet utilise principalement :

| Technologie      | Usage                         |
| ---------------- | ----------------------------- |
| Next.js 16       | Framework web                 |
| React 19         | Interface utilisateur         |
| TypeScript       | Langage principal             |
| Tailwind CSS     | Interface et styles           |
| SheetJS / `xlsx` | Lecture et export Excel       |
| `docx`           | Génération des documents Word |
| Lucide React     | Icônes                        |

L’application ne dépend actuellement pas d’une base de données persistante pour exécuter les simulations.

Les calculs sont effectués à partir des fichiers fournis.

---

## Structure principale

```text
algorithm_need_school/
│
├── app/
│   └── Interface Next.js
│
├── components/
│   └── Composants de l'interface
│
├── lib/
│   ├── affectation-engine.ts
│   ├── methodology.ts
│   ├── read-workbook.ts
│   ├── export-methodology-docx.ts
│   └── utils.ts
│
├── data/
│   └── Ressources locales
│
├── LICENSE
├── README.md
├── package.json
├── pnpm-lock.yaml
└── ...
```

---

# Installation

## Prérequis

Vous devez disposer de :

* Git ;
* Node.js compatible avec la version de Next.js utilisée ;
* `pnpm`.

---

## Cloner le projet

```bash
git clone https://github.com/LeonelAwouma/algorithm_need_school.git
```

Puis :

```bash
cd algorithm_need_school
```

---

## Installer les dépendances

```bash
pnpm install
```

---

## Lancer l’environnement de développement

```bash
pnpm dev
```

Ouvrez ensuite l’adresse locale indiquée par Next.js.

Généralement :

```text
http://localhost:3000
```

---

## Compiler le projet

Avant de proposer une contribution :

```bash
pnpm build
```

Une Pull Request ne devrait pas introduire d’erreur de compilation.

---

# Format des données

L’application utilise actuellement deux principales sources.

## Établissements

Exemples de colonnes utilisées :

```text
id_etab
nom_etab
commune
departement
region
zone
type_etab
nb_classes
nb_enseignants_etat
nb_postes_ouverts
classes_multigrades
priorite_locale
```

---

## Enseignants

Exemples de colonnes utilisées :

```text
id_ens
nom
prenom
date_naissance
id_etab_attache
commune_attache
departement_attache
zone_attache
anciennete_carriere_ans
anciennete_poste_ans
situation_familiale
nb_enfants
formation_continue
statut
paye_par_etat
```

---

## Données de démonstration

Les contributeurs ne doivent pas publier :

* noms réels ;
* matricules réels ;
* dates de naissance réelles ;
* informations familiales réelles ;
* documents administratifs confidentiels.

Pour les tests, utilisez par exemple :

```text
ENS001
Jean Test
1990-01-01
École Démo A
```

ou des données entièrement synthétiques.

---

# État du projet

> **Statut : développement actif / expérimental**

Le projet possède déjà :

* un moteur fonctionnel ;
* une interface web ;
* un système de configuration ;
* des exports ;
* une documentation méthodologique.

Cependant, il ne doit pas encore être considéré comme un système de production permettant d’effectuer automatiquement des décisions administratives réelles.

Plusieurs éléments doivent encore être renforcés :

* tests ;
* validation métier ;
* contrôles des données ;
* explicabilité ;
* garde-fous ;
* performances ;
* documentation ;
* sécurité.

---

# Utilisateurs et cas d’usage

Le projet peut intéresser différents profils.

## Planificateurs de l’éducation

Pour analyser différentes stratégies de répartition du personnel.

## Services RH

Pour explorer différents scénarios avant une analyse humaine approfondie.

## Chercheurs

Pour expérimenter différentes méthodes d’allocation de ressources éducatives.

## Développeurs GovTech / CivicTech

Pour étudier des systèmes publics plus transparents et auditables.

## Étudiants

Dans des domaines comme :

* informatique ;
* data science ;
* recherche opérationnelle ;
* intelligence artificielle ;
* optimisation ;
* systèmes d’information ;
* administration publique.

## Organisations éducatives

Pour construire leurs propres simulations à partir d’un moteur configurable.

---

## Adoption actuelle

**Le projet ne revendique actuellement aucune adoption institutionnelle officielle.**

Il est encore dans une phase d’expérimentation et de développement.

Cette section pourra évoluer à mesure que :

* des testeurs utilisent le projet ;
* des contributeurs rejoignent le dépôt ;
* des institutions évaluent le prototype ;
* des cas d’usage documentés deviennent disponibles.

La transparence sur l’adoption réelle fait partie des principes du projet.

---

# Problèmes connus

La transparence sur les limites techniques fait partie intégrante du projet.

## Garde-fou du taux minimal d’encadrement

Le moteur prévoit un paramètre permettant d’éviter qu’une école fournisseuse ne tombe sous un certain seuil d’encadrement.

Cette protection doit encore être appliquée de manière complète dans toutes les phases concernées.

```text
TODO:
Ne pas vider une école fournisseuse
sous le seuil minimal configuré.
```

---

## Phase dédiée à certaines règles d’âge

Le moteur possède une logique de score liée à l’âge.

La phase indépendante destinée à prioriser certains mouvements liés à cette règle doit encore être complètement implémentée.

---

## Tests automatisés

La couverture de tests doit être fortement améliorée.

Les fonctions critiques qui devront disposer de tests incluent notamment :

```text
Parsing
Nettoyage
Barème individuel
Score enseignant-poste
Construction du vivier
Création des postes
Phases d'affectation
Garde-fous
Exports
```

---

## Validation des fichiers

La validation des colonnes et formats importés doit devenir plus stricte.

---

## Explication des scores

Le score final d’une affectation devrait pouvoir être décomposé en détail.

Exemple futur :

```text
Enseignant ENS001 → École A

Barème enseignant       + 27.2
Proximité               + 30.0
Ancienneté              + 8.0
Situation familiale     + 5.5
Règle âge               + 4.0
Règle zone              + 3.0
--------------------------------
Score final               77.7
```

---

# Roadmap

La roadmap ci-dessous est indicative et peut évoluer selon les contributions.

## Priorité haute

* [ ] Appliquer complètement le garde-fou empêchant de vider une école sous le seuil minimal d’encadrement.
* [ ] Finaliser la phase indépendante liée aux règles d’âge.
* [ ] Ajouter des tests unitaires pour le moteur.
* [ ] Ajouter des tests de scénarios complets.
* [ ] Créer des jeux de données synthétiques de référence.
* [ ] Améliorer la validation des fichiers Excel.
* [ ] Documenter précisément les formats d’entrée.

---

## Priorité moyenne

* [ ] Afficher la décomposition complète du score d’une affectation.
* [ ] Comparer plusieurs configurations dans une même session.
* [ ] Ajouter des scénarios enregistrables.
* [ ] Améliorer les messages d’erreur.
* [ ] Améliorer les performances avec de grands volumes de données.
* [ ] Ajouter un système explicite de versionnement du moteur.
* [ ] Versionner les configurations de simulation.
* [ ] Ajouter davantage de contrôles de cohérence.

---

## Explorations futures

* [ ] API publique/documentée du moteur.
* [ ] Algorithmes d’optimisation globale.
* [ ] Approches basées sur les graphes.
* [ ] Recherche opérationnelle.
* [ ] Comparaison séquentiel vs optimisation globale.
* [ ] Analyse de sensibilité des pondérations.
* [ ] Indicateurs d’équité.
* [ ] Visualisations géographiques.
* [ ] Internationalisation français / anglais.
* [ ] Adaptation à d’autres systèmes éducatifs.
* [ ] Documentation API.
* [ ] CI/CD avec GitHub Actions.
* [ ] Analyse automatisée de sécurité.

---

# Issues

Les bugs, demandes d’amélioration et discussions techniques peuvent être ouverts dans les GitHub Issues :

https://github.com/LeonelAwouma/algorithm_need_school/issues

Quelques catégories d’issues utiles :

```text
bug
feature
algorithm
methodology
documentation
performance
security
good first issue
help wanted
```

---

# Contribuer

Les contributions sont les bienvenues.

Il n’est pas nécessaire d’être spécialiste de l’algorithme pour contribuer.

Vous pouvez aider en :

* signalant un bug ;
* proposant une fonctionnalité ;
* améliorant la méthodologie ;
* ajoutant des tests ;
* améliorant la documentation ;
* proposant une traduction ;
* améliorant l’accessibilité ;
* améliorant l’interface ;
* améliorant les performances ;
* effectuant une revue de code ;
* analysant la sécurité ;
* créant des données synthétiques de test.

---

## Workflow recommandé

### 1. Ouvrir une Issue

Pour les modifications importantes, commencez par décrire :

* le problème ;
* le comportement actuel ;
* le comportement attendu ;
* la solution envisagée.

---

### 2. Forker le dépôt

Ou créer une branche si vous êtes collaborateur.

---

### 3. Créer une branche

Exemples :

```bash
git checkout -b feature/explain-assignment-score
```

ou :

```bash
git checkout -b fix/minimum-staffing-guard
```

ou :

```bash
git checkout -b docs/improve-methodology
```

---

### 4. Effectuer les modifications

Essayez de maintenir les changements :

* ciblés ;
* lisibles ;
* documentés.

---

### 5. Tester

Au minimum :

```bash
pnpm build
```

Lorsque la suite de tests automatisés sera disponible :

```bash
pnpm test
```

---

### 6. Faire des commits explicites

Exemples :

```bash
git commit -m "fix: enforce minimum staffing guard"
```

```bash
git commit -m "feat: explain assignment score breakdown"
```

```bash
git commit -m "docs: clarify contribution workflow"
```

---

### 7. Ouvrir une Pull Request

La Pull Request devrait préciser :

* le problème traité ;
* la solution proposée ;
* les fichiers concernés ;
* les tests effectués ;
* l’impact éventuel sur la méthodologie.

---

# Contributions méthodologiques

Les modifications du moteur peuvent avoir un impact important sur les résultats.

Les changements concernant :

* seuils ;
* poids ;
* règles d’éligibilité ;
* priorités territoriales ;
* règles familiales ;
* règles d’âge ;
* logique de proximité ;

doivent donc être particulièrement bien documentés.

Une proposition méthodologique devrait idéalement fournir :

### Problème

```text
Quel comportement pose problème ?
```

### Règle actuelle

```text
Comment le moteur fonctionne-t-il actuellement ?
```

### Règle proposée

```text
Que souhaitez-vous modifier ?
```

### Justification

```text
Pourquoi cette règle serait-elle préférable ?
```

### Exemple

```text
Avant → résultat A
Après → résultat B
```

### Risques

```text
Quels effets secondaires sont possibles ?
```

Cette approche permet de conserver un système compréhensible et auditable.

---

# Pull Requests

Les Pull Requests doivent idéalement rester limitées à un objectif principal.

Avant de soumettre une PR :

* vérifiez que le projet compile ;
* évitez d’ajouter des données sensibles ;
* documentez les nouvelles règles ;
* ajoutez des tests lorsqu’ils sont pertinents ;
* expliquez les changements méthodologiques.

Les contributions en **français ou en anglais** sont acceptées.

---

# Collaborateurs

Le projet est actuellement maintenu principalement par :

**Leonel Awouma**

GitHub :

https://github.com/LeonelAwouma

De futurs collaborateurs pourront rejoindre progressivement le projet en contribuant régulièrement à :

* la résolution d’Issues ;
* la revue de Pull Requests ;
* la documentation ;
* les tests ;
* l’architecture ;
* la méthodologie.

---

# Maintenance et gouvernance

La gouvernance reste volontairement simple pendant cette phase initiale.

## Bugs

Les bugs doivent être signalés avec les GitHub Issues.

## Nouvelles fonctionnalités

Les fonctionnalités importantes devraient être discutées avant leur implémentation.

## Modifications méthodologiques

Les changements pouvant modifier les résultats d’affectation doivent être documentés.

## Pull Requests

Les changements de code sont proposés à travers des Pull Requests afin de conserver :

* un historique ;
* une discussion ;
* une possibilité de revue.

## Évolution de la gouvernance

À mesure que le projet se développe, la gouvernance pourra évoluer vers plusieurs rôles :

```text
Maintainers
Reviewers
Contributors
Domain experts
Security reviewers
```

---

# Historique du développement

Le dépôt public a démarré le **10 septembre 2026**.

## 10 septembre 2026 — Initialisation

Premier commit du dépôt :

```text
9249276
Initial commit
```

---

## 10 septembre 2026 — Première version de l’application

Publication initiale du moteur de planification :

```text
625014c
Premier commit : application de planification des enseignants
```

---

## 10 septembre 2026 — Documentation initiale

Création du premier README :

```text
8efbabe
Create README.md for teacher planning application
```

---

## 10 septembre 2026 — Évolution du moteur

Améliorations des indicateurs, de la logique métier et de l’interface :

```text
7f6cbb9
```

---

## 10 septembre 2026 — Refonte vers l’affectation configurable

Passage vers la logique actuelle reposant sur :

* barème individuel ;
* score enseignant-poste ;
* phases d’affectation ;
* configuration dynamique.

Commit :

```text
d730aef
```

---

## 10 septembre 2026 — Paramétrage avancé

Extension de l’interface permettant de modifier davantage de paramètres :

```text
2655b4b
```

---

L’historique Git complet constitue la source de vérité concernant l’évolution du projet.

Vous pouvez le consulter directement depuis l’onglet **Commits** du dépôt.

---

# Sécurité et confidentialité

Ce projet peut être utilisé avec des informations liées au personnel éducatif.

Certaines données peuvent être sensibles :

* identité ;
* date de naissance ;
* situation familiale ;
* établissement d’affectation ;
* ancienneté ;
* informations administratives.

## Règles pour les contributions

Ne publiez jamais dans :

* le dépôt ;
* une Issue ;
* une Pull Request ;
* un commentaire ;

des données personnelles réelles provenant de fichiers administratifs.

---

## Utiliser des données synthétiques

Exemple :

```text
id_ens: ENS001
nom: TEST
prenom: Alice
date_naissance: 1990-01-01
commune_attache: Commune A
anciennete_poste_ans: 7
```

Ces informations ne doivent correspondre à aucune personne réelle.

---

## Vulnérabilités

Si vous identifiez une vulnérabilité pouvant exposer des données ou compromettre le fonctionnement du projet, évitez de publier immédiatement des détails exploitables dans une Issue publique.

Une procédure de signalement de sécurité plus formelle pourra être ajoutée à mesure que le projet mûrit.

---

# Limites méthodologiques

Un score algorithmique ne représente jamais parfaitement toutes les réalités humaines et administratives.

Le moteur ne connaît pas nécessairement :

* toutes les contraintes administratives ;
* toutes les situations individuelles ;
* les décisions politiques ;
* les contraintes budgétaires ;
* les besoins pédagogiques particuliers ;
* les situations sociales exceptionnelles ;
* toutes les règles officielles applicables.

Les résultats doivent donc être interprétés comme :

> **des propositions de simulation à examiner, et non comme des décisions automatiques.**

---

# Reproductibilité

L’un des objectifs futurs importants du projet est de permettre de documenter précisément une simulation avec :

```text
Version moteur
+
Version configuration
+
Jeu de données
=
Simulation reproductible
```

Cela permettra de comparer différents scénarios de manière plus rigoureuse.

---

# Pourquoi contribuer ?

La planification des enseignants est un problème qui croise plusieurs domaines :

```text
Éducation
+
Informatique
+
Data
+
Recherche opérationnelle
+
Politiques publiques
+
Optimisation
```

Cela signifie que les contributions peuvent venir de profils très différents.

Un développeur peut améliorer le moteur.

Un statisticien peut analyser les indicateurs.

Un spécialiste de l’éducation peut challenger les hypothèses.

Un designer peut améliorer la compréhension des résultats.

Un spécialiste sécurité peut renforcer la protection des données.

Un étudiant peut écrire des tests ou améliorer la documentation.

---

# Licence

Ce projet est distribué sous licence **MIT**.

Voir :

[`LICENSE`](LICENSE)

La licence MIT autorise notamment l’utilisation, la copie, la modification et la redistribution du logiciel sous réserve du respect des conditions prévues dans la licence.

---

# Avertissement

Ce logiciel est un projet expérimental de simulation, de recherche et d’aide à la décision.

Il ne constitue pas :

* une décision administrative ;
* une liste officielle de mutations ;
* un quota officiel de recrutement ;
* un système officiel d’un ministère ;
* une validation automatique d’une affectation.

Toute décision réelle concernant l’affectation d’un enseignant doit rester sous la responsabilité des autorités et professionnels compétents et prendre en compte :

* les règles administratives applicables ;
* les données vérifiées ;
* le contexte humain ;
* les contraintes institutionnelles.

---

# Contribuer au projet

Si vous souhaitez participer :

1. ⭐ Ajoutez une étoile au dépôt si le projet vous intéresse.
2. 🔎 Consultez les Issues.
3. 🐛 Signalez les bugs.
4. 💡 Proposez des améliorations.
5. 🧪 Ajoutez des tests.
6. 📖 Améliorez la documentation.
7. 🔀 Ouvrez une Pull Request.

Repository:

https://github.com/LeonelAwouma/algorithm_need_school

Issues:

https://github.com/LeonelAwouma/algorithm_need_school/issues

---

## Maintainer

**Leonel Awouma**

GitHub:
https://github.com/LeonelAwouma

---

> **Open source education planning, built around transparency, reproducibility and human oversight.**
