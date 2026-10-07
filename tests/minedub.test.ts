/**
 * Logique reprise du moteur de référence MINEDUB (script Python), avec ses
 * corrections : format officiel des colonnes, minimum pédagogique selon les
 * classes multigrades, barème individuel C1 à C5, score d'appariement, proximité
 * IAEB, projections N+1 à N+3 et import des décisions « Fait de Prince ».
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { computeSchoolDiagnostic, runDiagnostic } from '../lib/analytics/diagnostic'
import { DEFAULT_SETTINGS, cloneSettings } from '../lib/config/settings'
import { detectColumns } from '../lib/data/column-mapping'
import { construireDataset, type FichierLu } from '../lib/data/import'
import { recordsFromRows } from '../lib/data/normalize'
import { analyserFichierPrince } from '../lib/data/prince-import'
import { runSimulation } from '../lib/simulation/engine'
import { scenarioGeographique } from '../lib/simulation/scenarios'
import { tousInvariantsOk } from '../lib/simulation/invariants'
import { ajustementsContextuels, calculerBaremeIndividuel, detaillerBareme } from '../lib/simulation/scoring'
import type { EngineSettings, TeachingPost } from '../types/simulation'
import type { School, Teacher } from '../types/education'
import { ecole, enseignant } from './fixtures'

function parametres(): EngineSettings {
  const s = cloneSettings(DEFAULT_SETTINGS)
  s.anneeScolaire = '2026-2027'
  return s
}
const NE_EN = (age: number) => new Date(Date.UTC(2026 - age, 0, 1))

function fichier(kind: 'etablissements' | 'enseignants', rows: unknown[][]): FichierLu {
  const { headers, records } = recordsFromRows(rows)
  return { kind, nomFichier: `${kind}.xlsx`, feuilles: [], feuilleLue: '', headers, records, mapping: detectColumns(kind, headers) }
}

// --- Format officiel des fichiers ----------------------------------------------------

const ETAB = [
  ['Identifiant_Ecole', 'Sous_Systeme', 'Region', 'Departement', 'Commune', 'Circonscription_IAEB', 'Effectif_Eleves_Attendus', 'Enseignants_Actuels', 'Salles_Simple_Flux', 'Salles_Double_Flux', 'Accessibilite_Zone', 'Securite_Zone', 'Classes_Multigrades'],
  ['EP-A', 'Francophone', 'Centre', 'Lekié', 'Obala', 'IAEB Obala', 400, 4, 2, 2, 'Rural enclavé', 'Jaune', 'Non'],
  ['EP-B', 'Francophone', 'Centre', 'Lekié', 'Obala', 'IAEB Obala', 150, 7, 6, 0, 'Semi-urbain', 'Verte', 'Oui'],
]
const ENS = [
  ['Matricule_Enseignant', 'Sous_Systeme_Formation', 'Ecole_Attache_Actuelle', 'Age', 'Anciennete_Carriere', 'Anciennete_Poste_Actuel', 'Annees_Zone_Difficulte_1', 'Annees_Zone_Difficulte_2', 'Situation_Matrimoniale', 'Nombre_Enfants_A_Charge', 'Formations_Continues', 'Voeu_1', 'Voeu_2', 'Voeu_3', 'Motif_Bonification'],
  ['M-1', 'Francophone', 'EP-B', 41, 12, 9, 0, 0, 'Marié', 2, 3, 'EP-A', '', 'nan', 'Rapprochement de conjoint à EP-A'],
  ['M-2', 'Francophone', 'EP-B', 30, 6, 6, 0, 0, 'Célibataire', 0, 1, '', '', '', ''],
]

test('Les fichiers au format officiel MINEDUB sont reconnus colonne par colonne', () => {
  const e = fichier('etablissements', ETAB)
  const t = fichier('enseignants', ENS)
  const champ = (f: FichierLu, c: string) => f.mapping.matches.find(m => m.champ === c)?.enTete
  assert.equal(champ(e, 'id'), 'Identifiant_Ecole')
  assert.equal(champ(e, 'iaeb'), 'Circonscription_IAEB')
  assert.equal(champ(e, 'effectifTotalEleves'), 'Effectif_Eleves_Attendus')
  assert.equal(champ(e, 'nbEnseignantsEtat'), 'Enseignants_Actuels')
  assert.equal(champ(e, 'sallesSimpleFlux'), 'Salles_Simple_Flux')
  assert.equal(champ(e, 'sallesDoubleFlux'), 'Salles_Double_Flux')
  assert.equal(champ(e, 'accessibilite'), 'Accessibilite_Zone')
  assert.equal(champ(e, 'zoneSecurite'), 'Securite_Zone')
  assert.equal(e.mapping.incomplet, false, 'aucune colonne indispensable ne manque')

  assert.equal(champ(t, 'sousSystemeEns'), 'Sous_Systeme_Formation', 'le sous-système n’est pas capté par la formation continue')
  assert.equal(champ(t, 'formationContinue'), 'Formations_Continues')
  assert.equal(champ(t, 'idEtabAttache'), 'Ecole_Attache_Actuelle')
  assert.equal(champ(t, 'age'), 'Age')
  assert.equal(champ(t, 'nbEnfants'), 'Nombre_Enfants_A_Charge')
  assert.equal(champ(t, 'anneesZoneNiveau1'), 'Annees_Zone_Difficulte_1')
  assert.equal(champ(t, 'motifDemande'), 'Motif_Bonification')
  assert.equal(t.mapping.incomplet, false)
})

test('Format MINEDUB : salles disjointes, milieu déduit de l’accessibilité, âge, IAEB et motif rédigé librement', () => {
  const { dataset } = construireDataset(fichier('etablissements', ETAB), fichier('enseignants', ENS), new Date(Date.UTC(2026, 6, 1)))
  const A = dataset.schools.find(s => s.id === 'EP-A') as School
  assert.equal(A.nbSallesClasse, 4, 'simple flux + double flux')
  assert.equal(A.sallesDoubleFlux, 2)
  assert.equal(A.zone, 'rurale')
  assert.equal(A.accessibilite, 'rural_enclave')
  assert.equal(dataset.schools.find(s => s.id === 'EP-B')?.accessibilite, 'semi_urbain')

  const d = computeSchoolDiagnostic(A, parametres())
  assert.equal(d.calcul.bmax, 6, 'BMAX = 2 + 2 × 2')

  const m1 = dataset.teachers.find(t => t.id === 'M-1') as Teacher
  assert.equal(m1.age, 41)
  assert.equal(m1.iaebAttache, 'IAEB Obala')
  assert.deepEqual(m1.voeux, ['EP-A'], 'les cellules « nan » sont des vœux vides')
  assert.equal(m1.motifDemande, 'regroupement_familial')
  assert.equal(m1.ecoleMotif, 'EP-A', 'l’école citée dans le motif reçoit la bonification')
})

// --- Minimum pédagogique selon les classes multigrades ---------------------------------

test('Minimum pédagogique école par école : 6 maîtres sans multigrade, 3 en multigrade, entre les deux selon les classes', () => {
  const s = parametres()
  const m = (extra: Partial<School>) =>
    computeSchoolDiagnostic(ecole({ id: 'X', niveauxOuverts: 6, effectifTotalEleves: 120, nbSallesClasse: 6, classesMultigradesRenseignees: true, ...extra }), s).calcul.minimumPedagogique
  assert.equal(m({ classesMultigrades: 0 }), 6)
  assert.equal(m({ classesMultigrades: 6 }), 3, '« Oui » : regroupement maximal')
  assert.equal(m({ classesMultigrades: 2 }), 4)
  assert.equal(m({ classesMultigrades: 0, nbClasses: 4 }), 4, 'quatre classes pour six niveaux : deux regroupements implicites')
  assert.equal(m({ classesMultigradesRenseignees: false, classesMultigrades: 0 }), 3, 'sans la colonne, le regroupement paramétré s’applique')

  const uniforme = parametres()
  uniforme.besoin.minimumSelonMultigrades = false
  assert.equal(computeSchoolDiagnostic(ecole({ id: 'X', niveauxOuverts: 6, effectifTotalEleves: 120, classesMultigradesRenseignees: true }), uniforme).calcul.minimumPedagogique, 3)
})

// --- Barème individuel (étage 1) -------------------------------------------------------

test('Barème C1 à C5 : exemple calculé à la main', () => {
  // C1 = 12 + Z(4 ans niveau 1 = 8) = 20 ; C2 = A(9 ans) = 13 ; C3 = 5 − 2 × 2 = 1 ; C4 = min(10 ; 2 × 3) = 6 ; C5 = 8.
  const t = enseignant({ id: 'T', idEtabAttache: 'E', ancienneteCarriereAns: 12, anciennetePosteAns: 9, anneesZoneNiveau1: 4, situationFamiliale: 'Marié', nbEnfants: 2, formationContinue: 3, age: 40, dateNaissance: NE_EN(40) })
  const detail = detaillerBareme(t, parametres())
  assert.deepEqual(detail.components.map(c => c.valeur), [20, 13, 1, 6, 8])
  assert.equal(detail.total, 11.15, '0,30 × 20 + 0,25 × 13 + 0,20 × 1 + 0,15 × 6 + 0,10 × 8')
})

test('Les années au poste actuel comptent comme service en zone difficile quand l’école est de niveau 1', () => {
  const t = enseignant({ id: 'T', idEtabAttache: 'E', ancienneteCarriereAns: 10, anciennetePosteAns: 6, anneesZoneNiveau1: 0, anneesZoneNiveau2: 0 })
  const s = parametres()
  assert.equal(detaillerBareme(t, s, 1).components[0].valeur, 20, 'Z = min(10 ; 2 × 6)')
  assert.equal(detaillerBareme(t, s, 3).components[0].valeur, 10, 'école de niveau 3 : aucun point de zone')
  assert.ok(calculerBaremeIndividuel(t, s, 1) > calculerBaremeIndividuel(t, s, 3))
})

// --- Score d'appariement (étage 2) --------------------------------------------------------

function poste(extra: Partial<TeachingPost>): TeachingPost {
  return {
    id: 'P', schoolId: 'P', nomEtab: 'P', region: 'Centre', iaeb: '', departement: 'Mfoundi', commune: 'Yaoundé I', zone: 'urbaine', typeEtab: 'EP',
    sousSysteme: null, estStructure: false, classesMultigrades: 0, prioriteLocale: 0, deficitEcole: 1, elevesParEnseignantEtat: null,
    priorite: { pointsAccessibilite: 5, pointsSecurite: 0, poids: 5, niveauDifficulte: 3, pointsBesoin: 0, indice: 5, zoneRouge: false },
    rang: 1, pourvu: false, ...extra,
  }
}

test('Ajustements contextuels : chaque règle s’applique à son cas, la bonification à la seule école visée', () => {
  const cfg = parametres().scoring
  const jeune = enseignant({ id: 'J', idEtabAttache: 'E', age: 28 })
  const senior = enseignant({ id: 'S', idEtabAttache: 'E', age: 55 })
  const rural = enseignant({ id: 'R', idEtabAttache: 'E', age: 40, zoneAttache: 'rurale', anciennetePosteAns: 6 })
  const total = (t: Teacher, p: TeachingPost, visee: string | null = null) => ajustementsContextuels(t, p, cfg, visee).reduce((s, x) => s + x.valeur, 0)
  assert.equal(total(jeune, poste({ classesMultigrades: 2 })), 15)
  assert.equal(total(senior, poste({ estStructure: true })), 15)
  assert.equal(total(senior, poste({})), 8)
  assert.equal(total(rural, poste({ zone: 'urbaine' })), 12)
  assert.equal(total(jeune, poste({ schoolId: 'VISEE' }), 'VISEE'), 20)
  assert.equal(total(jeune, poste({ schoolId: 'AUTRE' }), 'VISEE'), 0)
})

// --- Redéploiement obligatoire : proximité IAEB, puis score d'appariement ------------------

/** École nécessiteuse d'un poste, ou excédentaire, de 6 niveaux en multigrade. */
const ecoleT = (id: string, maitres: number, extra: Partial<School> = {}) =>
  ecole({ id, niveauxOuverts: 6, effectifTotalEleves: 120, nbSallesClasse: 6, nbEnseignantsEtat: maitres, departsConnusDeclares: 0, departement: 'Lekié', region: 'Centre', ...extra })

