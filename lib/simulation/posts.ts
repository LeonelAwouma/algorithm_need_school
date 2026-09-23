/**
 * Construction des postes à couvrir.
 *
 * Un poste est une unité de besoin : il provient du besoin calculé école par
 * école (Moteur A), et non plus directement de la colonne `nb_postes_ouverts`.
 * Cette colonne reste disponible et peut redevenir la source des postes via le
 * paramètre `sourceDesPostes`, sans jamais être écrasée dans les données.
 */

import type { SchoolDiagnostic } from '../../types/education'
import type { EngineSettings, TeachingPost } from '../../types/simulation'

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

/**
 * Crée un poste par unité de besoin. Les postes sont ordonnés par déficit
 * décroissant puis par priorité locale, pour que les établissements les plus en
 * difficulté soient servis en premier à score équivalent.
 */
export function construirePostes(diagnostics: SchoolDiagnostic[], settings: EngineSettings): TeachingPost[] {
  const postes: TeachingPost[] = []

  const ordonnes = [...diagnostics].sort((a, b) => {
    const da = nombreDePostes(a, settings)
    const db = nombreDePostes(b, settings)
    if (db !== da) return db - da
    const pa = a.school.prioriteLocale > 0 ? a.school.prioriteLocale : 999
    const pb = b.school.prioriteLocale > 0 ? b.school.prioriteLocale : 999
    return pa - pb
  })

  for (const d of ordonnes) {
    const total = nombreDePostes(d, settings)
    for (let k = 0; k < total; k++) {
      postes.push({
        id: `${d.school.id}::P${k + 1}`,
        schoolId: d.school.id,
        nomEtab: d.school.nom,
        region: d.school.region,
        departement: d.school.departement,
        commune: d.school.commune,
        zone: d.school.zone,
        typeEtab: d.school.typeEtab,
        classesMultigrades: d.school.classesMultigrades,
        prioriteLocale: d.school.prioriteLocale,
        deficitEcole: total,
        elevesParEnseignantEtat: d.elevesParEnseignantEtat,
        pourvu: false,
      })
    }
  }

  return postes
}
