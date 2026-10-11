/**
 * Rapprochement d'une saisie libre avec un élément d'une liste.
 *
 * L'utilisateur tape un nom, pas un identifiant : « Hamadou Joseph », « EP Douala
 * V Centre », parfois un matricule ou un code d'établissement. On accepte, dans
 * cet ordre : l'identifiant exact, le libellé exact (accents, casse et
 * ponctuation ignorés), puis le libellé qui contient la saisie.
 *
 * Quand plusieurs éléments conviennent — deux enseignants homonymes, par
 * exemple — rien n'est désigné d'office : les candidats sont renvoyés pour que
 * l'utilisateur tranche. Sur une décision de redéploiement, désigner le mauvais
 * enseignant serait pire que demander une précision.
 *
 * La comparaison est entièrement locale.
 */

import { normalizeKey, normalizeLabel } from './normalize'

export interface ResultatRapprochement<T> {
  /** L'élément désigné sans ambiguïté, `null` s'il faut préciser ou choisir. */
  trouve: T | null
  /** Les éléments qui conviennent aussi bien : à départager par l'utilisateur. */
  candidats: T[]
}

export function rapprocherSaisie<T>(
  saisie: string,
  elements: T[],
  identifiant: (e: T) => string,
  libelles: (e: T) => string[],
): ResultatRapprochement<T> {
  const vide: ResultatRapprochement<T> = { trouve: null, candidats: [] }
  const brut = saisie.trim()
  if (!brut) return vide

  // 1 — l'identifiant est sans ambiguïté possible : il prime.
  const cleSaisie = normalizeKey(brut)
  if (cleSaisie) {
    const parId = elements.find(e => normalizeKey(identifiant(e)) === cleSaisie)
    if (parId) return { trouve: parId, candidats: [] }
  }

  const cible = normalizeLabel(brut)
  if (!cible) return vide

  // 2 — libellé exact : un seul élément le porte, ou bien il faut départager.
  const exacts = elements.filter(e => libelles(e).some(l => normalizeLabel(l) === cible))
  if (exacts.length === 1) return { trouve: exacts[0], candidats: [] }
  if (exacts.length > 1) return { trouve: null, candidats: exacts }

  // 3 — libellé partiel, en dernier recours.
  const contient = elements.filter(e => libelles(e).some(l => normalizeLabel(l).includes(cible)))
  if (contient.length === 1) return { trouve: contient[0], candidats: [] }
  return { trouve: null, candidats: contient }
}
