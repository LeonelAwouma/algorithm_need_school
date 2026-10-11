# AlgoPlanR — Routes API des nouvelles fonctionnalités

*Planification prévisionnelle sur cinq ans, vivier et nominations*

**Objet.** Ce document liste les routes d’API à ajouter ou à modifier pour intégrer les évolutions demandées dans le *Mémo de synthèse* : tableau de planification sur cinq ans, nomination depuis le vivier, journal d’audit. Il complète le *Plan technique : backend Django et frontend DDD* (`docs/Plan-backend-Django-DDD.docx`) et en reprend les conventions.

**Date.** 10 octobre 2026. **Statut.** Proposition — plusieurs règles de calcul dépendent des points que le mémo demande de valider (section 9).

## 1. Ce que demande le mémo, et ce qui existe déjà

Une partie du socle existe dans la version 1.0.0. Les nouvelles routes s’appuient dessus plutôt que de repartir de zéro.

| Exigence du mémo | Déjà dans l’application | À créer |
|---|---|---|
| Tableau de planification sur 5 ans (§2.1) | Projection N+1 à N+3 (`projeterPluriannuel`, page « Projections ») : retraites par âge, attrition au niveau du territoire, besoin, recrutement à prévoir. | Horizon de 5 ans, 8 indicateurs par année, ventilation par niveau territorial et sous-système, versions successives. |
| Nomination depuis le vivier (§2.2) | Vivier de redéploiement (excédentaires, `construireVivier`) et vivier national des recrues sans poste (`deployerRecrues`). Aucun suivi de statut. | Module Nominations : rapprochement vivier ↔ postes, statuts proposée / validée / mise en œuvre, contrôle des doubles comptages. |
| Maintien du déploiement (§2.3) | Diagnostic, besoins, redéploiement, déploiement des recrues, postes restés vacants. | Branchement des postes vacants sur le besoin résiduel de chaque année. |
| Hypothèses explicites et paramétrables (§3) | `besoin.ageRetraite` et `recrutement.tauxAttritionHorsRetraite` dans les paramètres du moteur. | Groupe « Hypothèses » documenté (source, justification, historique), méthode d’attrition au choix. |
| Recalcul à chaque actualisation ou décision (§3) | Les scénarios sont recalculés après un fait du Prince, un arbitrage ou un import de recrues. | Recalcul de la planification, actualisation des données d’un même exercice, versions. |
| Indicateurs de suivi et journaux d’audit (§3, étape 6) | Le « journal » actuel ne trace que les tours de l’appariement. | Journal d’audit de toutes les décisions ; indicateurs de suivi. |

## 2. La chaîne de traitement et ses routes

Le mémo organise l’évolution en six étapes. Chacune correspond à un groupe de routes :

| Étape du mémo | Routes | Section |
|---|---|---|
| 1. Consolidation et validation des données de référence | `jeux/{jeu}/validation/, actualisations/` | 4.1 |
| 2. Projection des départs (retraite, attrition) | `hypotheses/, planification/departs/` | 4.2, 4.3 |
| 3. Besoins et quotas prévisionnels sur 5 ans | `planification/, quotas/` | 4.3, 4.4 |
| 4. Gestion du vivier et suivi des nominations | `vivier/, postes-ouverts/, nominations/` | 4.5 |
| 5. Actualisation, redéploiement et déploiement | `mouvements/ + routes existantes` | 4.6, 7 |
| 6. Tableaux de sortie, indicateurs, audit | `indicateurs/, journal-audit/, rapport/` | 4.7, 4.8 |

## 3. Conventions

- Toutes les routes sont sous `/api/v1/` ; `jeux/{jeu}/` désigne l’exercice de planification (le jeu de données importé).
- **Filtres territoriaux communs** : `niveau` (`national`, `region`, `departement`, `commune`, `iaeb`, `ecole`), `region`, `departement`, `commune`, `iaeb`, `sousSysteme` (`francophone`, `anglophone`). Les niveaux réellement attendus sont à confirmer (section 9).
- **Filtres de planification** : `scenario` (par défaut, le scénario retenu), `annee` (`N+1` à `N+5`), `version` (par défaut, la dernière).
- **Codes de retour métier** : 422 pour une règle non respectée (motif renvoyé), 409 pour un conflit — par exemple une personne déjà nommée ou un poste déjà pourvu.
- Chaque écriture (POST, PUT, PATCH, DELETE) produit un événement dans le journal d’audit et, si elle change les effectifs, déclenche le recalcul.
- Les fichiers XLSX et DOCX (tableau sur 5 ans, liste des nominations) restent générés par le frontend à partir du JSON, comme les exports actuels.

