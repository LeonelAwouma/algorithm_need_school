/**
 * Pagination des listes renvoyées par l'API.
 *
 * Les listes potentiellement longues (établissements, enseignants, affectations,
 * journal d'audit…) sont servies par pages. Le serveur renvoie la page demandée
 * et le total, pour que l'interface affiche la navigation sans tout charger.
 */

import type { ParametresRequete } from './client'

/** Une page de résultats. */
export interface Page<T> {
  elements: T[]
  /** Nombre total d'éléments correspondant aux filtres. */
  total: number
  /** Numéro de la page, à partir de 1. */
  page: number
  /** Nombre d'éléments par page. */
  taille: number
}

/** Demande de page et de tri. */
export interface DemandePage {
  page?: number
  taille?: number
  /** Champ de tri ; préfixé de `-` pour un ordre décroissant (`-besoin`). */
  tri?: string
}

/** Taille de page par défaut des tableaux de l'interface. */
export const TAILLE_PAGE_DEFAUT = 50

/** Paramètres de requête d'une demande de page. */
export function queryPage(demande: DemandePage = {}): ParametresRequete {
  return { page: demande.page ?? 1, taille: demande.taille ?? TAILLE_PAGE_DEFAUT, tri: demande.tri }
}

/** Nombre de pages d'un résultat paginé (au moins une, même vide). */
export function nombreDePages(page: Page<unknown>): number {
  return Math.max(1, Math.ceil(page.total / Math.max(1, page.taille)))
}
