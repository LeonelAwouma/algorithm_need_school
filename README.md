# AlgoPlanR — Affectation des enseignants

<p align="center">
  <img src="public/logo-full.png" alt="AlgoPlanR" height="120" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="public/logo-parec.png" alt="PAREC — Programme d’appui à la réforme de l’éducation au Cameroun" height="120" />
</p>

<p align="center"><em>Avec le soutien du PAREC — Programme d’appui à la réforme de l’éducation au Cameroun</em></p>

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
* [Règles de calcul](#règles-de-calcul--le-référentiel-technique-de-modélisation)
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

## Contrôle d’accès : DRH et délégués régionaux

Rien de l’application n’est affiché tant que personne n’est identifié.

* **DRH** — crée son mot de passe à la première utilisation, accède à tout, et administre les accès depuis la page « Accès des délégués ».
* **Délégué régional** — choisit sa région parmi les dix et saisit le code remis par le DRH. Un code exact ne suffit pas : son entrée reste **« En attente de validation »** jusqu’à la décision du DRH. Une fois validé, il entre avec son code à chaque lancement, tant que le DRH n’a ni suspendu ni retiré son accès.
* **Périmètre du délégué** — uniquement les établissements et les enseignants de sa région, écartés dès l’import (`lib/acces/perimetre.ts`). Le Fait de Prince, le référentiel, la configuration du moteur et la gestion des accès sont réservés au DRH.

Les règles sont dans `lib/acces/registre.ts` (testées par `tests/acces.test.ts`) : un seul code actif par région, secrets conservés sous forme d’empreinte PBKDF2, blocage de cinq minutes après cinq essais infructueux. Le registre est un fichier local (`acces.json` dans le dossier de données de l’application) : il ne contient aucune donnée d’établissement ni d’enseignant.

**Limite actuelle** — le registre est propre à chaque poste : la validation par le DRH se fait sur le poste où le délégué se connecte. C’est un contrôle d’usage, pas une protection contre une personne ayant la main sur le poste.

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

## Règles de calcul : le Référentiel technique de modélisation

Le moteur applique le *Référentiel technique de modélisation des plans de rotation, de redéploiement et de déploiement*. Chaque exemple chiffré du référentiel est repris dans `tests/referentiel.test.ts` (écoles A à E, école bilingue, degré d’aléa, indices de priorité, scores, exemple de Gale et Shapley, classement unique, recrutement à prévoir).

### Diagnostic des besoins (§2.1 à §2.4)

Calculé école par école, et section par section pour une école bilingue (`lib/analytics/diagnostic.ts`) :

```text
E    = enseignants de l'État en poste − départs connus (retraites)
P    = ⌈N ÷ 60⌉                       maîtres selon la norme (tolérance d'arrondi paramétrable)
m    = niveaux ouverts ÷ niveaux par maître (minimum pédagogique)
D    = max(P ; m)                     dotation théorique
BMAX = salles simple flux + 2 × salles double flux
K    = min(D ; BMAX)                  cible réellement affectable
b    = max(0 ; K − E)                 besoin : postes à ouvrir
x    = max(0 ; E − D)                 excédent mobilisable
a    = max(0 ; min(E ; D) − BMAX)     surnombre lié aux salles (à examiner, jamais redéployé)
s    = max(0 ; D − BMAX)              salles manquantes (besoin en infrastructures)
```

Classement : nécessiteuse (b > 0), excédentaire (x > 0), à examiner (a > 0), équilibrée. Sans effectif d’élèves, P se replie sur « une classe, un maître » et l’école est signalée. Les départs connus sont lus dans le fichier des établissements, ou repérés dans le fichier des enseignants à partir de l’âge de la retraite.

### Sous-systèmes francophone et anglophone

Une école bilingue (une ligne par section, même code) forme deux unités de calcul. Aucun besoin n’est compensé d’un sous-système à l’autre et l’algorithme n’affecte personne hors de son sous-système ; seule une commission peut décider un changement.

### Priorité des postes (§3.1)

```text
w = accessibilité (urbain 5, rural 10, rural enclavé 20) + sécurité (verte 0, jaune 10, rouge 25)
niveau de difficulté : 1 si w ≥ 30, 2 si w ≥ 15, sinon 3
β = 0 (REM ≤ 80), 5 (≤ 100), 10 (≤ 150), 15 au-delà ou école sans maître ; 0 pour une structure
u = w + β
```

Les postes (écoles nécessiteuses et structures d’accueil : délégations, IAEB) sont servis par indice décroissant ; à indice égal, les écoles avant les structures, puis le REM le plus élevé.

### Demandes de mutation et score (§3.2, §3.3)

Une demande (trois vœux classés au plus) est recevable avec 5 ans de stabilité au poste et depuis une école excédentaire ; les départs d’une école restent dans la limite de son excédent x.

```text
S(t,e) = A + Z + B
A = min(20 ; 10 + (années au poste − 6)) − 5 à moins de 5 ans de la retraite (0 avant 6 ans)
Z = min(10 ; 2 × années en niveau 1 + années en niveau 2)
B = 10 pour l'école visée par un motif justifié (santé, regroupement familial)
départage : ancienneté générale, puis âge, puis rang de tirage au sort
```

### Plan de rotation et de redéploiement (§3.4 à §3.10)

Dans l’ordre (`lib/simulation/engine.ts`) :

1. décisions de commission déjà prises (validation, rejet, correction) ;
2. acceptation différée de Gale et Shapley sur les vœux intrarégionaux (`lib/simulation/appariement.ts`) — vœux examinés dans l’ordre de l’enseignant, ou par poids des écoles en variante ;
3. dans le scénario étendu, niveau central pour les vœux interrégionaux ;
4. solution la plus proche, hors vœux, hors zone rouge, pour les demandes non satisfaites ;
5. combinaisons proposées à la commission pour les écoles non couvertes (direct, chaîne, permutation) ;
6. redéploiement obligatoire depuis l’école excédentaire la plus proche du même sous-système, jamais en zone rouge ; l’ordre des départs dans une école suit le barème individuel (ancienneté, situation familiale, enfants, formation, âge), critères que le référentiel laisse à la DRH ;
7. recalcul des besoins, déploiement des nouveaux recrutés par note d’admission (`lib/simulation/recrutes.ts`) et projection N+2.

Agrégation par sous-système, recrutement à prévoir `REC = R + ⌈τ* × E ÷ 100⌉` et degré d’aléa `(B + X) ÷ Σ K` : `lib/analytics/synthese.ts`.

Après chaque simulation, onze contrôles sont vérifiés : unicité de l’enseignant et du poste, respect de l’excédent, absence de déficit créé, origine légitime des propositions, conservation du besoin, périmètre, absence de mouvement interne, faits de Prince, sous-systèmes et zone rouge.

### Reprise du moteur de référence MINEDUB (script Python)

La logique du moteur Python (`app_affectation_enseignants.py`) est intégrée, avec ses corrections :

| Élément du script | Dans l’application |
|---|---|
| Colonnes officielles (`Identifiant_Ecole`, `Salles_Simple_Flux`, `Circonscription_IAEB`, `Age`, `Motif_Bonification`…) | reconnues telles quelles ; jeu d’essai `data/exemples/format-minedub-*.xlsx` |
| Minimum pédagogique selon `Classes_Multigrades` | école par école : 6 maîtres sans multigrade, 3 en multigrade, entre les deux selon le nombre de classes multigrades |
| Barème individuel C1 à C5 | repris ; C1 = ancienneté + Z plafonné à 10 (le script multipliait l’ancienneté par max(10 ; 2 n1 + n2)), C2 = points A du référentiel |
| Score d’appariement Z1 à Z4 et ajustements | repris ; choisit le maître du redéploiement obligatoire, et peut classer les candidats en variante |
| Phase 1 « vœux » gloutonne, poste par poste | remplacée par l’acceptation différée : le résultat ne dépend plus de l’ordre des postes et respecte l’ordre des vœux |
| Phases IAEB, département, extension | passes successives du redéploiement obligatoire, de la commune au niveau central |
| Poids `Wp = 0,3 α + 0,7 σ` | w = α + σ (coefficients paramétrables) : avec 0,3 et 0,7, aucune école n’atteignait le seuil de 30 points du niveau de difficulté 1 |
| Accessibilité rural = 15 | rural = 10 comme au référentiel ; semi-urbain ajouté, paramétrable |
| Effet de Prince réservé aux enseignants du vivier, mot de passe en clair | décision du DRH sans contrôle de l’algorithme, réservée au rôle DRH ; import d’un fichier de décisions ajouté |
| Projections N à N+3 | reprises ; retraites comptées sur tous les enseignants (et non le seul vivier), attrition appliquée au territoire et non arrondie école par école |
| Note ministérielle et audit par IA générative (Gemini) | non repris : ils enverraient les données hors du poste |

### Ce qui n’est pas calculé

Les taux de stabilité, de rotation et d’intégration exigent un historique pluriannuel des mouvements. Le modèle d’élasticité à la productivité n’est pas défini par les sources : conformément au référentiel (§2.7), il n’est pas intégré.

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

## Publier une nouvelle version de l’application de bureau

L’application installée (AlgoPlanR) se met à jour seule depuis les **GitHub Releases** de ce dépôt.

### Côté utilisateur

1. Au lancement, puis toutes les quatre heures, l’application vérifie s’il existe une version plus récente.
2. Si oui, elle la télécharge en arrière-plan et vérifie son empreinte SHA-512. L’utilisateur peut continuer à travailler.
3. Un bandeau annonce que la version est prête. Elle s’installe :
   * **à la fermeture** de l’application, sans aucune fenêtre ;
   * ou **tout de suite**, par le bouton « Redémarrer et installer » : l’installateur affiche le logo et la barre de progression, sans poser de question, puis l’application se rouvre d’elle-même.

Le bandeau rappelle que les données importées et les faits de Prince, qui ne vivent qu’en mémoire, sont effacés au redémarrage.

Sans connexion, la vérification échoue en silence et l’application fonctionne normalement. Elle ne transmet aucune donnée : seule la demande du fichier de version publié part vers GitHub. Sur un poste où tout accès extérieur est proscrit, la variable d’environnement `ALGOBABA_SANS_MISE_A_JOUR=1` désactive entièrement les mises à jour.

Le journal des vérifications se trouve dans `%APPDATA%\planification-enseignants-desktop\mises-a-jour.log`.

### Côté mainteneur

1. Augmenter le numéro de version dans `electron-app/package.json` (par exemple `0.2.0` → `0.2.1`). **Sans changement de version, aucun poste ne se met à jour.**
2. Créer un jeton GitHub (Settings → Developer settings → Fine-grained tokens) avec l’accès **Contents : Read and write** sur ce dépôt, puis le placer dans la variable d’environnement `GH_TOKEN`. Ne jamais l’écrire dans un fichier du dépôt.
3. Lancer, depuis la racine du projet :

   ```bash
   npm run release
   ```

   Cette commande construit l’installateur et le dépose, avec `latest.yml` et sa carte des blocs, dans un **brouillon** de release sur GitHub.
4. Relire le brouillon sur GitHub, puis cliquer sur **Publish release**. Les postes le reçoivent à leur prochaine vérification.

Le brouillon est une étape de contrôle volontaire : tant qu’il n’est pas publié, aucun utilisateur ne le reçoit.

Pour construire un installateur sans rien publier : `npm run dist`.

> La version 0.1.0, installée avant l’ajout des mises à jour automatiques, ne sait pas se mettre à jour. Il faut installer une fois la 0.2.0 à la main ; les versions suivantes arriveront seules.

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
type_etab                 (IAEB, DR, DD : structure d'accueil sans élèves)
nb_classes
nb_salles_classe          (salles utilisables : BMAX)
salles_double_flux        (parmi elles, salles en double flux)
niveaux_ouverts           (minimum pédagogique)
departs_connus            (facultatif : sinon déduits des âges)
effectif_total_eleves     (N : norme de 60 élèves par maître)
nb_enseignants_etat
nb_postes_ouverts         (structures : postes fixés par la hiérarchie)
sous_systeme              (francophone / anglophone ; école bilingue : une ligne par section)
zone_securite             (verte / jaune / rouge)
accessibilite             (urbain / rural / rural enclavé)
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
anciennete_carriere_ans   (ancienneté générale : départage)
anciennete_poste_ans      (stabilité et points A)
situation_familiale
nb_enfants
formation_continue
statut
paye_par_etat
sous_systeme
voeu_1, voeu_2, voeu_3    (codes des écoles sollicitées)
motif_demande
ecole_motif               (école visée par la bonification)
annees_zone_niveau_1
annees_zone_niveau_2
rang_tirage
```

## Nouveaux recrutés

Fichier facultatif, importé dans la page « Nouveaux recrutés » : `matricule`, `nom`, `note`, `sous_systeme`, `sexe`, `commune_residence`, `choix_1` à `choix_3`. Aucun jeu d’essai n’est livré pour ce fichier : `tests/exemples.test.ts` en construit un à partir du jeu MINEDUB.

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

## Proximité administrative

La proximité repose sur l’égalité des libellés de commune, de département et de région déclarés dans les fichiers, pas sur des distances réelles.

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