## 4. Nouvelles routes

### 4.1 Données de référence : validation et actualisation

Étape 1 de la chaîne. Un jeu importé est d’abord en **brouillon** ; une fois validé, il sert de référence aux projections. Une **actualisation** remplace les données d’un même exercice sans perdre les décisions déjà prises.

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `jeux/{jeu}/validation/` | Valide le jeu comme référence : contrôles de qualité bloquants, passage brouillon → validé, auteur et date journalisés. |
| `GET` | `jeux/{jeu}/validation/` | Statut, date, auteur, résultat des contrôles. |
| `POST` | `jeux/{jeu}/actualisations/` | Nouveaux fichiers pour le même exercice : rapprochement par matricule et code école, décisions conservées si elles restent valables, recalcul complet. |
| `GET` | `jeux/{jeu}/actualisations/` | Historique des actualisations. |
| `GET` | `jeux/{jeu}/actualisations/{id}/ecarts/` | Arrivées, départs, changements d’école, décisions devenues invalides. |

### 4.2 Hypothèses de calcul

Le mémo exige des hypothèses **explicites, paramétrables et documentées**. Chaque valeur porte sa source et sa justification ; chaque modification est historisée et relance les projections.

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/hypotheses/defaut/` | Valeurs par défaut. |
| `GET PUT` | `jeux/{jeu}/hypotheses/` | Horizon (5 ans) ; règle de retraite (âge légal, date de référence, exceptions par statut ou catégorie) ; méthode et taux d’attrition (taux unique, par sous-système ou par région) ; prise en compte des quotas des années précédentes ; sources du vivier retenues. |
| `GET` | `jeux/{jeu}/hypotheses/documentation/` | Fiche lisible des hypothèses en vigueur, reprise dans le rapport et la méthodologie. |
| `GET` | `jeux/{jeu}/hypotheses/historique/` | Versions successives : qui, quand, quoi, pourquoi. |
| `POST` | `jeux/{jeu}/hypotheses/attrition/estimer/` | Propose un taux à partir des données disponibles, sans l’enregistrer (seulement si la méthode officielle le permet). |

### 4.3 Planification sur cinq ans

Le cœur de l’évolution. Le tableau couvre N+1 à N+5 et présente, pour chaque année, les huit indicateurs du mémo (détaillés en section 6), accompagnés d’un indicateur de fiabilité des données.

| Méthode | Route | Rôle |
|---|---|---|
| `PUT` | `jeux/{jeu}/scenario-retenu/` | Choisit le scénario dont les mouvements alimentent la planification. |
| `GET` | `jeux/{jeu}/planification/` | Tableau N+1 → N+5 pour le périmètre demandé (filtres territoriaux et sous-système). |
| `GET` | `jeux/{jeu}/planification/territoires/` | Même tableau ventilé par territoire enfant, pour descendre région → département → commune. |
| `GET` | `jeux/{jeu}/planification/sous-systemes/` | Ventilation francophone / anglophone. |
| `GET` | `jeux/{jeu}/planification/ecoles/` | Lignes par école, paginées. |
| `GET` | `jeux/{jeu}/planification/departs/` | Plan des départs : liste nominative des départs à la retraite par année, attrition estimée par territoire. |
| `GET` | `jeux/{jeu}/planification/fiabilite/` | Disponibilité des données par territoire : dates de naissance, sous-système, effectifs d’élèves renseignés. |
| `GET` | `jeux/{jeu}/planification/etat/` | Dernier calcul, ce qui l’a déclenché, obsolescence éventuelle. |
| `POST` | `jeux/{jeu}/planification/recalculer/` | Recalcul manuel (le recalcul est normalement automatique). |
| `GET` | `jeux/{jeu}/planification/versions/` | Instantanés conservés à chaque recalcul. |
| `GET` | `jeux/{jeu}/planification/versions/{v}/` | Un instantané. |
| `GET` | `jeux/{jeu}/planification/versions/comparer/?de=&a=` | Écarts entre deux versions, pour suivre le prévu et le réalisé. |

### 4.4 Quotas de recrutement

Le quota est d’abord **calculé**, puis éventuellement **ajusté** par l’administration (avec motif), puis **validé**. L’écart entre calcul et quota retenu reste visible.

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `jeux/{jeu}/quotas/` | Quotas calculés et retenus par année, territoire et sous-système. |
| `PUT` | `jeux/{jeu}/quotas/{annee}/{codeTerritoire}/` | Ajustement administratif : sous-système concerné, valeur retenue et motif obligatoire. |
| `POST` | `jeux/{jeu}/quotas/valider/` | Valide (et fige) les quotas d’une année. |
| `GET` | `jeux/{jeu}/quotas/historique/` | Calculs, ajustements et validations successifs. |

### 4.5 Vivier et nominations

Module demandé au §2.2 du mémo. Le **vivier** réunit les personnes disponibles, quelle que soit leur origine : enseignants excédentaires restés sans affectation, lauréats sans poste (vivier national actuel), et éventuellement d’autres sources si elles sont retenues (personnels en disponibilité, fins de détachement…).

#### Vivier et postes ouverts

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `jeux/{jeu}/vivier/` | Personnes disponibles ; filtres : source, territoire, sous-système, disponibilité (libre, proposée, nommée). |
| `GET` | `jeux/{jeu}/vivier/{personne}/` | Fiche : barème, contraintes, historique des propositions. |
| `POST` | `jeux/{jeu}/vivier/import/` | Ajout de personnes issues d’autres sources (si cette portée est retenue). |
| `GET` | `jeux/{jeu}/vivier/{personne}/postes-compatibles/` | Rapprochement classé : proximité, sous-système, zone de sécurité, score d’appariement. |
| `GET` | `jeux/{jeu}/postes-ouverts/` | Postes vacants après redéploiement, avec leur statut : libre, réservé, pourvu. |
| `GET` | `jeux/{jeu}/postes-ouverts/{poste}/candidats/` | Rapprochement inverse : personnes du vivier classées pour ce poste. |

#### Nominations

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `jeux/{jeu}/nominations/generer/` | Propositions automatiques par appariement vivier ↔ postes ouverts (statut « proposée »). |
| `GET` | `jeux/{jeu}/nominations/` | Liste filtrable par statut, territoire, année, source. |
| `POST` | `jeux/{jeu}/nominations/` | Proposition manuelle (personne, poste, motif). |
| `GET` | `jeux/{jeu}/nominations/{id}/` | Détail et historique des changements de statut. |
| `POST` | `jeux/{jeu}/nominations/{id}/valider/` | Proposée → validée ; référence de la décision. |
| `POST` | `jeux/{jeu}/nominations/{id}/rejeter/` | Proposée → rejetée ; motif obligatoire. |
| `POST` | `jeux/{jeu}/nominations/{id}/mettre-en-oeuvre/` | Validée → mise en œuvre ; date effective, référence de l’acte. Met à jour les effectifs. |
| `POST` | `jeux/{jeu}/nominations/{id}/annuler/` | Proposée ou validée → annulée ; motif obligatoire. |
| `POST` | `jeux/{jeu}/nominations/lot/` | Validation ou rejet en lot. |
| `POST` | `jeux/{jeu}/nominations/import/` | Import de nominations déjà décidées ou réalisées hors de l’application. |
| `GET` | `jeux/{jeu}/nominations/synthese/` | Décomptes par statut, territoire et année. |

### 4.6 Registre des mouvements

Pour **éviter les doubles comptages et garantir la traçabilité** (§2.2), tous les mouvements sont consolidés dans un registre unique : redéploiements validés, faits du Prince, déploiements de recrues, nominations. La planification lit ce registre, et lui seul.

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `jeux/{jeu}/mouvements/` | Registre consolidé ; filtres : type, statut (prévu, réalisé), année, territoire. |
| `GET` | `jeux/{jeu}/mouvements/{id}/` | Détail d’un mouvement et de sa décision d’origine. |
| `POST` | `jeux/{jeu}/mouvements/{id}/mettre-en-oeuvre/` | Marque comme réalisé un redéploiement ou un déploiement de recrue. |
| `GET` | `jeux/{jeu}/mouvements/controles/` | Détection des incohérences : personne ou poste comptés deux fois. |
| `GET` | `jeux/{jeu}/personnes/{matricule}/mouvements/` | Traçabilité individuelle de tous les mouvements d’une personne. |

### 4.7 Indicateurs de suivi

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `jeux/{jeu}/indicateurs/` | Couverture du besoin, mobilisation du vivier, réalisation des nominations, écart prévu / réalisé, besoin résiduel ; par périmètre. |
| `GET` | `jeux/{jeu}/indicateurs/evolution/` | Évolution de ces indicateurs d’une version de planification à l’autre. |

### 4.8 Journal d’audit

Événements journalisés : import, actualisation, validation des données, modification d’hypothèses, choix du scénario retenu, fait du Prince, arbitrage, chaque changement de statut d’une nomination, ajustement ou validation de quota, mise en œuvre d’un mouvement, recalcul.

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `jeux/{jeu}/journal-audit/` | Événements ; filtres : type, objet (`?objet=nomination:42`), auteur, période. |
| `GET` | `jeux/{jeu}/journal-audit/{id}/` | Détail d’un événement : valeurs avant et après. |

## 5. Cycle de vie d’une nomination

Le mémo demande de distinguer les décisions **proposées**, **validées** et **effectivement mises en œuvre**.

```
              valider              mettre-en-oeuvre
  proposée ─────────────► validée ─────────────────► mise en œuvre (définitive)
     │                       │
     ├── rejeter ──► rejetée  │
     └── annuler ──► annulée ◄┘ annuler
