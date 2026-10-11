/**
 * Contrat de l'API — contexte « Diagnostic » (Moteur A) : diagnostic filtré,
 * arbre territorial, priorités et synthèse narrative.
 */

import type { Enonce, PointAttention, TerritorySelection } from './commun'
import type { SchoolDiagnostic, TerritorialSummary, TerritorialTotals, TerritoryLevel, Zone } from './education'
import type { SyntheseTerritoriale } from './simulation'

/** Diagnostic du périmètre filtré (`GET jeux/{jeu}/diagnostic/`). */
export interface DiagnosticPerimetre {
  totals: TerritorialTotals
  ecoles: SchoolDiagnostic[]
  /** Nombre d'écoles du jeu, tous filtres levés : sert à savoir si un filtre est actif. */
  ecolesDuJeu: number
  donneesElevesDisponibles: boolean
  /** Écoles dont le besoin a été calculé sans effectif d'élèves. */
  ecolesEnRepli: number
  /** Écoles sans salles renseignées : BMAX inconnu. */
  ecolesSansSalles: number
}

/** Nœud courant de l'arbre territorial et son contexte (`GET jeux/{jeu}/territoires/`). */
export interface VueTerritoriale {
  niveau: TerritoryLevel
  /** Libellé de la sélection : « Cameroun », une région, un département ou une commune. */
  perimetre: string
  noeud: TerritorialSummary
  /** Enfants directs du nœud courant. */
  enfants: TerritorialSummary[]
  filAriane: { label: string; selection: TerritorySelection }[]
  /** Arbre complet, filtres non territoriaux appliqués : sert à la carte. */
  arbre: TerritorialSummary
}

/** Options des menus de filtres, selon le niveau territorial déjà choisi. */
export interface OptionsFiltres {
  regions: string[]
  departements: string[]
  communes: string[]
  typesEtab: string[]
  zones: Zone[]
}

/** Établissements classés par priorité. */
export interface Priorites {
  ecoles: SchoolDiagnostic[]
  total: number
}

/** Synthèse du tableau de bord et du diagnostic (`GET jeux/{jeu}/synthese/`). */
export interface SyntheseDiagnostic {
  perimetre: string
  totals: TerritorialTotals
  /** Phrases du tableau de bord. */
  syntheseTableauDeBord: Enonce[]
  /** Phrases du diagnostic territorial. */
  diagnosticTerritorial: Enonce[]
  pointsAttention: PointAttention[]
  /**
   * Enfants du périmètre où coexistent déficits et excédents : un redéploiement
   * interne y est possible sans mouvement longue distance.
   */
  territoiresMixtes: TerritorialSummary[]
  /** Agrégats par sous-système (§2.6). */
  syntheseTerritoriale: SyntheseTerritoriale
  /** Répartition des écoles et des besoins par zone. */
  parZone: { zone: Zone; ecoles: number; besoin: number; excedent: number }[]
  /** Répartition par région. */
  parRegion: { region: string; ecoles: number; besoin: number; excedent: number; ecolesEnDeficit: number }[]
}
