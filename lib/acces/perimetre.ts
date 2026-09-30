/**
 * Périmètre d'un délégué régional.
 *
 * Un délégué ne travaille que sur sa région. La restriction est appliquée à la
 * source, sur le jeu de données lui-même, avant tout calcul : diagnostic,
 * simulations, carte, rapports et exports n'ont donc jamais connaissance des
 * autres régions. Filtrer seulement l'affichage laisserait les données des
 * autres régions atteignables par un export ou une recherche.
 */

import type { Dataset } from '../../types/simulation'
import { cleTerritoire, normaliserRegion, type RegionCameroun } from '../geography/cameroon'

/** Vrai si un libellé de région du fichier désigne la région donnée (« Far North » = « Extrême-Nord »). */
export function estDansRegion(libelle: string, region: RegionCameroun): boolean {
  const reconnue = normaliserRegion(libelle)
  if (reconnue) return reconnue === region
  return cleTerritoire(libelle) === cleTerritoire(region)
}

/**
 * Réduit un jeu de données aux établissements d'une région et aux enseignants
 * qui y sont rattachés. Le jeu d'origine n'est pas modifié.
 */
export function restreindreARegion(dataset: Dataset, region: RegionCameroun): Dataset {
  const schools = dataset.schools.filter(s => estDansRegion(s.region, region))
  const gardees = new Set(schools.map(s => s.id))
  return {
    ...dataset,
    schools,
    teachers: dataset.teachers.filter(t => gardees.has(t.idEtabAttache)),
  }
}
