/**
 * Exemples chiffrés du Référentiel technique de modélisation des plans de
 * rotation, de redéploiement et de déploiement. Chaque test reprend un exemple
 * du document et vérifie que l'application en retrouve exactement les valeurs.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { computeSchoolDiagnostic, runDiagnostic } from '../lib/analytics/diagnostic'
import { syntheseTerritoriale } from '../lib/analytics/synthese'
import { DEFAULT_SETTINGS, cloneSettings } from '../lib/config/settings'
import { separerSectionsBilingues } from '../lib/data/parse'
import { accepterDiffere } from '../lib/simulation/appariement'
import { pointsAnciennete, pointsZoneDifficile } from '../lib/simulation/candidatures'
import { runSimulation } from '../lib/simulation/engine'
import { scenarioGeographique } from '../lib/simulation/scenarios'
import { tousInvariantsOk } from '../lib/simulation/invariants'
import type { DecisionArbitrage, EngineSettings, GeographicScope, Recrue } from '../types/simulation'
import type { School, Teacher } from '../types/education'
import { ecole, enseignant, enseignantsDe } from './fixtures'

/** Paramètres du référentiel, rentrée 2026 : les âges des tests en dépendent. */
function parametres(): EngineSettings {
  const s = cloneSettings(DEFAULT_SETTINGS)
  s.anneeScolaire = '2026-2027'
  return s
}

const NE_EN = (age: number) => new Date(Date.UTC(2026 - age, 0, 1))

/** École de 6 niveaux en simple flux, comme les exemples commentés de la section 2.4. */
function ecoleType(id: string, eleves: number, salles: number, maitres: number, departs = 0, extra: Partial<School> = {}): School {
  return ecole({
    id,
    nbClasses: 6,
    niveauxOuverts: 6,
    effectifTotalEleves: eleves,
    nbSallesClasse: salles,
    nbEnseignantsEtat: maitres,
    departsConnusDeclares: departs,
    ...extra,
  })
}

const ECOLES_A_E = () => [
  ecoleType('A', 250, 6, 5, 1),
  ecoleType('B', 420, 5, 3),
  ecoleType('C', 120, 6, 6),
  ecoleType('D', 400, 3, 5),
  ecoleType('E', 90, 2, 2),
]

// --- §2.4 : règle de détermination du besoin --------------------------------------

test('§2.4 — les cinq écoles commentées : E, P, D, BMAX, K, b, x, a, s et classement', () => {
  const attendu: Record<string, [number, number, number, number, number, number, number, number, number, string]> = {
    //      E  P  D  BMAX K  b  x  a  s  classement
    A: [4, 5, 5, 6, 5, 1, 0, 0, 0, 'necessiteuse'],
    B: [3, 7, 7, 5, 5, 2, 0, 0, 2, 'necessiteuse'],
    C: [6, 2, 3, 6, 3, 0, 3, 0, 0, 'excedentaire'],
    D: [5, 7, 7, 3, 3, 0, 0, 2, 4, 'a_examiner'],
    E: [2, 2, 3, 2, 2, 0, 0, 0, 1, 'equilibree'],
  }
  for (const s of ECOLES_A_E()) {
    const d = computeSchoolDiagnostic(s, parametres())
    const c = d.calcul
    assert.deepEqual(
      [c.enseignantsRetenus, c.norme, c.dotation, c.bmax, c.cible, c.besoin, c.excedent, c.surnombre, c.sallesManquantes, d.classement],
      attendu[s.id],
      `école ${s.id}`,
    )
  }
})

test("§2.4 — pour les cinq écoles, la règle retient un besoin de 3 maîtres (contre 4 pour l'expression initiale)", () => {
  const diagnostic = runDiagnostic(ECOLES_A_E(), parametres())
  assert.equal(diagnostic.totals.postesNecessaires, 3)
  assert.equal(diagnostic.totals.sallesManquantes, 7)
})

