/**
 * Outils communs aux gestionnaires des données factices.
 */

import { PREFIXE_API } from '../../components/shared/api'

import { entreesDe } from '../catalogue'
import { etat } from '../etat'

/** Motif MSW d'un chemin d'API, quelle que soit l'origine du serveur. */
export function api(chemin: string): string {
  return `*${PREFIXE_API}/${chemin}`
}

/** Chemin d'API d'une URL interceptée, encodé comme dans le catalogue, sans préfixe ni chaîne de requête. */
export function cheminDe(url: URL): string {
  const debut = url.pathname.indexOf(`${PREFIXE_API}/`)
  return url.pathname.slice(debut + PREFIXE_API.length + 1)
}

/** Vrai si l'identifiant désigne le jeu ouvert (et non supprimé) des données factices. */
export function jeuConnu(jeu: unknown): boolean {
  const e = etat()
  return !e.jeuSupprime && String(jeu) === e.jeu.id
}

/** Réponse sans paramètre enregistrée pour un chemin, pour composer une réponse. */
export async function lireCatalogue<T>(chemin: string): Promise<T | null> {
  const entrees = await entreesDe(chemin)
  const entree = entrees?.find(e => Object.keys(e.query).length === 0)
  return entree ? (entree.reponse as T) : null
}

/** Corps JSON d'une requête, typé par le contrat de la route. */
export async function corps<T>(requete: Request): Promise<T> {
  return (await requete.json()) as T
}

/** Paramètre de chemin, décodé. */
export function parametre(valeur: string | readonly string[] | undefined): string {
  return Array.isArray(valeur) ? String(valeur[0]) : String(valeur ?? '')
}