```

| Statut | Effet sur la planification |
|---|---|
| Proposée | Affichée, mais n’est comptée nulle part. La personne et le poste restent disponibles pour d’autres propositions. |
| Validée | Comptée en « prévu ». La personne sort du vivier disponible ; le poste devient « réservé » et sort des postes ouverts au redéploiement et au déploiement des recrues. |
| Mise en œuvre | Comptée en « réalisé ». Les effectifs des écoles sont modifiés avant tout calcul, comme pour un fait du Prince. Une erreur se corrige par un nouveau mouvement, jamais en effaçant celui-ci. |
| Rejetée, annulée | Sans effet ; conservée dans l’historique. |

**Règles contre les doubles comptages** (refus en 409) :

- une personne ne peut avoir qu’une nomination active (proposée ou validée) et ne peut pas, en même temps, figurer dans un redéploiement validé ou un déploiement de recrue ;
- un poste ne peut être réservé que par une seule nomination validée ;
- une nomination mise en œuvre sort définitivement la personne du vivier.

## 6. Contenu du tableau de planification

Pour chaque année de N+1 à N+5, par territoire et par sous-système. Les règles ci-dessous prolongent celles du référentiel technique ; elles sont **à confirmer** là où le mémo demande une validation.

| Indicateur du mémo | Règle de calcul proposée | Source actuelle |
|---|---|---|
| Effectif disponible en début de période | N+1 : effectif après les mouvements retenus. Années suivantes : effectif précédent − retraites − attrition + entrées prévues ou réalisées (+ quotas de l’année précédente si l’hypothèse est activée). | `projeterPluriannuel` (N+1 à N+3) |
| Départs à la retraite | Enseignants payés par l’État qui atteignent l’âge légal pendant l’année ; chacun compté une seule fois. | idem, étendu à 5 ans |
| Départs par attrition | ⌈τ × effectif / 100⌉, appliqué au niveau du territoire par sous-système (§2.6), pas école par école. | `tauxAttritionHorsRetraite` |
| Besoin prévisionnel | Somme sur les écoles de max(0 ; K − effectif), avec K la cible du §2.4. | `calculerBesoin` |
| Ressources mobilisables depuis le vivier | Excédents mobilisables + personnes du vivier encore libres. | `construireVivier`, vivier national |
| Quota de recrutement | max(0 ; besoin − ressources mobilisables) + attrition cumulée ; puis ajustement et validation administratifs. | `recrutementAPrevoir` |
| Nominations et déploiements | Deux colonnes : prévus (validés) et réalisés (mis en œuvre), lues dans le registre des mouvements. | nouveau |
| Besoin restant à couvrir | Besoin − ressources mobilisées − nominations − recrutements. Alimenté par les postes restés vacants après déploiement (§2.3). | `postesRestants` |

## 7. Routes existantes modifiées

| Route existante | Modification |
|---|---|
| `POST /jeux/` | Le jeu est créé en brouillon ; la planification est calculée dès l’import. |
| `jeux/{jeu}/parametres/` | L’âge de retraite et le taux d’attrition passent dans hypotheses/, qui reste la seule source pour ces valeurs. |
| `jeux/{jeu}/diagnostic/` | Tient compte des nominations mises en œuvre, comme des faits du Prince. |
| `jeux/{jeu}/scenarios/…` | Les personnes nommées (validées ou mises en œuvre) et les postes réservés sont exclus de l’appariement. |
| `…/{sid}/projections/` | Remplacée par planification/ (5 ans). Conservée temporairement pour compatibilité. |
| `…/{sid}/postes-non-couverts/, …/{sid}/recrutes/` | Les postes réservés par une nomination validée sont exclus. |
| `faits-prince/, arbitrages/, recrues/` | Chaque décision alimente le registre des mouvements, le journal d’audit et le recalcul de la planification. |
| `jeux/{jeu}/rapport/` | Ajout du tableau sur 5 ans, des quotas, des nominations et de la fiche des hypothèses. |

## 8. Conséquences sur l’architecture

Trois contextes délimités s’ajoutent au plan de migration, côté backend (applications Django et domaine Python) comme côté frontend (`src/contextes/`) :

| Contexte | Domaine | Nouvelles entités persistées |
|---|---|---|
| planification | Projection sur 5 ans, quotas, hypothèses, versions. | `Hypotheses`, `VersionPlanification`, `QuotaRecrutement` |
| nominations | Vivier consolidé, rapprochement, cycle de vie, registre des mouvements. | `PersonneVivier`, `Nomination`, `TransitionNomination`, `Mouvement` |
| audit | Journal transverse, alimenté par les services de tous les contextes. | `EvenementAudit` |

S’y ajoutent `ValidationJeu` et `Actualisation` dans le contexte **donnees**. Dans la page unique, la page « Projections N+1 → N+3 » devient « Planification sur 5 ans », et deux pages s’ajoutent : « Vivier et nominations », « Journal d’audit ».

## 9. Points à valider avant la mise en œuvre

Repris du mémo (§4) :

1. La méthode officielle de calcul du taux d’attrition — elle fixe le contenu de `hypotheses/` et de `hypotheses/attrition/estimer/`.
2. Les règles réglementaires et les données à utiliser pour prévoir les départs à la retraite (âge légal unique ou selon le statut, la catégorie ; date de référence).
3. La portée exacte de la nomination depuis le vivier — elle fixe les sources du vivier et l’utilité de `vivier/import/`.
4. Les niveaux territoriaux et administratifs attendus pour les tableaux (région, département, commune, IAEB…).
5. La fréquence de mise à jour des données et les responsabilités de validation.

Ajoutés par l’analyse technique :

6. **Auteur des décisions.** Le module d’accès étant désactivé, l’application ne sait pas qui valide. Le journal d’audit et les validations demandent soit sa réactivation, soit la saisie du nom de l’agent à chaque décision.
7. **Arrondi de l’attrition.** Arrondie au niveau de chaque territoire, la somme des régions peut dépasser le total national de quelques unités. Il faut choisir le niveau où l’arrondi s’applique.
8. **Quotas des années précédentes.** Faut-il supposer que les quotas de N+1 sont recrutés pour projeter N+2 (projection « plan réalisé »), ou projeter sans recrutement intermédiaire comme aujourd’hui ? L’hypothèse est prévue dans `hypotheses/`, sa valeur par défaut reste à décider.
