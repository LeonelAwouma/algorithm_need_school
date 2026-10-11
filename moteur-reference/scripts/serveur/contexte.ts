/**
 * Contexte du serveur de référence : le jeu de démonstration, ses règles, son
 * diagnostic et les trois scénarios géographiques calculés.
 *
 * Tout est figé à une date de référence, pour que deux générations successives
 * produisent exactement les mêmes fichiers.
 */

import { runDiagnostic } from '../../lib/analytics/diagnostic'
import { construireArbreTerritorial } from '../../lib/analytics/territory'
import { DEFAULT_SETTINGS, cloneSettings } from '../../lib/config/settings'
import { construireJeuDemonstration } from '../../lib/data/demo-dataset'
import { runSimulation } from '../../lib/simulation/engine'
import { SCENARIOS_GEOGRAPHIQUES, scenarioGeographique } from '../../lib/simulation/scenarios'
import type { School, TerritorialSummary, Teacher } from '../../types/education'
import type {
  Dataset,
  DiagnosticResult,
  EngineSettings,
  SimulationResult,
  SimulationScenario,
} from '../../types/simulation'

/** Identifiant du jeu de démonstration dans l'API factice. */
export const JEU = 'demonstration'

/** Date de référence de toutes les données générées (rentrée 2026). */
export const REFERENCE = new Date(Date.UTC(2026, 8, 1, 8, 0, 0))
export const REFERENCE_ISO = REFERENCE.toISOString()

/** Scénario dont les mouvements alimentent la planification dans les données factices. */
export const SCENARIO_RETENU = 'geo-departement'

export interface ScenarioDeReference {
  scenario: SimulationScenario
  resultat: SimulationResult
}

export interface Contexte {
  dataset: Dataset
  settings: EngineSettings
  diagnostic: DiagnosticResult
  /** Arbre territorial complet (national → régions → départements → communes). */
  arbre: TerritorialSummary
  scenarios: ScenarioDeReference[]
  ecoleParId: Map<string, School>
  enseignantParMatricule: Map<string, Teacher>
}

/** Calcule le contexte complet du jeu de démonstration. */
export function construireContexte(): Contexte {
  const dataset = construireJeuDemonstration(REFERENCE)
  const settings: EngineSettings = { ...cloneSettings(DEFAULT_SETTINGS), anneeScolaire: '2026-2027' }
  const diagnostic = runDiagnostic(dataset.schools, settings, dataset.teachers)

  const scenarios = SCENARIOS_GEOGRAPHIQUES.map(scope => {
    const scenario: SimulationScenario = { ...scenarioGeographique(scope, settings), createdAt: REFERENCE_ISO }
    const resultat = runSimulation({
      diagnostics: diagnostic.schools,
      schools: dataset.schools,
      teachers: dataset.teachers,
      scenario,
      structures: diagnostic.structures,
    })
    return { scenario, resultat: { ...resultat, computedAt: REFERENCE_ISO } }
  })

  return {
    dataset,
    settings,
    diagnostic,
    arbre: construireArbreTerritorial(diagnostic.schools),
    scenarios,
    ecoleParId: new Map(dataset.schools.map(s => [s.id, s])),
    enseignantParMatricule: new Map(dataset.teachers.map(t => [t.id, t])),
  }
}

/** Scénario de référence par identifiant. */
export function scenarioDe(ctx: Contexte, id: string): ScenarioDeReference {
  const trouve = ctx.scenarios.find(s => s.scenario.id === id)
  if (!trouve) throw new Error(`Scénario inconnu : ${id}`)
  return trouve
}

/** Tous les nœuds de l'arbre, du national aux communes, dans l'ordre de parcours. */
export function noeuds(arbre: TerritorialSummary): TerritorialSummary[] {
  return [arbre, ...arbre.children.flatMap(noeuds)]
}
