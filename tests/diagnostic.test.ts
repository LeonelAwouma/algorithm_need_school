/**
 * Cas 1 à 3 du cahier des charges : besoin et excédent calculés école par école.
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

test('La règle du minimum à conserver est configurable', () => {
  const assoupli = cloneSettings(settings)
  assoupli.minimumAConserver = { mode: 'ratioClasses', ratio: 0.8, valeurFixe: 1 }
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 10, nbEnseignantsEtat: 10 }), assoupli)
  assert.equal(d.enseignantsMinimumAConserver, 8)
  assert.equal(d.excedentTheorique, 2)
})

test("La norme d'encadrement est configurable et modifie le besoin", () => {
  const renforce = cloneSettings(settings)
  renforce.normeEncadrement = { enseignantsParClasse: 1.5 }
  const d = computeSchoolDiagnostic(ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 6 }), renforce)
  assert.equal(d.besoinTheorique, 3)
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

test("La pression pédagogique n'est calculée qu'avec une cible configurée", () => {
  const avecCible = cloneSettings(settings)
  avecCible.referentielEleves = { cible: 50, annee: '2024', source: 'Paramètre utilisateur', commentaire: '' }
  const d = computeSchoolDiagnostic(
    ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4, effectifTotalEleves: 300 }),
    avecCible,
  )
  assert.equal(d.pressionPedagogique, 1.5)
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
