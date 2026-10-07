/** Libellés affichés des notions du référentiel, partagés par les pages, le rapport et les exports. */

import type { ClassementEcole, MotifDemande, ZoneSecurite } from '../../types/education'
import type { IssueCandidature, NatureMouvement, StatutProposition, StatutVoeu } from '../../types/simulation'

export const LIBELLE_ZONE_SECURITE: Record<ZoneSecurite, string> = {
  verte: 'Zone verte',
  jaune: 'Zone jaune',
  rouge: 'Zone rouge',
}

export const ZONES_SECURITE: ZoneSecurite[] = ['verte', 'jaune', 'rouge']

/** Rang de tri d'une zone de sécurité : 1 verte, 2 jaune, 3 rouge (non renseignée = verte). */
export function rangZoneSecurite(zone: ZoneSecurite | null): number {
  return zone === 'rouge' ? 3 : zone === 'jaune' ? 2 : 1
}

/**
 * Libellé de la zone de sécurité d'une école. Sans zone renseignée, le calcul la
 * compte en zone verte (aucun point de sécurité) : le libellé le dit.
 */
export function libelleZoneSecurite(zone: ZoneSecurite | null): string {
  return zone ? LIBELLE_ZONE_SECURITE[zone] : 'Zone verte (non renseignée)'
}

export const LIBELLE_CLASSEMENT: Record<ClassementEcole, string> = {
  necessiteuse: 'Nécessiteuse',
  excedentaire: 'Excédentaire',
  a_examiner: 'À examiner',
  equilibree: 'Équilibrée',
}

export const LIBELLE_NATURE: Record<NatureMouvement, string> = {
  voeu: 'Vœu satisfait',
  hors_voeux: 'Proposition hors vœux',
  obligatoire: 'Redéploiement obligatoire',
  arbitrage: 'Décision de commission',
}

export const LIBELLE_STATUT_PROPOSITION: Record<StatutProposition, string> = {
  propose: 'Proposé',
  valide: 'Validé',
  arbitre: 'Arbitré',
  rejete: 'Rejeté',
}

export const LIBELLE_ISSUE: Record<IssueCandidature, string> = {
  affecte_voeu: 'Vœu satisfait',
  hors_voeux: 'Proposition hors vœux',
  projete_n2: 'Possibilité en N+2',
  sans_solution: 'Aucune solution prévisible',
  irrecevable: 'Non recevable',
  depart_non_valide: 'Départ non validé',
  arbitrage: 'Décision de commission',
}

export const LIBELLE_STATUT_VOEU: Record<StatutVoeu, string> = {
  examine: 'examiné',
  autre_sous_systeme: 'autre sous-système (commission)',
  hors_referentiel: 'école inconnue',
  hors_perimetre: 'hors du périmètre du scénario',
  au_dela_du_maximum: 'au-delà du nombre de vœux autorisé',
  meme_ecole: "école d'attache",
}

export const LIBELLE_MOTIF: Record<MotifDemande, string> = {
  convenance: 'Convenance personnelle',
  sante: 'Santé',
  regroupement_familial: 'Regroupement familial',
  rotation_zone_difficile: 'Rotation après service en zone difficile',
  autre: 'Autre',
}
