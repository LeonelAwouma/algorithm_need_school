/**
 * Vivier de redéploiement (référentiel §2.4 et §3.7).
 *
 * « Les maîtres au-delà de la dotation théorique forment le vivier de
 * redéploiement » : le vivier rassemble les enseignants administrativement
 * éligibles des écoles excédentaires (x > 0), et une école n'y fournit jamais plus
 * de candidats que son excédent x. Il sert au redéploiement obligatoire, qui
 * n'intervient qu'après les vœux et les propositions hors vœux.
 *
 * Sont écartés : les enseignants redéployés par fait de Prince, ceux qui partent
 * à la retraite à la rentrée, et — si le paramètre est actif — ceux que protège
 * la proximité de la retraite. Le barème individuel ordonne ensuite les départs
 * au sein de chaque école.
 */

import type { SchoolDiagnostic, Teacher } from '../../types/education'
import type { EngineSettings, PoolTeacher, RedeploymentPool } from '../../types/simulation'
import { STATUTS_EXCLUS } from '../data/parse'
import { partALaRetraite } from '../analytics/diagnostic'
import { procheDeLaRetraite } from './candidatures'
import { calculerBaremeIndividuel } from './scoring'

/** Statuts administrativement compatibles avec un redéploiement. */
const STATUTS_ELIGIBLES = new Set(['actif', 'disponible', 'en activite', 'en activité', 'active'])

interface Exclusion {
  code: string
  label: string
  count: number
}

class Compteur {
  private readonly map = new Map<string, Exclusion>()

  ajouter(code: string, label: string): void {
    const courant = this.map.get(code)
    if (courant) courant.count++
    else this.map.set(code, { code, label, count: 1 })
  }

  liste(): Exclusion[] {
    return [...this.map.values()].sort((a, b) => b.count - a.count)
  }
}

/** Vérifie l'éligibilité administrative d'un enseignant, indépendamment de son école. */
export function estEligibleAdministrativement(t: Teacher, settings: EngineSettings): { ok: boolean; motif?: string; label?: string } {
  if (!t.id) return { ok: false, motif: 'sans_matricule', label: 'sans matricule exploitable' }
  if (STATUTS_EXCLUS.has(t.statut)) return { ok: false, motif: 'statut_exclu', label: `statut « ${t.statut} »` }
  if (!STATUTS_ELIGIBLES.has(t.statut)) return { ok: false, motif: 'statut_non_eligible', label: `statut non éligible « ${t.statut} »` }
  if (!t.payeParEtat) return { ok: false, motif: 'non_paye_etat', label: "non payé par l'État" }
  if (partALaRetraite(t, settings)) return { ok: false, motif: 'retraite', label: 'départ à la retraite à la rentrée' }
  return { ok: true }
}

/**
 * Construit le vivier. Pour chaque école disposant d'un excédent, les
 * enseignants éligibles sont classés par barème décroissant et seuls les
 * `excedentTheorique` premiers sont retenus : une école ne peut jamais fournir
 * plus de candidats qu'elle n'a d'excédent.
 */
export function construireVivier(
  teachers: Teacher[],
  diagnostics: SchoolDiagnostic[],
  settings: EngineSettings,
): RedeploymentPool {
  const compteur = new Compteur()
  const parEcole = new Map<string, SchoolDiagnostic>(diagnostics.map(d => [d.school.id, d]))

  // Un matricule ne peut apparaître qu'une fois : le doublon est écarté ici,
  // ce qui garantit structurellement qu'un enseignant n'est jamais affecté deux fois.
  const vus = new Set<string>()
  const candidatsParEcole = new Map<string, PoolTeacher[]>()

  for (const t of teachers) {
    // Fait de Prince : décision de la DRH, acquise. L'algorithme ne la remet jamais en cause,
    // quels que soient l'ancienneté, l'âge ou le statut de l'enseignant.
    if (t.faitPrinceId) {
      compteur.ajouter('fait_prince', 'redéployé par fait de Prince (décision de la DRH, non remise en cause)')
      continue
    }

    const eligibilite = estEligibleAdministrativement(t, settings)
    if (!eligibilite.ok) {
      compteur.ajouter(eligibilite.motif ?? 'inconnu', eligibilite.label ?? 'motif inconnu')
      continue
    }
    if (vus.has(t.id)) {
      compteur.ajouter('doublon', 'matricule en double')
      continue
    }
    vus.add(t.id)

    if (!t.idEtabAttache) {
      compteur.ajouter('sans_ecole', "sans école de rattachement")
      continue
    }
    const ecole = parEcole.get(t.idEtabAttache)
    if (!ecole) {
      compteur.ajouter('ecole_inconnue', 'école de rattachement absente du fichier établissements')
      continue
    }
    if (ecole.excedentTheorique <= 0) {
      compteur.ajouter('ecole_sans_excedent', "école sans excédent mobilisable (son départ créerait un déficit)")
      continue
    }
    // Comme pour une demande de mutation, un départ imposé suppose la stabilité minimale au poste.
    if (settings.mobilite.stabilitePourObligatoire && t.anciennetePosteAns < settings.mobilite.stabiliteMinimaleAns) {
      compteur.ajouter('stabilite', `moins de ${settings.mobilite.stabiliteMinimaleAns} ans au poste`)
      continue
    }
    if (settings.mobilite.protegerProchesRetraite && procheDeLaRetraite(t, settings)) {
      compteur.ajouter('protege', `à moins de ${settings.mobilite.anneesAvantRetraite} ans de la retraite (protégé des transferts imposés)`)
      continue
    }

    const liste = candidatsParEcole.get(ecole.school.id) ?? []
    liste.push({
      teacher: t,
      bareme: calculerBaremeIndividuel(t, settings, ecole.priorite.niveauDifficulte),
      ecoleOrigine: { id: ecole.school.id, nom: ecole.school.nom, excedentMobilisable: ecole.excedentTheorique },
      rangDansEcole: 0,
      protege: false,
      affecte: false,
    })
    candidatsParEcole.set(ecole.school.id, liste)
  }

  const retenus: PoolTeacher[] = []
  const ecolesSources: RedeploymentPool['ecolesSources'] = []

  for (const [schoolId, liste] of candidatsParEcole) {
    const ecole = parEcole.get(schoolId)
    if (!ecole) continue
    liste.sort((a, b) => b.bareme - a.bareme || a.teacher.id.localeCompare(b.teacher.id))

    const plafond = ecole.excedentTheorique
    const gardes = liste.slice(0, plafond).map((p, i) => ({ ...p, rangDansEcole: i + 1 }))
    const ecartes = liste.length - gardes.length
    if (ecartes > 0) {
      for (let i = 0; i < ecartes; i++) {
        compteur.ajouter('au_dela_excedent', "au-delà de l'excédent mobilisable de son école")
      }
    }

    retenus.push(...gardes)
    ecolesSources.push({
      schoolId,
      nomEtab: ecole.school.nom,
      region: ecole.school.region,
      departement: ecole.school.departement,
      commune: ecole.school.commune,
      excedentMobilisable: plafond,
      candidatsRetenus: gardes.length,
    })
  }

  retenus.sort((a, b) => b.bareme - a.bareme || a.teacher.id.localeCompare(b.teacher.id))
  ecolesSources.sort((a, b) => b.excedentMobilisable - a.excedentMobilisable || a.nomEtab.localeCompare(b.nomEtab, 'fr'))

  return {
    teachers: retenus,
    ecolesSources,
    exclusions: compteur.liste(),
    excedentTotal: diagnostics.reduce((a, d) => a + d.excedentTheorique, 0),
  }
}