test("§2.4 — tolérance d'arrondi de 20 élèves : le besoin de l'école A disparaît", () => {
  const s = parametres()
  s.besoin.toleranceArrondi = 20
  const d = computeSchoolDiagnostic(ECOLES_A_E()[0], s)
  assert.equal(d.calcul.norme, 4)
  assert.equal(d.besoinTheorique, 0)
  for (const ecoleId of ['B', 'C', 'D', 'E']) {
    const avant = computeSchoolDiagnostic(ECOLES_A_E().find(e => e.id === ecoleId) as School, parametres())
    const apres = computeSchoolDiagnostic(ECOLES_A_E().find(e => e.id === ecoleId) as School, s)
    assert.equal(apres.besoinTheorique, avant.besoinTheorique, `école ${ecoleId} inchangée`)
  }
})

test('§2.4 — un maître par niveau (m = 6) : A passe à 2, C n’a plus d’excédent, E manque de 4 salles', () => {
  const s = parametres()
  s.besoin.niveauxParMaitre = 1
  const [A, , C, , E] = ECOLES_A_E().map(e => computeSchoolDiagnostic(e, s))
  assert.equal(A.besoinTheorique, 2)
  assert.equal(C.excedentTheorique, 0)
  assert.equal(E.calcul.sallesManquantes, 4)
})

test('§2.4 — le double flux transforme un besoin en salles en besoin en maîtres', () => {
  const D = computeSchoolDiagnostic(ecoleType('D', 400, 3, 5, 0, { sallesDoubleFlux: 3 }), parametres())
  assert.equal(D.calcul.bmax, 6)
  assert.equal(D.calcul.cible, 6)
  assert.equal(D.calcul.surnombre, 0)
  assert.equal(D.besoinTheorique, 1)
  assert.equal(D.calcul.sallesManquantes, 1)

  const B = computeSchoolDiagnostic(ecoleType('B', 420, 5, 3, 0, { sallesDoubleFlux: 5 }), parametres())
  assert.equal(B.besoinTheorique, 4)
  assert.equal(B.calcul.sallesManquantes, 0)

  const sansDoubleFlux = parametres()
  sansDoubleFlux.besoin.doubleFluxAutorise = false
  assert.equal(computeSchoolDiagnostic(ecoleType('D', 400, 3, 5, 0, { sallesDoubleFlux: 3 }), sansDoubleFlux).calcul.bmax, 3)
})

test("§2.4 — les départs connus sont repérés dans le fichier des enseignants quand l'école ne les déclare pas", () => {
  const s = parametres()
  const A = ecoleType('A', 250, 6, 5, 0, { departsConnusDeclares: null })
  const teachers = [
    ...enseignantsDe('A', 4, { dateNaissance: NE_EN(40), age: 40 }),
    enseignant({ id: 'RETRAITE', idEtabAttache: 'A', dateNaissance: NE_EN(61), age: 61 }),
  ]
  const diagnostic = runDiagnostic([A], s, teachers)
  assert.equal(diagnostic.bySchoolId.A.calcul.departsConnus, 1)
  assert.equal(diagnostic.bySchoolId.A.besoinTheorique, 1)
})

test('§2.4 — école bilingue : la section francophone manque d’un maître, l’anglophone en a deux de trop', () => {
  const lignes = [
    ecoleType('BIL', 300, 5, 4, 0, { sousSysteme: 'francophone' }),
    ecoleType('BIL', 180, 5, 5, 0, { sousSysteme: 'anglophone' }),
  ]
  const teachers = [enseignant({ id: 'T-EN', idEtabAttache: 'BIL', sousSysteme: 'anglophone' })]
  const { schools, teachers: rattaches } = separerSectionsBilingues(lignes, teachers)
  assert.deepEqual(schools.map(s => s.id), ['BIL-FR', 'BIL-EN'])
  assert.equal(rattaches[0].idEtabAttache, 'BIL-EN')

  const diagnostic = runDiagnostic(schools, parametres())
  assert.equal(diagnostic.bySchoolId['BIL-FR'].besoinTheorique, 1)
  assert.equal(diagnostic.bySchoolId['BIL-EN'].excedentTheorique, 2)
  const synthese = syntheseTerritoriale(diagnostic.schools, parametres())
  assert.equal(synthese.couvrable, 0, "l'excédent anglophone ne couvre pas le besoin francophone")
  assert.equal(synthese.restant, 1)
})

// --- §2.5 et §2.6 : indicateurs et agrégation -------------------------------------

