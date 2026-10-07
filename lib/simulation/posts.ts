/**
 * Référentiel des écoles nécessiteuses et des structures d'accueil (§3.1).
 *
 * Un poste est une unité de besoin b d'une école nécessiteuse, ou une place
 * d'une structure administrative (délégation, IAEB) fixée par la hiérarchie.
 * Les postes sont classés par indice de priorité u = w + β décroissant ; à
 * indice égal, les écoles passent avant les structures, puis l'école au REM
 * actuel le plus élevé. Ce rang ordonne la recherche des solutions proches, la
 * présentation des écoles non couvertes à la commission, le redéploiement
 * obligatoire et la liste publiée pour les nouveaux recrutés.
 */

import type { School, SchoolDiagnostic } from '../../types/education'
import type { EngineSettings, TeachingPost } from '../../types/simulation'
import { calculerPriorite } from '../analytics/diagnostic'

/** Nombre de postes à ouvrir pour une école, selon la source configurée. */
export function nombreDePostes(d: SchoolDiagnostic, settings: EngineSettings): number {
  switch (settings.sourceDesPostes) {
    case 'postesDeclares':
      return Math.max(0, d.postesDeclares ?? 0)
    case 'maximum':
      return Math.max(d.besoinTheorique, d.postesDeclares ?? 0)
    case 'besoinCalcule':
    default:
      return d.besoinTheorique
  }
}

interface LigneReferentiel {
  school: School
  postes: number
  priorite: TeachingPost['priorite']
  rem: number | null
  multigrades: number
  elevesParEnseignantEtat: number | null
}

/** Ordre du référentiel : indice décroissant, écoles avant structures, REM le plus élevé, puis code. */
export function comparerPriorite(
  a: { priorite: { indice: number }; estStructure: boolean; rem: number | null; id: string },
  b: { priorite: { indice: number }; estStructure: boolean; rem: number | null; id: string },
): number {
  if (b.priorite.indice !== a.priorite.indice) return b.priorite.indice - a.priorite.indice
  if (a.estStructure !== b.estStructure) return a.estStructure ? 1 : -1
  const ra = a.rem ?? -1
  const rb = b.rem ?? -1
  if (rb !== ra) return rb - ra
  return a.id.localeCompare(b.id)
}

/** Construit la liste des postes ouverts, classée par priorité. */
export function construirePostes(
  diagnostics: SchoolDiagnostic[],
  settings: EngineSettings,
  structures: School[] = [],
): TeachingPost[] {
  const lignes: LigneReferentiel[] = []

  for (const d of diagnostics) {
    const postes = nombreDePostes(d, settings)
    if (postes <= 0) continue
    lignes.push({
      school: d.school,
      postes,
      priorite: d.priorite,
      rem: d.calcul.remActuel,
      multigrades: d.school.classesMultigrades,
      elevesParEnseignantEtat: d.elevesParEnseignantEtat,
    })
  }
  for (const s of structures) {
    const postes = Math.max(0, s.nbPostesOuvertsDeclares ?? 0)
    if (postes <= 0) continue
    lignes.push({ school: s, postes, priorite: calculerPriorite(s, settings, null), rem: null, multigrades: 0, elevesParEnseignantEtat: null })
  }

  lignes.sort((a, b) =>
    comparerPriorite(
      { priorite: a.priorite, estStructure: a.school.estStructure, rem: a.rem, id: a.school.id },
      { priorite: b.priorite, estStructure: b.school.estStructure, rem: b.rem, id: b.school.id },
    ),
  )

  const postes: TeachingPost[] = []
  lignes.forEach((l, i) => {
    for (let k = 0; k < l.postes; k++) {
      postes.push({
        id: `${l.school.id}::P${k + 1}`,
        schoolId: l.school.id,
        nomEtab: l.school.nom,
        region: l.school.region,
        iaeb: l.school.iaeb,
        departement: l.school.departement,
        commune: l.school.commune,
        zone: l.school.zone,
        typeEtab: l.school.typeEtab,
        sousSysteme: l.school.sousSysteme,
        estStructure: l.school.estStructure,
        classesMultigrades: l.multigrades,
        prioriteLocale: l.school.prioriteLocale,
        deficitEcole: l.postes,
        elevesParEnseignantEtat: l.elevesParEnseignantEtat,
        priorite: l.priorite,
        rang: i + 1,
        pourvu: false,
      })
    }
  })
  return postes
}
