/**
 * Test de bout en bout du pipeline, sur le jeu de démonstration complet :
 * import → diagnostic → vivier → scénarios → avant/après → rapport.
 *
 * Il vérifie que la chaîne entière s'exécute et reste cohérente à une taille
 * réaliste, là où les autres fichiers de test isolent chaque règle.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { runDiagnostic } from '../lib/analytics/diagnostic'
import { construireArbreTerritorial, filtrerParTerritoire, selectionLabel } from '../lib/analytics/territory'
import { diagnosticTerritorial, pointsAttention, reductionDuDeficit, syntheseTableauDeBord } from '../lib/analytics/narrative'
import { DEFAULT_SETTINGS } from '../lib/config/settings'
import { construireJeuDemonstration } from '../lib/data/demo-dataset'
import { runSimulation } from '../lib/simulation/engine'
import { restreindreResultat } from '../lib/simulation/filter'
import { tousInvariantsOk } from '../lib/simulation/invariants'
import { SCENARIOS_GEOGRAPHIQUES, scenarioGeographique } from '../lib/simulation/scenarios'
import { construireRapport } from '../lib/reporting/report'
import type { SimulationResult } from '../types/simulation'

const dataset = construireJeuDemonstration()
const diagnostic = runDiagnostic(dataset.schools, DEFAULT_SETTINGS)
const arbre = construireArbreTerritorial(diagnostic.schools)
const resultats: SimulationResult[] = SCENARIOS_GEOGRAPHIQUES.map(scope =>
  runSimulation({
    diagnostics: diagnostic.schools,
    teachers: dataset.teachers,
    scenario: scenarioGeographique(scope, DEFAULT_SETTINGS),
  }),
)

test('Le diagnostic couvre tout le jeu de données sans perte', () => {
  assert.equal(diagnostic.schools.length, dataset.schools.length)
  assert.equal(
    diagnostic.totals.classes,
    dataset.schools.reduce((a, s) => a + s.nbClasses, 0),
  )
  assert.equal(
    diagnostic.totals.enseignantsEtat,
    dataset.schools.reduce((a, s) => a + s.nbEnseignantsEtat, 0),
  )
  assert.ok(diagnostic.totals.postesNecessaires > 0, 'le jeu de démonstration comporte des écoles en déficit')
  assert.ok(diagnostic.totals.excedentMobilisable > 0, 'il comporte aussi des écoles en excédent')
})

test("L'arbre territorial conserve exactement les totaux nationaux", () => {
  assert.equal(arbre.totals.ecolesAnalysees, diagnostic.totals.ecolesAnalysees)
  assert.equal(arbre.totals.postesNecessaires, diagnostic.totals.postesNecessaires)
  assert.equal(arbre.totals.excedentMobilisable, diagnostic.totals.excedentMobilisable)

  const sommeRegions = arbre.children.reduce((a, r) => a + r.totals.postesNecessaires, 0)
  assert.equal(sommeRegions, arbre.totals.postesNecessaires)

  const sommeDepartements = arbre.children.flatMap(r => r.children).reduce((a, d) => a + d.totals.postesNecessaires, 0)
  assert.equal(sommeDepartements, arbre.totals.postesNecessaires)

  const sommeCommunes = arbre.children
    .flatMap(r => r.children)
    .flatMap(d => d.children)
    .reduce((a, c) => a + c.totals.postesNecessaires, 0)
  assert.equal(sommeCommunes, arbre.totals.postesNecessaires)
})

test('Les trois scénarios respectent tous les invariants métier', () => {
  for (const resultat of resultats) {
    assert.ok(tousInvariantsOk(resultat.invariants), `invariant en échec pour le scénario ${resultat.scope}`)
    assert.equal(resultat.postesCouverts + resultat.besoinResiduel, resultat.besoinInitial)
    assert.equal(resultat.besoinInitial, diagnostic.totals.postesNecessaires)
  }
})

test('Élargir le périmètre ne peut jamais réduire la couverture', () => {
  const [local, departemental, etendu] = resultats
  assert.ok(departemental.postesCouverts >= local.postesCouverts)
  assert.ok(etendu.postesCouverts >= departemental.postesCouverts)
  assert.ok(etendu.tauxCouverture >= local.tauxCouverture)
})

test('Chaque scénario respecte son propre périmètre géographique', () => {
  const [local, departemental] = resultats
  assert.ok(local.assignments.every(a => a.niveauProximite === 'meme_commune'))
  assert.ok(departemental.assignments.every(a => a.niveauProximite === 'meme_commune' || a.niveauProximite === 'meme_departement'))
})

test('Aucune école ne perd plus d’enseignants que son excédent, sur tout le jeu', () => {
  for (const resultat of resultats) {
    const departs = new Map<string, number>()
    for (const a of resultat.assignments) departs.set(a.schoolOrigineId, (departs.get(a.schoolOrigineId) ?? 0) + 1)
    for (const [schoolId, nb] of departs) {
      const ecole = diagnostic.bySchoolId[schoolId]
      assert.ok(ecole, `école source inconnue : ${schoolId}`)
      assert.ok(nb <= ecole.excedentTheorique, `${schoolId} : ${nb} départs pour ${ecole.excedentTheorique} autorisés`)
    }
  }
})

test("La lecture territoriale d'un résultat reste cohérente", () => {
  const region = arbre.children[0].territory.nom
  const ecolesRegion = filtrerParTerritoire(diagnostic.schools, { region, departement: null, commune: null })
  const ids = new Set(ecolesRegion.map(d => d.school.id))

  const complet = resultats[1]
  const restreint = restreindreResultat(complet, ids)

  assert.equal(restreint.postesCouverts + restreint.besoinResiduel, restreint.besoinInitial)
  assert.ok(restreint.besoinInitial <= complet.besoinInitial)
  assert.ok(restreint.assignments.every(a => ids.has(a.schoolDestinationId)))
  assert.equal(
    restreint.besoinInitial,
    ecolesRegion.reduce((a, d) => a + d.besoinTheorique, 0),
  )
})

test('Les textes de diagnostic sont produits pour un jeu réaliste', () => {
  const synthese = syntheseTableauDeBord(arbre.totals, resultats[1], 'le Cameroun')
  assert.ok(synthese.length >= 3)
  assert.ok(synthese.every(e => e.texte.length > 0 && e.regle.length > 0))

  const national = diagnosticTerritorial(arbre.totals, dataset.teachers.length, resultats[1], 'le Cameroun')
  assert.ok(national.length >= 3)

  const attention = pointsAttention(diagnostic.schools, arbre, null)
  assert.ok(attention.length > 0)

  const reduction = reductionDuDeficit(resultats[1])
  assert.ok(reduction && reduction.texte.includes('Réduction du déficit'))
})

test('Chaque proposition est explicable par les composantes réelles de son score', () => {
  const resultat = resultats[2]
  assert.ok(resultat.assignments.length > 0)
  for (const a of resultat.assignments.slice(0, 50)) {
    assert.ok(a.breakdown.components.length > 0)
    const somme = a.breakdown.components.reduce((s, c) => s + c.contribution, 0)
    assert.ok(Math.abs(somme - a.breakdown.total) < 0.01, 'le total affiché correspond à la somme des composantes')
    assert.equal(a.breakdown.total, a.score, 'le score utilisé pour le choix est celui qui est expliqué')
  }
})

test('Le rapport décisionnel contient toutes ses sections et la mention obligatoire', () => {
  const rapport = construireRapport({
    diagnostic,
    diagnosticsFiltres: diagnostic.schools,
    arbre,
    qualite: null,
    resultat: resultats[1],
    comparaison: resultats,
    perimetre: selectionLabel({ region: null, departement: null, commune: null }),
    settings: DEFAULT_SETTINGS,
    nbEnseignantsLus: dataset.teachers.length,
    donneesDemonstration: true,
  })

  const titres = rapport.sections.map(s => s.titre)
  for (const attendu of [
    'Contexte des données',
    'Couverture du jeu de données',
    'Situation générale',
    'Besoins territoriaux — régions',
    'Besoins territoriaux — départements',
    'Excédents mobilisables',
    'Résultats du scénario',
    'Avant / Après simulation',
    'Comparaison des scénarios géographiques',
    'Établissements nécessitant une attention particulière',
    'Postes restant à couvrir après simulation',
    'Méthodologie et hypothèses',
    'Limites',
    'Statut de ce document',
  ]) {
    assert.ok(titres.includes(attendu), `section manquante : ${attendu}`)
  }

  const texte = rapport.sections.flatMap(s => [...s.paragraphes, ...(s.points ?? [])]).join(' ')
  assert.ok(texte.includes("ne constituent pas des décisions administratives"))
  assert.ok(texte.includes('démonstration'), 'le rapport signale les données de démonstration')
  assert.ok(!texte.toLowerCase().includes('meilleur scénario'))
})
