/**
 * Persistance locale des préférences.
 *
 * Seules des préférences d'interface non sensibles sont conservées (mode
 * d'affichage, dernier onglet, paramètres du moteur). Aucune donnée
 * d'établissement, d'enseignant ou d'élève n'est écrite sur le disque : elles
 * restent en mémoire pour la durée de la session et disparaissent à la
 * fermeture, ou immédiatement via « Effacer les données de cette session ».
 */

const PREFIXE = 'algobaba.'

/** Clés autorisées : la liste est fermée, pour éviter tout stockage accidentel. */
export type ClePreference = 'vue' | 'page' | 'parametres' | 'referentielEleves'

function disponible(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function lirePreference<T>(cle: ClePreference, defaut: T): T {
  if (!disponible()) return defaut
  try {
    const brut = window.localStorage.getItem(PREFIXE + cle)
    if (brut == null) return defaut
    return JSON.parse(brut) as T
  } catch {
    return defaut
  }
}

export function ecrirePreference(cle: ClePreference, valeur: unknown): void {
  if (!disponible()) return
  try {
    window.localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur))
  } catch {
    // Mode privé ou stockage plein : l'application continue sans persistance.
  }
}

/**
 * Supprime toutes les préférences enregistrées par l'application.
 * Les données métier, qui ne sont jamais écrites, n'ont pas à être effacées
 * ici : elles sont libérées par la réinitialisation de l'état React.
 */
export function effacerPreferences(): void {
  if (!disponible()) return
  try {
    const aSupprimer: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const cle = window.localStorage.key(i)
      if (cle && cle.startsWith(PREFIXE)) aSupprimer.push(cle)
    }
    for (const cle of aSupprimer) window.localStorage.removeItem(cle)
  } catch {
    // Rien à faire : l'effacement de l'état en mémoire reste effectif.
  }
}