test("§2.5 — degré d'aléa : (3 + 3) ÷ 18 = 33 %, puis 0 % après le plan", () => {
  const diagnostic = runDiagnostic(ECOLES_A_E(), parametres())
  const avant = syntheseTerritoriale(diagnostic.schools, parametres())
  assert.equal(avant.besoin, 3)
  assert.equal(avant.excedent, 3)
  assert.equal(Math.round((avant.degreAlea ?? 0) * 100), 33)

  // Le plan déplace les trois maîtres de l'école C vers les écoles A et B.
  const apres = syntheseTerritoriale(
    diagnostic.schools,
    parametres(),
    new Map([['A', 5], ['B', 5], ['C', 3], ['D', 5], ['E', 2]]),
  )
  assert.equal(apres.degreAlea, 0)
})

test('§2.6 — recrutement à prévoir : 120 + ⌈1,5 % × 4 000⌉ = 180', () => {
  const s = parametres()
  s.recrutement.tauxAttritionHorsRetraite = 1.5
  const grande = ecole({ id: 'T', nbClasses: 6, niveauxOuverts: 6, effectifTotalEleves: 4120 * 60, nbSallesClasse: 5000, nbEnseignantsEtat: 4000 })
  const synthese = syntheseTerritoriale(runDiagnostic([grande], s).schools, s)
  assert.equal(synthese.restant, 120)
  assert.equal(synthese.recrutementAPrevoir, 180)
})

// --- §3.1 : poids de vulnérabilité et indice de priorité ----------------------------

test('§3.1 et §5.1 — poids, points de besoin et indice de priorité des écoles de la commune A', () => {
  const lignes: [string, number, number, School['accessibilite'], School['zoneSecurite'], number, 1 | 2 | 3][] = [
    // id, élèves, maîtres, accessibilité, sécurité, u attendu, niveau
    ['A02', 610, 5, 'urbain', 'verte', 15, 3],
    ['A03', 450, 7, 'urbain', 'verte', 5, 3],
    ['A05', 300, 2, 'rural', 'jaune', 30, 2],
    ['A07', 210, 1, 'rural_enclave', 'rouge', 60, 1],
    ['A08', 95, 1, 'rural_enclave', 'jaune', 35, 1],
    ['A12', 230, 3, 'rural', 'jaune', 20, 2],
  ]
  for (const [id, eleves, maitres, accessibilite, zoneSecurite, u, niveau] of lignes) {
    const d = computeSchoolDiagnostic(ecoleType(id, eleves, 8, maitres, 0, { accessibilite, zoneSecurite }), parametres())
    assert.equal(d.priorite.indice, u, `${id} : indice u`)
    assert.equal(d.priorite.niveauDifficulte, niveau, `${id} : niveau de difficulté`)
  }
})

// --- §3.3 : score de priorité ---------------------------------------------------------

test('§3.3 — points d’ancienneté au poste et de service en zone difficile', () => {
  const s = parametres()
  assert.equal(pointsAnciennete(5, false, s), 0)
  assert.equal(pointsAnciennete(6, false, s), 10)
  assert.equal(pointsAnciennete(9, false, s), 13)
  assert.equal(pointsAnciennete(16, false, s), 20)
  assert.equal(pointsAnciennete(25, false, s), 20)
  assert.equal(pointsAnciennete(6, true, s), 5, 'à moins de 5 ans de la retraite')
  assert.equal(pointsZoneDifficile(4, 0, s), 8)
  assert.equal(pointsZoneDifficile(4, 5, s), 10, 'plafond de 10 points')
})

// --- §3.4 : acceptation différée ---------------------------------------------------------

test('§3.4 — exemple U et V : T1 obtient U, T2 obtient V, T3 reste sans affectation, en trois tours', () => {
  const score: Record<string, Record<string, number>> = { T1: { U: 20, V: 20 }, T2: { U: 15, V: 25 }, T3: { U: 18 } }
  const res = accepterDiffere(
    [
      { id: 'T1', liste: ['V', 'U'] },
      { id: 'T2', liste: ['U', 'V'] },
      { id: 'T3', liste: ['U'] },
    ],
    new Map([['U', 1], ['V', 1]]),
    (ecoleId, a, b) => score[b][ecoleId] - score[a][ecoleId],
    'exemple',
  )
  assert.equal(res.affectations.get('T1'), 'U')
  assert.equal(res.affectations.get('T2'), 'V')
  assert.equal(res.affectations.has('T3'), false)
  assert.deepEqual(res.tours.map(t => t.refuses), [['T2'], ['T1'], ['T3']])
})