test('Redéploiement obligatoire : à défaut de la commune, le maître de la même IAEB passe avant celui du département', () => {
  const schools = [
    ecoleT('CIBLE', 2, { commune: 'Obala', iaeb: 'IAEB Obala' }),
    ecoleT('MEME_IAEB', 4, { commune: 'Nkol', iaeb: 'IAEB Obala' }),
    ecoleT('DEPT', 4, { commune: 'Monatélé', iaeb: 'IAEB Monatélé' }),
  ]
  const teachers = [
    enseignant({ id: 'I', idEtabAttache: 'MEME_IAEB', communeAttache: 'Nkol', iaebAttache: 'IAEB Obala', departementAttache: 'Lekié', anciennetePosteAns: 6 }),
    enseignant({ id: 'D', idEtabAttache: 'DEPT', communeAttache: 'Monatélé', iaebAttache: 'IAEB Monatélé', departementAttache: 'Lekié', anciennetePosteAns: 20, ancienneteCarriereAns: 30 }),
  ]
  const s = parametres()
  const d = runDiagnostic(schools, s, teachers)
  const r = runSimulation({ diagnostics: d.schools, teachers, scenario: scenarioGeographique('departement', s) })
  assert.deepEqual(r.assignments.map(a => [a.teacherId, a.niveauProximite]), [['I', 'meme_iaeb']])
  assert.match(r.assignments[0].breakdown.components[0].label, /^Z1/, 'la proposition est expliquée par le score d’appariement')
  assert.ok(tousInvariantsOk(r.invariants), JSON.stringify(r.invariants.filter(i => !i.ok)))
})

