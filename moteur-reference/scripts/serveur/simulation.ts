/**
 * Serveur de référence — contexte « Simulation » : modèles, scénarios calculés,
 * résultat et ses sections, flux territoriaux et comparaison.
 *
 * Le résultat complet et la comparaison, volumineux, sont enregistrés pour le
 * national et les régions (plus bas, les données factices reprennent la
 * région) ; les flux, plus légers, pour tous les nœuds.
 */

import { expliquerProposition, reductionDuDeficit } from '../../lib/analytics/narrative'
import { calculerFlux } from '../../lib/simulation/filter'
import { SCENARIO_PRESETS } from '../../lib/simulation/scenarios'
import type { TerritorialSummary } from '../../types/education'
import type { SimulationResult } from '../../types/simulation'
import type {
  SimulationResult as ResultatContrat,
  ComparaisonScenarios,
  EcoleNonCouverte,
  ExplicationProposition,
  JournalSimulation,
  PresetScenario,
  ProjectionsScenario,
  ScenarioCalcule,
} from '../../../frontend/src/shared/api/contrat'
import { JEU, REFERENCE_ISO, noeuds, type Contexte, type ScenarioDeReference } from './contexte'
import { querySelection, resultatDuPerimetre, selectionDe } from './diagnostic'
import { json, type Catalogue } from './outils'

const F = 'simulation'
/** Famille des réponses volumineuses, chargées seulement quand un écran les demande. */
const F_RESULTATS = 'resultats'

/** Niveaux pour lesquels le résultat complet est enregistré. */
const estDetaille = (noeud: TerritorialSummary) =>
  noeud.territory.level === 'national' || noeud.territory.level === 'region'

/** Scénario et indicateurs principaux de son résultat. */
export function scenarioCalcule({ scenario, resultat }: ScenarioDeReference): ScenarioCalcule {
  return {
    scenario,
    calcule: true,
    obsolete: false,
    calculeLe: REFERENCE_ISO,
    indicateurs: {
      besoinInitial: resultat.besoinInitial,
      postesCouverts: resultat.postesCouverts,
      besoinResiduel: resultat.besoinResiduel,
      tauxCouverture: resultat.tauxCouverture,
      enseignantsDeplaces: resultat.enseignantsDeplaces,
      mouvementsParPerimetre: resultat.mouvementsParPerimetre,
      controlesEnEcart: resultat.invariants.filter(i => !i.ok).length,
    },
  }
}

/**
 * Résultat publié par l'API. Le serveur complète les vœux portant sur l'autre
 * sous-système : le départ reste-t-il dans la limite de l'excédent de l'école
 * d'attache, une fois comptés les départs déjà proposés au niveau national ?
 */
export function resultatPublie(ctx: Contexte, resultat: SimulationResult, national: SimulationResult): ResultatContrat {
  const departs = new Map<string, number>()
  for (const a of national.assignments) departs.set(a.schoolOrigineId, (departs.get(a.schoolOrigineId) ?? 0) + 1)
  const ecoleDe = new Map(national.candidatures.map(c => [c.teacher.id, c.ecoleOrigine.id]))
  const restant = (ecole: string) =>
    (ctx.diagnostic.bySchoolId[ecole]?.excedentTheorique ?? 0) - (departs.get(ecole) ?? 0)

  const publie = json(resultat)
  return {
    ...publie,
    voeuxAutreSousSysteme: publie.voeuxAutreSousSysteme.map(v => ({
      ...v,
      departDansLimiteExcedent: restant(ecoleDe.get(v.teacherId) ?? '') > 0,
    })),
  }
}

/** Écoles restées sans maître, regroupées, avec les combinaisons proposées à la commission. */
function ecolesNonCouvertes(resultat: SimulationResult): EcoleNonCouverte[] {
  const parEcole = new Map<string, EcoleNonCouverte>()
  for (const p of resultat.uncoveredPosts) {
    const ecole = parEcole.get(p.schoolId) ?? {
      schoolId: p.schoolId,
      nom: p.nomEtab,
      commune: p.commune,
      sousSysteme: p.sousSysteme,
      indice: p.priorite.indice,
      postes: 0,
      zoneSecurite: p.priorite.zoneSecurite,
      zoneRouge: p.priorite.zoneRouge,
      combinaisons: resultat.combinaisons.filter(c => c.schoolId === p.schoolId),
    }
    ecole.postes++
    parEcole.set(p.schoolId, ecole)
  }
  return [...parEcole.values()].sort((a, b) => b.indice - a.indice)
}

