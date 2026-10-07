/**
 * Projection pluriannuelle, de la rentrée du plan (N+1) à N+3.
 *
 * Reprise du tableau « Projections N à N+3 » du moteur de référence MINEDUB, avec
 * les corrections suivantes :
 *   — les départs à la retraite sont comptés sur tous les enseignants de l'école
 *     après le plan (et non sur les seuls enseignants du vivier), à partir de leur
 *     âge à chaque rentrée : un enseignant n'est compté qu'une fois, l'année où il
 *     atteint l'âge de la retraite ;
 *   — l'attrition hors retraite n'est pas arrondie école par école (⌈2 % × 3⌉ = 1
 *     départ par an dans chaque école, soit des centaines de départs fictifs) : elle
 *     est appliquée au niveau du territoire, par sous-système, comme le prévoit le
 *     §2.6 du référentiel ;
 *   — le besoin projeté reprend la règle du §2.4 (cible K), et le recrutement à
 *     prévoir compare besoin et excédent par sous-système, sans recrutement
 *     intermédiaire.
 */

import type { SchoolDiagnostic, Teacher } from '../../types/education'
import type {
  EngineSettings,
  ProjectionEcole,
  ProjectionTerritoire,
  ProposedAssignment,
  ResultatRecrutes,
} from '../../types/simulation'
import { ageA } from '../analytics/diagnostic'
import { dateRentree } from '../config/settings'
import { STATUTS_EXCLUS } from '../data/parse'

const ANNEES = ['N+1', 'N+2', 'N+3'] as const

export function projeterPluriannuel(
  diagnostics: SchoolDiagnostic[],
  teachers: Teacher[],
  assignments: ProposedAssignment[],
  recrutes: ResultatRecrutes | null,
  settings: EngineSettings,
): { ecoles: ProjectionEcole[]; territoire: ProjectionTerritoire[] } {
  const R = settings.besoin.ageRetraite
  const arrivants = new Map<string, string[]>()
  const sortants = new Map<string, string[]>()
  const position = new Map<string, string>()
  for (const a of assignments) {
    arrivants.set(a.schoolDestinationId, [...(arrivants.get(a.schoolDestinationId) ?? []), a.teacherId])
    sortants.set(a.schoolOrigineId, [...(sortants.get(a.schoolOrigineId) ?? []), a.teacherId])
    position.set(a.teacherId, a.schoolDestinationId)
  }
  for (const r of recrutes?.affectations ?? []) {
    arrivants.set(r.schoolId, [...(arrivants.get(r.schoolId) ?? []), r.recrueId])
  }

  // Départs à la retraite pendant les années N+1 et N+2, à l'école occupée après le plan.
  const rentrees = [0, 1, 2].map(k => dateRentree(settings.anneeScolaire, k))
  const retraites = [new Map<string, number>(), new Map<string, number>()]
  for (const t of teachers) {
    if (!t.payeParEtat || STATUTS_EXCLUS.has(t.statut) || !t.idEtabAttache) continue
    const ages = rentrees.map(d => ageA(t, d))
    if (ages.some(a => a == null)) continue
    const ecole = position.get(t.id) ?? t.idEtabAttache
    for (let k = 0; k < 2; k++) {
      if ((ages[k] as number) < R && (ages[k + 1] as number) >= R) {
        retraites[k].set(ecole, (retraites[k].get(ecole) ?? 0) + 1)
      }
    }
  }

  const ecoles: ProjectionEcole[] = diagnostics.map(d => {
    const id = d.school.id
    const entrees = arrivants.get(id) ?? []
    const sorties = sortants.get(id) ?? []
    const effectifs = [d.enseignantsEtat + entrees.length - sorties.length]
    effectifs.push(effectifs[0] - (retraites[0].get(id) ?? 0))
    effectifs.push(effectifs[1] - (retraites[1].get(id) ?? 0))
    return {
      schoolId: id,
      nomEtab: d.school.nom,
      sousSysteme: d.school.sousSysteme,
      region: d.school.region,
      departement: d.school.departement,
      commune: d.school.commune,
      indicePriorite: d.priorite.indice,
      bmax: d.calcul.bmax,
      dotation: d.calcul.dotation,
      cible: d.calcul.cible,
      besoinAvantPlan: d.besoinTheorique,
      excedentAvantPlan: d.excedentTheorique,
      arrivants: entrees,
      sortants: sorties,
      sallesManquantes: d.calcul.sallesManquantes,
      annees: ANNEES.map((annee, k) => ({
        annee,
        departsRetraite: k === 0 ? d.calcul.departsConnus : retraites[k - 1].get(id) ?? 0,
        effectif: effectifs[k],
        besoin: Math.max(0, d.calcul.cible - effectifs[k]),
        excedent: Math.max(0, effectifs[k] - d.calcul.dotation),
      })),
    }
  })

  // Totaux par sous-système, attrition appliquée au territoire.
  const tau = Math.max(0, settings.recrutement.tauxAttritionHorsRetraite)
  const groupes = new Map<ProjectionTerritoire['sousSysteme'], ProjectionEcole[]>()
  for (const e of ecoles) {
    const cle = e.sousSysteme ?? 'non_renseigne'
    groupes.set(cle, [...(groupes.get(cle) ?? []), e])
  }
  const territoire: ProjectionTerritoire[] = []
  for (const [sousSysteme, liste] of groupes) {
    let attritionCumulee = 0
    ANNEES.forEach((annee, k) => {
      const somme = (f: (a: ProjectionEcole['annees'][number]) => number) => liste.reduce((s, e) => s + f(e.annees[k]), 0)
      const effectif = somme(a => a.effectif)
      const besoin = somme(a => a.besoin)
      const excedent = somme(a => a.excedent)
      const attrition = Math.ceil((tau * effectif) / 100)
      attritionCumulee += attrition
      territoire.push({
        annee,
        sousSysteme,
        effectif,
        departsRetraite: somme(a => a.departsRetraite),
        attrition,
        besoin,
        excedent,
        recrutementAPrevoir: Math.max(0, besoin - excedent) + attritionCumulee,
      })
    })
  }
  territoire.sort((a, b) => a.annee.localeCompare(b.annee) || a.sousSysteme.localeCompare(b.sousSysteme))
  return { ecoles, territoire }
}
