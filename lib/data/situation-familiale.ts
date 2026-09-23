/**
 * Rapprochement des situations matrimoniales déclarées.
 *
 * Le barème attribue des points à la situation familiale, mais les fichiers
 * réels ne l'écrivent jamais de la même façon : « Marié », « Mariée »,
 * « MARIE(E) », « Célibataire », « Veuve »… Sans ce rapprochement, seules les
 * graphies exactement identiques aux clés du barème étaient reconnues et toutes
 * les autres valaient zéro point, sans que rien ne le signale.
 *
 * Le principe est celui déjà appliqué aux noms de régions et aux en-têtes de
 * colonnes : normalisation (accents, ponctuation, casse), puis table d'alias
 * locale. Aucun service externe n'est appelé.
 */

import { normalizeKey } from './normalize'

/** Clés canoniques du barème. Ce sont celles stockées dans la configuration. */
export const SITUATIONS_CONNUES = ['celibataire', 'marie', 'divorce', 'veuf', 'separe', 'concubinage'] as const

export type SituationFamiliale = (typeof SITUATIONS_CONNUES)[number]

/** Libellé affiché à l'utilisateur pour chaque clé. */
export const LIBELLE_SITUATION: Record<string, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf / Veuve',
  separe: 'Séparé(e)',
  concubinage: 'Union libre / concubinage',
}

/**
 * Graphies acceptées, sous leur forme normalisée (sans accent ni ponctuation).
 * Le masculin, le féminin, les formes « (e) » et les abréviations courantes des
 * fichiers de personnel y figurent.
 */
const ALIAS: Record<string, SituationFamiliale> = {
  // Célibataire
  celibataire: 'celibataire', celibataires: 'celibataire', celib: 'celibataire', celibatairee: 'celibataire',
  single: 'celibataire', c: 'celibataire', cel: 'celibataire',
  // Marié(e)
  marie: 'marie', mariee: 'marie', maries: 'marie', mariees: 'marie', mariee1: 'marie',
  epoux: 'marie', epouse: 'marie', married: 'marie', m: 'marie', mar: 'marie',
  // Divorcé(e)
  divorce: 'divorce', divorcee: 'divorce', divorces: 'divorce', divorcees: 'divorce', divorced: 'divorce', div: 'divorce',
  // Veuf / veuve
  veuf: 'veuf', veuve: 'veuf', veufs: 'veuf', veuves: 'veuf', widow: 'veuf', widowed: 'veuf', v: 'veuf',
  // Séparé(e)
  separe: 'separe', separee: 'separe', separes: 'separe', separees: 'separe', separated: 'separe',
  // Union libre
  concubinage: 'concubinage', concubin: 'concubinage', concubine: 'concubinage',
  unionlibre: 'concubinage', uniondefait: 'concubinage', pacse: 'concubinage', pacsee: 'concubinage',
}

/**
 * Rattache un libellé à l'une des situations connues.
 * Renvoie `null` quand la valeur est vide ou n'est reconnue par aucun alias :
 * l'appelant doit alors traiter le cas explicitement plutôt que de supposer zéro.
 */
export function normaliserSituation(valeur: unknown): SituationFamiliale | null {
  const cle = normalizeKey(valeur)
  if (!cle) return null
  return ALIAS[cle] ?? null
}

/** Libellé lisible d'une valeur déclarée, la valeur brute si elle n'est pas reconnue. */
export function libelleSituation(valeur: string): string {
  const cle = normaliserSituation(valeur)
  if (cle) return LIBELLE_SITUATION[cle]
  return valeur.trim() || 'Non renseignée'
}

/**
 * Situations déclarées dans un jeu de données, avec leur effectif, la clé du
 * barème à laquelle elles se rattachent, et les valeurs non reconnues.
 * Sert à montrer ce qui compte réellement dans le calcul, et ce qui vaut zéro.
 */
export function inventaireSituations(valeurs: string[]): {
  reconnues: { cle: SituationFamiliale; libelle: string; effectif: number; graphies: string[] }[]
  nonReconnues: { valeur: string; effectif: number }[]
  nonRenseignees: number
} {
  const parCle = new Map<SituationFamiliale, { effectif: number; graphies: Set<string> }>()
  const inconnues = new Map<string, number>()
  let nonRenseignees = 0

  for (const brut of valeurs) {
    const texte = (brut ?? '').trim()
    if (!texte) {
      nonRenseignees++
      continue
    }
    const cle = normaliserSituation(texte)
    if (cle) {
      const courant = parCle.get(cle) ?? { effectif: 0, graphies: new Set<string>() }
      courant.effectif++
      courant.graphies.add(texte)
      parCle.set(cle, courant)
    } else {
      inconnues.set(texte, (inconnues.get(texte) ?? 0) + 1)
    }
  }

  return {
    reconnues: [...parCle.entries()]
      .map(([cle, v]) => ({ cle, libelle: LIBELLE_SITUATION[cle], effectif: v.effectif, graphies: [...v.graphies].sort() }))
      .sort((a, b) => b.effectif - a.effectif),
    nonReconnues: [...inconnues.entries()]
      .map(([valeur, effectif]) => ({ valeur, effectif }))
      .sort((a, b) => b.effectif - a.effectif || a.valeur.localeCompare(b.valeur, 'fr')),
    nonRenseignees,
  }
}