test('Un départ imposé exige la stabilité minimale au poste (paramètre)', () => {
  const schools = [ecoleT('CIBLE', 2, { commune: 'Obala' }), ecoleT('SOURCE', 4, { commune: 'Obala' })]
  const teachers = [enseignant({ id: 'RECENT', idEtabAttache: 'SOURCE', communeAttache: 'Obala', anciennetePosteAns: 2 })]
  const s = parametres()
  const lancer = (x: EngineSettings) => runSimulation({ diagnostics: runDiagnostic(schools, x, teachers).schools, teachers, scenario: scenarioGeographique('commune', x) })
  assert.equal(lancer(s).assignments.length, 0)
  s.mobilite.stabilitePourObligatoire = false
  assert.equal(lancer(s).assignments.length, 1)
})

test('Variante : les écoles classent les candidats au score d’appariement, le plus proche l’emporte', () => {
  const schools = [
    ecoleT('CIBLE', 2, { commune: 'Obala' }),
    ecoleT('LOIN', 4, { commune: 'Monatélé' }),
    ecoleT('PRES', 4, { commune: 'Obala' }),
  ]
  const teachers = [
    // Plus ancien (score de priorité plus élevé), mais d'une autre commune.
    enseignant({ id: 'ANCIEN', idEtabAttache: 'LOIN', communeAttache: 'Monatélé', departementAttache: 'Lekié', anciennetePosteAns: 16, voeux: ['CIBLE'] }),
    enseignant({ id: 'VOISIN', idEtabAttache: 'PRES', communeAttache: 'Obala', departementAttache: 'Lekié', anciennetePosteAns: 7, voeux: ['CIBLE'] }),
  ]
  const lancer = (x: EngineSettings) =>
    runSimulation({ diagnostics: runDiagnostic(schools, x, teachers).schools, teachers, scenario: scenarioGeographique('departement', x) }).assignments.find(a => a.nature === 'voeu')?.teacherId
  const s = parametres()
  s.mobilite.redeploiementObligatoire = false
  s.mobilite.solutionProche = false
  assert.equal(lancer(s), 'ANCIEN', 'référentiel : le plus fort score S = A + Z + B')
  s.mobilite.classementCandidats = 'score_appariement'
  assert.equal(lancer(s), 'VOISIN', 'variante : la proximité entre dans le classement')
})

