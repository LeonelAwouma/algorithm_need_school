/**
 * Cas 1 à 3 du cahier des charges : besoin et excédent calculés école par école.
 * Sans effectif d'élèves, la règle se replie sur les classes (un maître par
 * classe) ; les exemples chiffrés du référentiel sont dans referentiel.test.ts.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { computeSchoolDiagnostic, runDiagnostic } from '../lib/analytics/diagnostic'
import { DEFAULT_SETTINGS, cloneSettings } from '../lib/config/settings'
import { ecole } from './fixtures'

const settings = DEFAULT_SETTINGS

test('Cas 1 — 6 classes, 4 enseignants : besoin = 2, excédent = 0', () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }), settings)
  assert.equal(d.besoinTheorique, 2)
  assert.equal(d.excedentTheorique, 0)
  assert.equal(d.enseignantsMinimumAConserver, 6)
})

test('Cas 2 — 6 classes, 8 enseignants : besoin = 0, excédent = 2', () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 8 }), settings)
  assert.equal(d.besoinTheorique, 0)
  assert.equal(d.excedentTheorique, 2)
})

test('Cas 3 — 6 classes, 6 enseignants : besoin = 0, excédent = 0', () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 6 }), settings)
  assert.equal(d.besoinTheorique, 0)
  assert.equal(d.excedentTheorique, 0)
  assert.equal(d.severite, 'satisfaisant')
})

test("Exemple du cahier des charges — 8 classes, 11 enseignants : excédent mobilisable = 3", () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 8, nbEnseignantsEtat: 11 }), settings)
  assert.equal(d.besoinTheorique, 0)
  assert.equal(d.enseignantsMinimumAConserver, 8)
  assert.equal(d.excedentTheorique, 3)
})

test('Les postes officiellement déclarés ne sont jamais écrasés par le besoin calculé', () => {
  const d = computeSchoolDiagnostic(
    ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4, nbPostesOuvertsDeclares: 5 }),
    settings,
  )
  assert.equal(d.besoinTheorique, 2)
  assert.equal(d.postesDeclares, 5)
  assert.equal(d.ecartBesoinDeclare, 3)
})

test("L'absence de postes déclarés laisse l'écart à null, sans valeur inventée", () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }), settings)
  assert.equal(d.postesDeclares, null)
  assert.equal(d.ecartBesoinDeclare, null)
})

test('Sans effectif, le repli sur les classes est signalé et reste paramétrable', () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 6 }), settings)
  assert.equal(d.calcul.methode, 'repli_classes')
  const renforce = cloneSettings(settings)
  renforce.besoin.enseignantsParClasseRepli = 1.5
  assert.equal(computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 6 }), renforce).besoinTheorique, 3)
})

test("La norme d'élèves par maître est paramétrable et modifie le besoin", () => {
  const renforce = cloneSettings(settings)
  renforce.besoin.elevesParMaitre = 40
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 6, effectifTotalEleves: 320 }), renforce)
  assert.equal(d.calcul.norme, 8)
  assert.equal(d.besoinTheorique, 2)
})

test('Les indicateurs élèves restent nuls quand les effectifs sont absents', () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }), settings)
  assert.equal(d.elevesParClasse, null)
  assert.equal(d.elevesParEnseignantEtat, null)
  assert.equal(d.pressionPedagogique, null)
})

test('Les indicateurs élèves sont calculés dès que les effectifs sont fournis', () => {
  const d = computeSchoolDiagnostic(
    ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4, effectifTotalEleves: 300, nbAutresEnseignants: 2 }),
    settings,
  )
  assert.equal(d.elevesParClasse, 50)
  assert.equal(d.elevesParEnseignantEtat, 75)
  assert.equal(d.elevesParEnseignant, 50)
})

test('La pression pédagogique rapporte le REM à la norme de la note de cadrage', () => {
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4, effectifTotalEleves: 300 }), settings)
  assert.equal(d.pressionPedagogique, 1.25)
})

test('Le diagnostic national additionne besoins et excédents école par école', () => {
  const resultat = runDiagnostic(
    [
      ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }),
      ecole({ id: 'B', nbClasses: 6, nbEnseignantsEtat: 8 }),
      ecole({ id: 'C', nbClasses: 6, nbEnseignantsEtat: 6 }),
    ],
    settings,
  )
  assert.equal(resultat.totals.postesNecessaires, 2)
  assert.equal(resultat.totals.excedentMobilisable, 2)
  assert.equal(resultat.totals.ecolesEnDeficit, 1)
  assert.equal(resultat.totals.ecolesAvecExcedent, 1)
  assert.equal(resultat.totals.ecolesAnalysees, 3)
})

test('Les doublons d’identifiant ne sont comptés qu’une fois dans le diagnostic', () => {
  const resultat = runDiagnostic(
    [
      ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }),
      ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }),
    ],
    settings,
  )
  assert.equal(resultat.totals.ecolesAnalysees, 1)
  assert.equal(resultat.totals.postesNecessaires, 2)
})
