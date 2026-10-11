/**
 * Outils du serveur de référence : conversion en JSON typée et catalogue des
 * réponses enregistrées, au format des données factices du frontend
 * (frontend/src/mocks/format.ts).
 */

import type { EntreeCatalogue, FichierCatalogue, Query } from '../../../frontend/src/mocks/format'

export type { Query }

/** Type d'une valeur après un aller-retour JSON : les dates deviennent des chaînes ISO. */
export type Jsonifie<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Jsonifie<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonifie<T[K]> }
      : T

/**
 * Sérialise une valeur du moteur comme le ferait l'API. Le type de retour
 * permet de vérifier, à la compilation, qu'elle est conforme au contrat.
 */
export function json<T>(valeur: T): Jsonifie<T> {
  return JSON.parse(JSON.stringify(valeur)) as Jsonifie<T>
}

/** Ôte les paramètres absents et convertit les autres en chaînes, comme le client HTTP. */
export function nettoyerQuery(query: Record<string, string | number | boolean | null | undefined>): Query {
  const propre: Query = {}
  for (const [cle, valeur] of Object.entries(query)) {
    if (valeur === null || valeur === undefined || valeur === '') continue
    propre[cle] = String(valeur)
  }
  return propre
}

/** Catalogue en cours de construction, réparti en familles (un fichier JSON par famille). */
export class Catalogue {
  private readonly familles = new Map<string, FichierCatalogue>()

  /**
   * Enregistre la réponse d'une lecture.
   *
   * @param famille  fichier de destination (« donnees », « simulation »…)
   * @param chemin   chemin concret, par exemple `jeux/demonstration/synthese/`
   * @param query    paramètres de requête qui produisent cette réponse
   * @param reponse  corps de la réponse, déjà conforme au contrat
   */
  ajouter<T>(famille: string, chemin: string, query: Query, reponse: T): void {
    this.entrees(famille, chemin).push({ query, reponse })
  }

  /** Enregistre une liste complète, que les données factices pagineront. */
  ajouterListe<T>(famille: string, chemin: string, query: Query, elements: T[]): void {
    this.entrees(famille, chemin).push({ query, reponse: elements, liste: true })
  }

  /** Familles et leur contenu, pour l'écriture des fichiers. */
  contenu(): [string, FichierCatalogue][] {
    return [...this.familles.entries()]
  }

  private entrees(famille: string, chemin: string): EntreeCatalogue[] {
    let fichier = this.familles.get(famille)
    if (!fichier) {
      fichier = {}
      this.familles.set(famille, fichier)
    }
    fichier[chemin] ??= []
    return fichier[chemin]
  }
}
