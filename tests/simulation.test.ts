/**
 * Cas 4 à 10 du cahier des charges : respect des excédents, périmètres
 * géographiques, conservation du besoin et invariants d'affectation.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { runDiagnostic } from '../lib/analytics/diagnostic'
import { DEFAULT_SETTINGS, cloneSettings } from '../lib/config/settings'
import { construireVivier } from '../lib/simulation/pool'
import { runSimulation } from '../lib/simulation/engine'
import { scenarioGeographique } from '../lib/simulation/scenarios'
import { tousInvariantsOk } from '../lib/simulation/invariants'
import type { GeographicScope } from '../types/simulation'
import type { School, Teacher } from '../types/education'
import { ecole, enseignant, enseignantsDe } from './fixtures'

function simuler(schools: School[], teachers: Teacher[], scope: GeographicScope, settings = DEFAULT_SETTINGS) {
  const diagnostic = runDiagnostic(schools, settings)
  const scenario = scenarioGeographique(scope, settings)
  return runSimulation({ diagnostics: diagnostic.schools, teachers, scenario })
}

test("Cas 4 — une école avec 2 enseignants en excédent n'en fournit jamais 3", () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 6, nbEnseignantsEtat: 8 }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 2 }),
  ]
  const teachers = enseignantsDe('SOURCE', 8)

  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  assert.equal(diagnostic.bySchoolId.SOURCE.excedentTheorique, 2)

  const vivier = construireVivier(teachers, diagnostic.schools, DEFAULT_SETTINGS)
  assert.equal(vivier.teachers.length, 2, 'le vivier est plafonné par l’excédent de l’école')

  const resultat = simuler(schools, teachers, 'commune')
  assert.equal(resultat.assignments.length, 2)
  assert.equal(resultat.assignments.filter(a => a.schoolOrigineId === 'SOURCE').length, 2)
  assert.ok(tousInvariantsOk(resultat.invariants))
})

test('Cas 5 — deux écoles de la même commune : le scénario local propose une affectation', () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 4, nbEnseignantsEtat: 6, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 4, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('SOURCE', 6, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  assert.equal(resultat.besoinInitial, 2)
  assert.equal(resultat.postesCouverts, 2)
  assert.equal(resultat.besoinResiduel, 0)
  assert.ok(resultat.assignments.every(a => a.niveauProximite === 'meme_commune'))
})

test('Cas 6 — communes différentes du même département : local sans correspondance, départemental possible', () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 4, nbEnseignantsEtat: 6, commune: 'Obala', departement: 'Lekié' }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 4, commune: 'Monatélé', departement: 'Lekié' }),
  ]
  const teachers = enseignantsDe('SOURCE', 6, { communeAttache: 'Obala', departementAttache: 'Lekié' })

  const local = simuler(schools, teachers, 'commune')
  assert.equal(local.postesCouverts, 0, 'aucune correspondance dans le scénario local')
  assert.equal(local.besoinResiduel, 2)

  const departemental = simuler(schools, teachers, 'departement')
  assert.equal(departemental.postesCouverts, 2)
  assert.ok(departemental.assignments.every(a => a.niveauProximite === 'meme_departement'))
})

test('Le scénario étendu franchit les frontières régionales, contrairement aux autres', () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 4, nbEnseignantsEtat: 6, region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé I' }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 4, region: 'Littoral', departement: 'Wouri', commune: 'Douala III' }),
  ]
  const teachers = enseignantsDe('SOURCE', 6)

  assert.equal(simuler(schools, teachers, 'commune').postesCouverts, 0)
  assert.equal(simuler(schools, teachers, 'departement').postesCouverts, 0)

  const etendu = simuler(schools, teachers, 'etendu')
  assert.equal(etendu.postesCouverts, 2)
  assert.ok(etendu.assignments.every(a => a.niveauProximite === 'hors_region'))
})

test('Cas 7 — besoin initial = postes couverts + postes restant à pourvoir', () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 4, nbEnseignantsEtat: 34, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 100, nbEnseignantsEtat: 0, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('SOURCE', 34, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  assert.equal(resultat.besoinInitial, 100)
  assert.equal(resultat.postesCouverts, 30)
  assert.equal(resultat.besoinResiduel, 70)
  assert.equal(resultat.postesCouverts + resultat.besoinResiduel, resultat.besoinInitial)

  const conservation = resultat.invariants.find(i => i.code === 'conservation_du_besoin')
  assert.ok(conservation?.ok)
})

test("Cas 8 — un enseignant n'apparaît jamais dans deux affectations", () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 2, nbEnseignantsEtat: 6, commune: 'Obala' }),
    ecole({ id: 'CIBLE1', nbClasses: 6, nbEnseignantsEtat: 1, commune: 'Obala' }),
    ecole({ id: 'CIBLE2', nbClasses: 6, nbEnseignantsEtat: 1, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('SOURCE', 6, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  const matricules = resultat.assignments.map(a => a.teacherId)
  assert.equal(new Set(matricules).size, matricules.length)
  assert.ok(resultat.invariants.find(i => i.code === 'un_enseignant_une_affectation')?.ok)
})

test('Cas 9 — un poste ne reçoit jamais deux enseignants', () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 2, nbEnseignantsEtat: 10, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 5, nbEnseignantsEtat: 2, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('SOURCE', 10, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  const postes = resultat.assignments.map(a => a.postId)
  assert.equal(new Set(postes).size, postes.length)
  assert.equal(resultat.postesCouverts, 3, 'le besoin de l’école cible borne le nombre de postes')
  assert.ok(resultat.invariants.find(i => i.code === 'un_poste_un_enseignant')?.ok)
})

test("Cas 10 — la simulation ne crée jamais de déficit dans l'école source", () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 8, nbEnseignantsEtat: 11, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 20, nbEnseignantsEtat: 0, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('SOURCE', 11, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  assert.equal(resultat.postesCouverts, 3, "seuls les 3 enseignants en excédent peuvent partir")

  const departs = resultat.assignments.filter(a => a.schoolOrigineId === 'SOURCE').length
  assert.equal(departs, 3)
  assert.ok(resultat.invariants.find(i => i.code === 'pas_de_deficit_cree')?.ok)
  assert.ok(resultat.invariants.find(i => i.code === 'departs_sous_excedent')?.ok)
  assert.ok(tousInvariantsOk(resultat.invariants))
})

test("Une école sans excédent ne fournit aucun candidat, même avec des enseignants actifs", () => {
  const schools = [
    ecole({ id: 'EQUILIBRE', nbClasses: 6, nbEnseignantsEtat: 6, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 2, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('EQUILIBRE', 6, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  assert.equal(resultat.pool.teachers.length, 0)
  assert.equal(resultat.postesCouverts, 0)
  assert.equal(resultat.besoinResiduel, 4)

  const exclusion = resultat.pool.exclusions.find(e => e.code === 'ecole_sans_excedent')
  assert.equal(exclusion?.count, 6)
})

test("Les enseignants non éligibles n'entrent pas dans le vivier", () => {
  const schools = [ecole({ id: 'SOURCE', nbClasses: 2, nbEnseignantsEtat: 8 })]
  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  const teachers = [
    enseignant({ id: 'T1', idEtabAttache: 'SOURCE' }),
    enseignant({ id: 'T2', idEtabAttache: 'SOURCE', statut: 'malade' }),
    enseignant({ id: 'T3', idEtabAttache: 'SOURCE', payeParEtat: false }),
    enseignant({ id: 'T4', idEtabAttache: 'INCONNUE' }),
    enseignant({ id: 'T1', idEtabAttache: 'SOURCE' }),
  ]

  const vivier = construireVivier(teachers, diagnostic.schools, DEFAULT_SETTINGS)
  assert.deepEqual(vivier.teachers.map(p => p.teacher.id), ['T1'])
  const codes = vivier.exclusions.map(e => e.code).sort()
  assert.deepEqual(codes, ['doublon', 'ecole_inconnue', 'non_paye_etat', 'statut_exclu'])
})

test("Un enseignant n'est jamais proposé sur un poste de sa propre école", () => {
  // Norme renforcée : l'école a simultanément un besoin et un excédent.
  const settings = cloneSettings(DEFAULT_SETTINGS)
  settings.normeEncadrement = { enseignantsParClasse: 2 }
  settings.minimumAConserver = { mode: 'ratioClasses', ratio: 0.5, valeurFixe: 1 }

  const schools = [
    ecole({ id: 'MIXTE', nbClasses: 6, nbEnseignantsEtat: 8, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 8, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('MIXTE', 8, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune', settings)
  assert.ok(resultat.assignments.length > 0)
  assert.ok(resultat.assignments.every(a => a.schoolOrigineId !== a.schoolDestinationId))
  assert.ok(resultat.invariants.find(i => i.code === 'pas_de_mouvement_interne')?.ok)
})

test('Le barème ordonne les départs au sein de la même école', () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 2, nbEnseignantsEtat: 4, commune: 'Obala' }),
    ecole({ id: 'CIBLE', nbClasses: 6, nbEnseignantsEtat: 5, commune: 'Obala' }),
  ]
  const teachers = [
    enseignant({ id: 'FAIBLE', idEtabAttache: 'SOURCE', communeAttache: 'Obala', ancienneteCarriereAns: 1, anciennetePosteAns: 0, nbEnfants: 0, formationContinue: 0 }),
    enseignant({ id: 'FORT', idEtabAttache: 'SOURCE', communeAttache: 'Obala', ancienneteCarriereAns: 30, anciennetePosteAns: 12, nbEnfants: 4, formationContinue: 3 }),
    enseignant({ id: 'MOYEN', idEtabAttache: 'SOURCE', communeAttache: 'Obala', ancienneteCarriereAns: 12, anciennetePosteAns: 6, nbEnfants: 2, formationContinue: 1 }),
    enseignant({ id: 'AUTRE', idEtabAttache: 'SOURCE', communeAttache: 'Obala', ancienneteCarriereAns: 5, anciennetePosteAns: 2, nbEnfants: 1, formationContinue: 0 }),
  ]

  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  assert.equal(diagnostic.bySchoolId.SOURCE.excedentTheorique, 2)

  const vivier = construireVivier(teachers, diagnostic.schools, DEFAULT_SETTINGS)
  assert.deepEqual(vivier.teachers.map(p => p.teacher.id), ['FORT', 'MOYEN'])
  assert.deepEqual(vivier.teachers.map(p => p.rangDansEcole), [1, 2])
})

test('Deux exécutions du même scénario produisent exactement le même résultat', () => {
  const schools = [
    ecole({ id: 'S1', nbClasses: 4, nbEnseignantsEtat: 7, commune: 'Obala' }),
    ecole({ id: 'S2', nbClasses: 4, nbEnseignantsEtat: 6, commune: 'Obala' }),
    ecole({ id: 'C1', nbClasses: 8, nbEnseignantsEtat: 3, commune: 'Obala' }),
  ]
  const teachers = [...enseignantsDe('S1', 7, { communeAttache: 'Obala' }), ...enseignantsDe('S2', 6, { communeAttache: 'Obala' })]

  const a = simuler(schools, teachers, 'commune')
  const b = simuler(schools, teachers, 'commune')
  assert.deepEqual(
    a.assignments.map(x => `${x.teacherId}->${x.postId}`),
    b.assignments.map(x => `${x.teacherId}->${x.postId}`),
  )
})

test("L'analyse avant / après reste cohérente avec les postes couverts", () => {
  const schools = [
    ecole({ id: 'SOURCE', nbClasses: 4, nbEnseignantsEtat: 8, commune: 'Obala' }),
    ecole({ id: 'CIBLE1', nbClasses: 6, nbEnseignantsEtat: 4, commune: 'Obala' }),
    ecole({ id: 'CIBLE2', nbClasses: 6, nbEnseignantsEtat: 5, commune: 'Obala' }),
  ]
  const teachers = enseignantsDe('SOURCE', 8, { communeAttache: 'Obala' })

  const resultat = simuler(schools, teachers, 'commune')
  assert.equal(resultat.before.deficitTotal, resultat.besoinInitial)
  assert.equal(resultat.after.deficitTotal, resultat.besoinResiduel)
  assert.equal(resultat.before.deficitTotal - resultat.after.deficitTotal, resultat.postesCouverts)
  assert.ok(resultat.after.ecolesEnDeficit <= resultat.before.ecolesEnDeficit)
})
