/**
 * Algorithme d'appariement : l'acceptation différée de Gale et Shapley (§3.4).
 *
 * Déroulement, tour par tour :
 *   1. chaque candidat libre demande l'école suivante de sa liste ;
 *   2. chaque école examine toutes les demandes reçues, y compris celles des
 *      candidats qu'elle retient déjà, garde provisoirement les mieux classés dans
 *      la limite de ses postes ouverts et refuse les autres ;
 *   3. le calcul s'arrête lorsqu'aucun candidat refusé n'a plus de vœu.
 *
 * Une acceptation reste provisoire jusqu'à la fin : un candidat retenu peut être
 * remplacé par un mieux classé arrivé plus tard. Le résultat ne dépend pas de
 * l'ordre de saisie des dossiers, et chaque refus s'explique par un candidat
 * mieux classé.
 */

import type { TourAppariement } from '../../types/simulation'

export interface ParticipantAppariement {
  id: string
  /** Écoles demandées, dans l'ordre d'examen retenu. */
  liste: string[]
}

export interface ResultatAppariement {
  /** Candidat → école obtenue. */
  affectations: Map<string, string>
  tours: TourAppariement[]
  tronque: boolean
}

/**
 * @param capacites    postes ouverts par école
 * @param comparer     classement d'une école entre deux candidats (négatif : `a` avant `b`)
 * @param maxTours     nombre de tours conservés pour la traçabilité
 */
export function accepterDiffere(
  participants: ParticipantAppariement[],
  capacites: Map<string, number>,
  comparer: (schoolId: string, a: string, b: string) => number,
  niveau: string,
  maxTours = 60,
): ResultatAppariement {
  const prochainVoeu = new Map<string, number>(participants.map(p => [p.id, 0]))
  const listes = new Map(participants.map(p => [p.id, p.liste]))
  const gardes = new Map<string, string[]>()
  const affectation = new Map<string, string>()
  const tours: TourAppariement[] = []
  let tronque = false

  let libres = participants.map(p => p.id)
  let tour = 0

  while (true) {
    const demandes: { teacherId: string; schoolId: string }[] = []
    for (const id of libres) {
      const liste = listes.get(id) ?? []
      const i = prochainVoeu.get(id) ?? 0
      if (i >= liste.length) continue
      prochainVoeu.set(id, i + 1)
      demandes.push({ teacherId: id, schoolId: liste[i] })
    }
    if (demandes.length === 0) break
    tour++

    const parEcole = new Map<string, string[]>()
    for (const d of demandes) {
      const liste = parEcole.get(d.schoolId) ?? []
      liste.push(d.teacherId)
      parEcole.set(d.schoolId, liste)
    }

    const refuses: string[] = []
    for (const [schoolId, nouveaux] of parEcole) {
      const examines = [...(gardes.get(schoolId) ?? []), ...nouveaux]
      examines.sort((a, b) => comparer(schoolId, a, b))
      const capacite = Math.max(0, capacites.get(schoolId) ?? 0)
      const retenus = examines.slice(0, capacite)
      for (const id of examines.slice(capacite)) {
        if (affectation.get(id) === schoolId) affectation.delete(id)
        refuses.push(id)
      }
      for (const id of retenus) affectation.set(id, schoolId)
      gardes.set(schoolId, retenus)
    }

    if (tours.length < maxTours) {
      tours.push({
        niveau,
        tour,
        demandes,
        gardes: [...parEcole.keys()].map(schoolId => ({ schoolId, teacherIds: [...(gardes.get(schoolId) ?? [])] })),
        refuses,
      })
    } else {
      tronque = true
    }

    libres = refuses
  }

  return { affectations: affectation, tours, tronque }
}