// --- Projections N+1 à N+3 ------------------------------------------------------------

test('Projection : un départ à la retraite pendant N+1 ouvre un besoin en N+2, l’attrition est comptée au territoire', () => {
  const schools = [ecoleT('E', 3)]
  const teachers = [
    enseignant({ id: 'A', idEtabAttache: 'E', dateNaissance: NE_EN(40), age: 40 }),
    enseignant({ id: 'B', idEtabAttache: 'E', dateNaissance: NE_EN(45), age: 45 }),
    enseignant({ id: 'PARTANT', idEtabAttache: 'E', dateNaissance: new Date(Date.UTC(1966, 11, 1)), age: 59 }),
  ]
  const s = parametres()
  s.recrutement.tauxAttritionHorsRetraite = 2
  const r = runSimulation({ diagnostics: runDiagnostic(schools, s, teachers).schools, teachers, scenario: scenarioGeographique('departement', s) })
  const e = r.projectionPluriannuelle.ecoles[0]
  assert.deepEqual(e.annees.map(a => [a.annee, a.departsRetraite, a.effectif, a.besoin]), [['N+1', 0, 3, 0], ['N+2', 1, 2, 1], ['N+3', 0, 2, 1]])
  const t = r.projectionPluriannuelle.territoire
  assert.deepEqual(t.map(x => [x.annee, x.attrition, x.recrutementAPrevoir]), [['N+1', 1, 1], ['N+2', 1, 3], ['N+3', 1, 4]], 'attrition ⌈2 % × effectif⌉ cumulée')
})

// --- Fait de Prince : import en lot ---------------------------------------------------------

test('Import des décisions « Fait de Prince » : lignes reconnues, introuvables signalées', () => {
  const schools = [ecoleT('E1', 3), ecoleT('E2', 2)]
  const teachers = [enseignant({ id: 'T1', idEtabAttache: 'E1' })]
  const d = runDiagnostic(schools, parametres(), teachers)
  const { lignes, manquantes } = analyserFichierPrince(
    [['Matricule_Enseignant', 'Identifiant_Ecole', 'motif'], ['T1', 'E2', 'Note de service 12'], ['T9', 'E2', ''], ['T1', 'E9', '']],
    teachers,
    d.schools,
  )
  assert.deepEqual(manquantes, [])
  assert.equal(lignes[0].erreur, null)
  assert.equal(lignes[0].reference, 'Note de service 12')
  assert.match(lignes[1].erreur ?? '', /enseignant « T9 » introuvable/)
  assert.match(lignes[2].erreur ?? '', /école « E9 » introuvable/)
})