/** Une école nécessiteuse d'un poste : 120 élèves, 6 niveaux, 6 salles, 2 maîtres. */
const ecoleAUnPoste = (id: string, extra: Partial<School> = {}) => ecoleType(id, 120, 6, 2, 0, extra)
/** Une école très excédentaire : 60 élèves, dotation 3, 12 maîtres. */
const ecoleSource = (id = 'S', extra: Partial<School> = {}) => ecoleType(id, 60, 6, 12, 0, extra)

function simuler(schools: School[], teachers: Teacher[], scope: GeographicScope = 'departement', s = parametres(), extra: { arbitrages?: DecisionArbitrage[]; recrues?: Recrue[] } = {}) {
  const diagnostic = runDiagnostic(schools, s, teachers)
  return runSimulation({
    diagnostics: diagnostic.schools,
    structures: diagnostic.structures,
    teachers,
    scenario: scenarioGeographique(scope, s),
    ...extra,
  })
}

test('§5.4 — classement unique : T2 obtient Z, T1 obtient X, T3 obtient Y, T4 reste sans vœu disponible', () => {
  const schools = [
    ecoleAUnPoste('X', { accessibilite: 'rural_enclave', zoneSecurite: 'rouge' }),
    ecoleAUnPoste('Y', { accessibilite: 'rural', zoneSecurite: 'jaune' }),
    ecoleAUnPoste('Z'),
    ecoleSource(),
  ]
  const teachers = [
    enseignant({ id: 'T1', idEtabAttache: 'S', anciennetePosteAns: 9, voeux: ['Z', 'X'], dateNaissance: NE_EN(45), age: 45 }),
    enseignant({ id: 'T2', idEtabAttache: 'S', anciennetePosteAns: 7, anneesZoneNiveau1: 4, voeux: ['Z', 'Y'], dateNaissance: NE_EN(42), age: 42 }),
    enseignant({ id: 'T3', idEtabAttache: 'S', anciennetePosteAns: 6, voeux: ['Y'], dateNaissance: NE_EN(57), age: 57 }),
    enseignant({ id: 'T4', idEtabAttache: 'S', anciennetePosteAns: 5, voeux: ['Z'], dateNaissance: NE_EN(38), age: 38 }),
  ]
  const s = parametres()
  s.mobilite.redeploiementObligatoire = false
  const r = simuler(schools, teachers, 'departement', s)
  const destination = (id: string) => r.assignments.find(a => a.teacherId === id)?.schoolDestinationId
  assert.equal(destination('T2'), 'Z')
  assert.equal(destination('T1'), 'X')
  assert.equal(destination('T3'), 'Y')
  assert.equal(destination('T4'), undefined)

  const scores = Object.fromEntries(r.candidatures.map(c => [c.teacher.id, c.pointsAnciennete + c.pointsZoneDifficile]))
  assert.deepEqual(scores, { T1: 13, T2: 19, T3: 5, T4: 0 })
  assert.equal(r.assignments.find(a => a.teacherId === 'T1')?.rangVoeu, 2)
  assert.ok(tousInvariantsOk(r.invariants), JSON.stringify(r.invariants.filter(i => !i.ok)))
})

