/**
 * Serveur de référence — décisions (faits du Prince, recrues), rapport de
 * décision et paramétrage.
 */

import { computeSchoolDiagnostic } from '../../lib/analytics/diagnostic'
import { selectionLabel } from '../../lib/analytics/territory'
import { inventaireSituations } from '../../lib/data/situation-familiale'
import { runSimulation } from '../../lib/simulation/engine'
import { construireRapport } from '../../lib/reporting/report'
import type { School } from '../../types/education'
import type { Recrue, ResultatRecrutes, SimulationResult } from '../../types/simulation'
import type { DecisionReport, ImpactEcolePrince, InventaireSituations } from '../../../frontend/components/shared/api/contrat'
import { JEU, REFERENCE_ISO, noeuds, type Contexte } from './contexte'
import { diagnosticsDe, querySelection, resultatDuPerimetre, selectionDe } from './diagnostic'
import type { Catalogue } from './outils'

const F = 'decisions'

/** Effet sur une école de l'arrivée (+1) ou du départ (−1) d'un enseignant. */
function impactEcole(ctx: Contexte, ecole: School, ecart: 1 | -1): ImpactEcolePrince {
  const avant = computeSchoolDiagnostic(ecole, ctx.settings)
  const apres = computeSchoolDiagnostic(
    { ...ecole, nbEnseignantsEtat: Math.max(0, ecole.nbEnseignantsEtat + ecart) },
    ctx.settings,
  )
  return {
    nom: ecole.nom,
    effectifAvant: avant.enseignantsEtat,
    effectifApres: apres.enseignantsEtat,
    besoinAvant: avant.besoinTheorique,
    besoinApres: apres.besoinTheorique,
    excedentAvant: avant.excedentTheorique,
    excedentApres: apres.excedentTheorique,
  }
}

/**
 * Recrues d'exemple, comme si un fichier de lauréats avait été importé : une
 * par école en déficit, au plus douze, chacune demandant son école en premier choix.
 */
function recruesExemple(ctx: Contexte): Recrue[] {
  const enDeficit = ctx.diagnostic.schools.filter(d => d.besoinTheorique > 0).slice(0, 12)
  return enDeficit.map((d, i) => ({
    id: `LAUREAT-${String(i + 1).padStart(3, '0')}`,
    nom: `Lauréat ${i + 1}`,
    sexe: i % 2 === 0 ? 'F' : 'M',
    sousSysteme: d.school.sousSysteme,
    note: Math.round((16 - i * 0.35) * 100) / 100,
    communeResidence: d.school.commune,
    choix: [d.school.id],
    ligneSource: i + 2,
  }))
}

/** Enregistre les routes et renvoie l'état initial des décisions. */
export function routesDecisions(ctx: Contexte, catalogue: Catalogue) {
  const base = `jeux/${JEU}`

  // Paramétrage.
  catalogue.ajouter(F, 'parametres/defaut/', {}, ctx.settings)
  catalogue.ajouter(F, `${base}/parametres/`, {}, ctx.settings)
  const situations: InventaireSituations = inventaireSituations(ctx.dataset.teachers.map(t => t.situationFamiliale))
  catalogue.ajouter(F, `${base}/situations-familiales/`, {}, situations)

  // Rapport de décision, pour chaque périmètre jusqu'au département et chaque scénario.
  const variantes: [Record<string, string>, SimulationResult | null][] = [
    [{}, null],
    ...ctx.scenarios.map(s => [{ scenario: s.scenario.id }, s.resultat] as [Record<string, string>, SimulationResult]),
  ]
  for (const noeud of noeuds(ctx.arbre)) {
    if (noeud.territory.level === 'commune') continue
    const selection = selectionDe(noeud)
    const diagnostics = diagnosticsDe(ctx, noeud)
    const comparaison = ctx.scenarios.map(s => resultatDuPerimetre(s.resultat, noeud))
    for (const [extra, complet] of variantes) {
      const rapport: DecisionReport = {
        ...construireRapport({
          diagnostic: ctx.diagnostic,
          diagnosticsFiltres: diagnostics,
          arbre: noeud,
          qualite: null,
          resultat: complet ? resultatDuPerimetre(complet, noeud) : null,
          comparaison,
          perimetre: selectionLabel(selection),
          settings: ctx.settings,
          nbEnseignantsLus: ctx.dataset.teachers.filter(t => noeud.schoolIds.includes(t.idEtabAttache)).length,
          donneesDemonstration: true,
        }),
        genereLe: REFERENCE_ISO,
      }
      catalogue.ajouter(F, `${base}/rapport/`, querySelection(selection, extra), rapport)
    }
  }

  // Aperçu des faits du Prince : effet du départ et de l'arrivée, école par école.
  const impactsPrince: Record<string, { retrait: ImpactEcolePrince; ajout: ImpactEcolePrince }> = {}
  for (const ecole of ctx.dataset.schools) {
    impactsPrince[ecole.id] = { retrait: impactEcole(ctx, ecole, -1), ajout: impactEcole(ctx, ecole, 1) }
  }

  // Recrues : un fichier d'exemple et leur déploiement dans chaque scénario.
  const exemple = recruesExemple(ctx)
  const recrutesParScenario: Record<string, ResultatRecrutes | null> = {}
  for (const { scenario } of ctx.scenarios) {
    recrutesParScenario[scenario.id] = runSimulation({
      diagnostics: ctx.diagnostic.schools,
      schools: ctx.dataset.schools,
      teachers: ctx.dataset.teachers,
      scenario,
      structures: ctx.diagnostic.structures,
      recrues: exemple,
    }).recrutes
  }

  return { parametres: ctx.settings, impactsPrince, recruesExemple: exemple, recrutesParScenario }
}