/** Enregistre les routes de la simulation. */
export function routesSimulation(ctx: Contexte, catalogue: Catalogue): ScenarioCalcule[] {
  const base = `jeux/${JEU}`

  const presets: PresetScenario[] = SCENARIO_PRESETS.map(p => {
    const { disponible, motif } = p.verifierDisponibilite(ctx.diagnostic.schools)
    return { cle: p.cle, nom: p.nom, description: p.description, scope: p.scope, disponible, motif }
  })
  catalogue.ajouter(F, 'scenarios/presets/', {}, presets)
  catalogue.ajouter(F, 'scenarios/presets/', { jeu: JEU }, presets)

  const calcules = ctx.scenarios.map(scenarioCalcule)
  catalogue.ajouter(F, `${base}/scenarios/`, {}, calcules)

  for (const ref of ctx.scenarios) {
    const { scenario, resultat } = ref
    const s = `${base}/scenarios/${scenario.id}`
    catalogue.ajouter(F, `${s}/`, {}, scenarioCalcule(ref))

    catalogue.ajouterListe(F, `${s}/affectations/`, {}, resultat.assignments)
    for (const a of resultat.assignments) {
      const explication = expliquerProposition(resultat, a.postId)
      if (!explication) continue
      const reponse: ExplicationProposition = { ...explication, proposition: a }
      catalogue.ajouter(F, `${s}/affectations/${encodeURIComponent(a.teacherId)}/explication/`, {}, reponse)
    }
    catalogue.ajouterListe(F, `${s}/non-affectes/`, {}, json(resultat.unmatchedTeachers))
    catalogue.ajouter(F, `${s}/vivier/`, {}, json(resultat.pool))
    catalogue.ajouterListe(F, `${s}/postes/`, {}, resultat.postes)
    catalogue.ajouter(F, `${s}/postes-non-couverts/`, {}, ecolesNonCouvertes(resultat))
    catalogue.ajouterListe(F, `${s}/candidatures/`, {}, json(resultat.candidatures))
    catalogue.ajouter(F, `${s}/combinaisons/`, {}, resultat.combinaisons)
    const journal: JournalSimulation = {
      tours: resultat.tours,
      toursTronques: resultat.toursTronques,
      logs: resultat.logs,
      computedAt: resultat.computedAt,
    }
    catalogue.ajouter(F, `${s}/journal/`, {}, journal)
    catalogue.ajouter(F, `${s}/invariants/`, {}, resultat.invariants)
    const projections: ProjectionsScenario = resultat.projectionPluriannuelle
    catalogue.ajouter(F, `${s}/projections/`, {}, projections)
    catalogue.ajouter(F, `${s}/recrutes/`, {}, resultat.recrutes)

    for (const noeud of noeuds(ctx.arbre)) {
      const q = querySelection(selectionDe(noeud))
      catalogue.ajouter(F, `${s}/flux/`, q, json(calculerFlux(resultat, new Set(noeud.schoolIds))))
      if (estDetaille(noeud)) {
        catalogue.ajouter(
          F_RESULTATS,
          `${s}/resultat/`,
          q,
          resultatPublie(ctx, resultatDuPerimetre(resultat, noeud), resultat),
        )
      }
    }
  }

  for (const noeud of noeuds(ctx.arbre)) {
    if (!estDetaille(noeud)) continue
    const resultats = ctx.scenarios.map(s => resultatPublie(ctx, resultatDuPerimetre(s.resultat, noeud), s.resultat))
    const comparaison: ComparaisonScenarios = {
      resultats,
      reductions: ctx.scenarios.map(s => reductionDuDeficit(resultatDuPerimetre(s.resultat, noeud))),
    }
    catalogue.ajouter(F_RESULTATS, `${base}/comparaison/`, querySelection(selectionDe(noeud)), comparaison)
  }

  return calcules
}