test('§3.3 et §3.4 — exemple U et V de bout en bout : la bonification ne vaut que pour l’école visée', () => {
  // Scores du référentiel : T1 20 et 20, T2 15 et 25 (dont 10 de regroupement familial), T3 18.
  const schools = [ecoleAUnPoste('U'), ecoleAUnPoste('V'), ecoleSource()]
  const teachers = [
    enseignant({ id: 'T1', idEtabAttache: 'S', anciennetePosteAns: 16, voeux: ['V', 'U'] }),
    enseignant({ id: 'T2', idEtabAttache: 'S', anciennetePosteAns: 11, voeux: ['U', 'V'], motifDemande: 'regroupement_familial', ecoleMotif: 'V' }),
    enseignant({ id: 'T3', idEtabAttache: 'S', anciennetePosteAns: 14, voeux: ['U'] }),
  ]
  const s = parametres()
  s.mobilite.redeploiementObligatoire = false
  const r = simuler(schools, teachers, 'departement', s)
  const t2 = r.candidatures.find(c => c.teacher.id === 'T2')
  assert.deepEqual(t2?.voeux.map(v => v.score), [15, 25])
  assert.equal(r.assignments.find(a => a.teacherId === 'T2')?.schoolDestinationId, 'V')
  assert.equal(r.assignments.find(a => a.teacherId === 'T1')?.schoolDestinationId, 'U')
  assert.equal(r.assignments.some(a => a.teacherId === 'T3'), false, 'U a retenu un candidat mieux classé (20 contre 18)')

  // Variante « poids des écoles » : même résultat dans cet exemple.
  const parPoids = parametres()
  parPoids.mobilite.redeploiementObligatoire = false
  parPoids.mobilite.ordreExamen = 'poids'
  const r2 = simuler(schools, teachers, 'departement', parPoids)
  assert.deepEqual(
    r2.assignments.map(a => [a.teacherId, a.schoolDestinationId]).sort(),
    [['T1', 'U'], ['T2', 'V']],
  )
})

// --- §3.2 : recevabilité et limite des départs ------------------------------------------

test('§3.2 — une demande est irrecevable sans stabilité de 5 ans ou depuis une école sans excédent', () => {
  const schools = [ecoleAUnPoste('CIBLE'), ecoleSource(), ecoleType('EQ', 120, 6, 3)]
  const teachers = [
    enseignant({ id: 'RECENT', idEtabAttache: 'S', anciennetePosteAns: 4, voeux: ['CIBLE'] }),
    enseignant({ id: 'SANS_EXCEDENT', idEtabAttache: 'EQ', anciennetePosteAns: 11, voeux: ['CIBLE'] }),
    enseignant({ id: 'OK', idEtabAttache: 'S', anciennetePosteAns: 5, voeux: ['CIBLE'] }),
  ]
  const r = simuler(schools, teachers)
  const recevable = Object.fromEntries(r.candidatures.map(c => [c.teacher.id, c.recevable]))
  assert.deepEqual(recevable, { RECENT: false, SANS_EXCEDENT: false, OK: true })
  assert.equal(r.assignments.find(a => a.teacherId === 'OK')?.nature, 'voeu')
})

test("§3.2 — les départs d'une école restent dans la limite de son excédent", () => {
  // Excédent de 1 : un seul des deux volontaires peut partir, le mieux classé.
  const schools = [ecoleAUnPoste('U'), ecoleAUnPoste('V'), ecoleType('S', 60, 6, 4)]
  const teachers = [
    enseignant({ id: 'FORT', idEtabAttache: 'S', anciennetePosteAns: 12, voeux: ['U'] }),
    enseignant({ id: 'FAIBLE', idEtabAttache: 'S', anciennetePosteAns: 7, voeux: ['V'] }),
  ]
  const r = simuler(schools, teachers)
  assert.equal(r.assignments.length, 1)
  assert.equal(r.assignments[0].teacherId, 'FORT')
  assert.equal(r.candidatures.find(c => c.teacher.id === 'FAIBLE')?.issue, 'depart_non_valide')
  assert.ok(r.invariants.find(i => i.code === 'departs_sous_excedent')?.ok)
})

// --- §3.5 : solution proche et zone rouge -----------------------------------------------

test('§3.5 — solution la plus proche hors vœux, jamais en zone rouge, jamais pour un proche de la retraite', () => {
  const schools = [
    ecoleAUnPoste('DEMANDEE', { commune: 'Obala' }),
    ecoleAUnPoste('VOISINE', { commune: 'Obala' }),
    ecoleAUnPoste('ROUGE', { commune: 'Obala', zoneSecurite: 'rouge' }),
    ecoleSource('S', { commune: 'Obala' }),
  ]
  const teachers = [
    enseignant({ id: 'GAGNANT', idEtabAttache: 'S', anciennetePosteAns: 15, voeux: ['DEMANDEE'] }),
    enseignant({ id: 'SECOND', idEtabAttache: 'S', anciennetePosteAns: 8, voeux: ['DEMANDEE'] }),
    enseignant({ id: 'PROCHE_RETRAITE', idEtabAttache: 'S', anciennetePosteAns: 9, voeux: ['DEMANDEE'], dateNaissance: NE_EN(57), age: 57 }),
  ]
  const s = parametres()
  s.mobilite.redeploiementObligatoire = false
  const r = simuler(schools, teachers, 'departement', s)
  const second = r.assignments.find(a => a.teacherId === 'SECOND')
  assert.equal(second?.nature, 'hors_voeux')
  assert.equal(second?.schoolDestinationId, 'VOISINE')
  assert.equal(r.assignments.some(a => a.teacherId === 'PROCHE_RETRAITE'), false)
  assert.equal(r.assignments.some(a => a.schoolDestinationId === 'ROUGE'), false)
  assert.ok(r.invariants.find(i => i.code === 'zone_rouge')?.ok)
  assert.equal(r.combinaisons.some(c => c.schoolId === 'ROUGE' && c.type !== 'permutation'), false, 'aucune combinaison imposée en zone rouge')
})

test('§3.7 — le redéploiement obligatoire sert les écoles par priorité, hors zone rouge, dans le sous-système', () => {
  const schools = [
    ecoleAUnPoste('PRIORITAIRE', { accessibilite: 'rural', zoneSecurite: 'jaune' }),
    ecoleAUnPoste('ORDINAIRE'),
    ecoleAUnPoste('ROUGE', { zoneSecurite: 'rouge' }),
    ecoleAUnPoste('ANGLO', { sousSysteme: 'anglophone' }),
    ecoleType('S', 60, 6, 4, 0, { sousSysteme: 'francophone' }),
  ]
  const teachers = enseignantsDe('S', 4, { sousSysteme: 'francophone' })
  const r = simuler(schools, teachers)
  assert.deepEqual(r.assignments.map(a => [a.nature, a.schoolDestinationId]), [['obligatoire', 'PRIORITAIRE']])
  assert.ok(r.invariants.find(i => i.code === 'sous_systeme_respecte')?.ok)
  assert.ok(tousInvariantsOk(r.invariants))
})

test('§3.10 — un vœu portant sur l’autre sous-système est transmis à la commission, pas à l’algorithme', () => {
  const schools = [ecoleAUnPoste('ANGLO', { sousSysteme: 'anglophone' }), ecoleSource('S', { sousSysteme: 'francophone' })]
  const teachers = [enseignant({ id: 'T', idEtabAttache: 'S', anciennetePosteAns: 10, sousSysteme: 'francophone', voeux: ['ANGLO'] })]
  const r = simuler(schools, teachers)
  assert.equal(r.assignments.length, 0)
  assert.equal(r.candidatures[0].voeux[0].statut, 'autre_sous_systeme')
  assert.deepEqual(r.voeuxAutreSousSysteme.map(v => [v.teacherId, v.schoolId, v.posteVacant]), [['T', 'ANGLO', true]])
})

// --- §3.6 : niveau central ----------------------------------------------------------------

test('§3.6 — les vœux interrégionaux ne sont traités qu’au niveau central (scénario étendu)', () => {
  const schools = [
    ecoleAUnPoste('LOIN', { region: 'Littoral', departement: 'Wouri', commune: 'Douala III' }),
    ecoleSource(),
  ]
  const teachers = [enseignant({ id: 'T', idEtabAttache: 'S', anciennetePosteAns: 10, voeux: ['LOIN'] })]
  const s = parametres()
  s.mobilite.redeploiementObligatoire = false
  assert.equal(simuler(schools, teachers, 'departement', s).assignments.length, 0)
  const etendu = simuler(schools, teachers, 'etendu', s)
  assert.equal(etendu.assignments[0]?.phase, 'Niveau central — vœux interrégionaux')
})

// --- §3.8 : nouveaux recrutés -----------------------------------------------------------------

test('§3.8 — nouveaux recrutés : par note, choix d’abord, puis extension au département, puis vivier national', () => {
  const schools = [
    ecoleAUnPoste('A07', { commune: 'Commune A', departement: 'D1' }),
    ecoleAUnPoste('B03', { commune: 'Commune B', departement: 'D1' }),
    ecoleAUnPoste('B09', { commune: 'Commune B', departement: 'D1', sousSysteme: 'anglophone' }),
  ]
  const recrues: Recrue[] = [
    { id: 'R1', nom: 'R1', sexe: 'F', sousSysteme: 'francophone', note: 16.5, communeResidence: 'Commune A', choix: ['A07', 'B03'], ligneSource: 2 },
    { id: 'R3', nom: 'R3', sexe: 'M', sousSysteme: 'francophone', note: 15.2, communeResidence: 'Commune A', choix: ['A07'], ligneSource: 3 },
    { id: 'R5', nom: 'R5', sexe: 'M', sousSysteme: 'francophone', note: 14.1, communeResidence: 'Commune A', choix: ['A07'], ligneSource: 4 },
    { id: 'R8', nom: 'R8', sexe: 'F', sousSysteme: 'anglophone', note: 14.6, communeResidence: 'Commune B', choix: ['B09'], ligneSource: 5 },
  ]
  const r = simuler(schools, [], 'departement', parametres(), { recrues })
  const issue = Object.fromEntries((r.recrutes?.affectations ?? []).map(a => [a.recrueId, [a.schoolId, a.issue]]))
  assert.deepEqual(issue, { R1: ['A07', 'choix'], R8: ['B09', 'choix'], R3: ['B03', 'departement'] })
  assert.deepEqual(r.recrutes?.vivierNational.map(v => v.recrueId), ['R5'])
})

// --- §3.9 : projection N+2 ------------------------------------------------------------------

test('§3.9 — un enseignant resté dans le vivier est projeté sur un poste qui se libère en N+2', () => {
  // L'école VISEE est équilibrée en N+1 ; un de ses maîtres atteint 60 ans pendant l'année N+1.
  const schools = [ecoleType('VISEE', 120, 6, 3), ecoleSource()]
  const teachers = [
    ...enseignantsDe('VISEE', 2, { dateNaissance: NE_EN(40), age: 40 }),
    enseignant({ id: 'PARTANT', idEtabAttache: 'VISEE', dateNaissance: new Date(Date.UTC(1966, 11, 1)), age: 59 }),
    enseignant({ id: 'DEMANDEUR', idEtabAttache: 'S', anciennetePosteAns: 9, voeux: ['VISEE'] }),
  ]
  const r = simuler(schools, teachers)
  assert.equal(r.postesProjetesN2, 1)
  assert.deepEqual(r.projectionsN2.map(p => [p.teacherId, p.schoolId]), [['DEMANDEUR', 'VISEE']])
  assert.equal(r.candidatures[0].issue, 'projete_n2')
})

// --- §3.10 : arbitrage et traçabilité ----------------------------------------------------------

test('§3.10 — une proposition rejetée n’est plus refaite ; une correction de la commission est appliquée et tracée', () => {
  const schools = [ecoleAUnPoste('U'), ecoleAUnPoste('V'), ecoleSource()]
  const teachers = [enseignant({ id: 'T', idEtabAttache: 'S', anciennetePosteAns: 10, voeux: ['U', 'V'] })]
  const s = parametres()
  s.mobilite.redeploiementObligatoire = false

  const initiale = simuler(schools, teachers, 'departement', s)
  assert.equal(initiale.assignments[0].schoolDestinationId, 'U')

  const rejet: DecisionArbitrage = {
    id: 'A1',
    teacherId: 'T',
    nomEnseignant: 'T',
    propositionInitiale: { schoolId: 'U', nomEtab: 'U', nature: 'voeu' },
    decision: 'rejeter',
    schoolDestinationId: null,
    nomEtabDestination: null,
    changementSousSysteme: false,
    motif: 'Contrainte non modélisée',
    instance: 'regionale',
    decideLe: '2026-07-01T00:00:00.000Z',
  }
  const apresRejet = simuler(schools, teachers, 'departement', s, { arbitrages: [rejet] })
  assert.equal(apresRejet.assignments[0].schoolDestinationId, 'V', 'l’algorithme est relancé sur les postes restants')

  const correction: DecisionArbitrage = { ...rejet, id: 'A2', decision: 'modifier', schoolDestinationId: 'V', nomEtabDestination: 'V' }
  const corrige = simuler(schools, teachers, 'departement', s, { arbitrages: [correction] })
  assert.equal(corrige.assignments[0].statut, 'arbitre')
  assert.equal(corrige.assignments[0].arbitrageId, 'A2')
  assert.equal(corrige.arbitrages[0].appliquee, true)
})
