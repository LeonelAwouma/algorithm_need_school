/**
 * Modèle de la simulation d'affectation (Moteur B). Le vocabulaire est
 * volontairement séparé du diagnostic (Moteur A) : ici on ne parle plus de
 * volumes observés mais de postes à couvrir, de vivier mobilisable et de
 * propositions — qui restent des simulations, jamais des décisions.
 */

import type { School, SchoolDiagnostic, TerritorialTotals, Teacher, Zone } from './education'
import type { FaitPrinceApplique } from './prince'

/** Périmètre géographique autorisé pour un mouvement (§5). */
export type GeographicScope = 'commune' | 'departement' | 'etendu'

/** Poids et seuils du barème individuel et du score de poste (logique historique conservée). */
export interface ScoringConfig {
  seuils: {
    anciennetePosteBonusAns: number
    ageAgeAns: number
    ageJeuneAns: number
  }
  poidsBaremeIndividuel: {
    ancienneteCarriere: number
    anciennetePoste: number
    situationFamiliale: number
    nbEnfants: number
    formationContinue: number
    ageAjuste: number
  }
  pointsSituationFamiliale: Record<string, number>
  poidsScorePoste: {
    baremeEnseignant: number
    proximite: number
    anciennetePoste: number
    situationFamiliale: number
    ageRegle: number
    zoneRegle: number
  }
  pointsProximite: {
    memeCommune: number
    memeDepartement: number
    memeRegion: number
    autre: number
  }
}

/** Phases d'affectation activables, héritées des règles DREB. */
export interface PhaseRules {
  phaseEffetPrince: boolean
  phase1Commune: boolean
  phase2Departement: boolean
  phase3JeunesVersMultigrades: boolean
  phase3AnciensRuralVersUrbain: boolean
  phase4Reste: boolean
  /** Donne la priorité aux postes situés en zone rurale à score équivalent. */
  prioriteZonesRurales: boolean
  /** Donne la priorité aux postes d'écoles à classes multigrades. */
  prioriteClassesMultigrades: boolean
  /** Ancienneté minimale au poste exigée pour être mobilisable (0 = pas de seuil). */
  anciennetePosteMinimaleAns: number
  /** Âge maximal au-delà duquel un enseignant n'est plus mobilisable (0 = pas de limite). */
  ageMaximalMobilisableAns: number
}

/** Règle de calcul du minimum d'enseignants à conserver dans une école source. */
export interface MinimumRetentionRule {
  mode: 'nbClasses' | 'ratioClasses' | 'valeurFixe'
  /** Utilisé quand `mode === 'ratioClasses'` : minimum = arrondi(ratio × classes). */
  ratio: number
  /** Utilisé quand `mode === 'valeurFixe'`. */
  valeurFixe: number
}

/** Référentiel « élèves par enseignant », configurable et jamais présenté comme officiel. */
export interface StudentRatioReference {
  /** Cible d'élèves par enseignant, `null` tant qu'elle n'est pas renseignée. */
  cible: number | null
  annee: string
  source: string
  commentaire: string
}

/**
 * Paramètres complets du produit : norme de besoin, règle de rétention,
 * référentiel élèves, seuils de sévérité, barème et phases. Une simulation en
 * conserve une copie figée, pour que ses résultats restent reproductibles.
 */
export interface EngineSettings {
  anneeScolaire: string
  /** Besoin normatif = nbClasses × enseignantsParClasse (1 par défaut). */
  normeEncadrement: { enseignantsParClasse: number }
  minimumAConserver: MinimumRetentionRule
  /** D'où viennent les postes à couvrir : besoin calculé, postes déclarés, ou le maximum des deux. */
  sourceDesPostes: 'besoinCalcule' | 'postesDeclares' | 'maximum'
  referentielEleves: StudentRatioReference
  /** Seuils de déficit relatif (déficit / besoin normatif) séparant les sévérités. */
  seuilsSeverite: { faible: number; important: number }
  scoring: ScoringConfig
  phases: PhaseRules
}

/** Un poste à couvrir, dérivé du besoin d'un établissement. */
export interface TeachingPost {
  id: string
  schoolId: string
  nomEtab: string
  region: string
  departement: string
  commune: string
  zone: Zone
  typeEtab: string
  classesMultigrades: number
  prioriteLocale: number
  /** Déficit total de l'école dont ce poste est issu, pour le tri. */
  deficitEcole: number
  elevesParEnseignantEtat: number | null
  pourvu: boolean
}

/** Un enseignant retenu dans le vivier réellement mobilisable. */
export interface PoolTeacher {
  teacher: Teacher
  /** Barème individuel calculé avec la configuration de la simulation. */
  bareme: number
  /** École d'origine, avec son excédent au moment de la constitution du vivier. */
  ecoleOrigine: { id: string; nom: string; excedentMobilisable: number }
  /** Rang de l'enseignant dans son école (1 = premier candidat au départ). */
  rangDansEcole: number
  affecte: boolean
}

/** Vivier réellement redéployable, avec la trace de sa construction. */
export interface RedeploymentPool {
  teachers: PoolTeacher[]
  /** Écoles disposant d'un excédent mobilisable, et le plafond de départs associé. */
  ecolesSources: {
    schoolId: string
    nomEtab: string
    region: string
    departement: string
    commune: string
    excedentMobilisable: number
    candidatsRetenus: number
  }[]
  /** Enseignants écartés du vivier, avec le motif exact. */
  exclusions: { code: string; label: string; count: number }[]
  /** Total des excédents mobilisables, avant toute contrainte géographique. */
  excedentTotal: number
}

/** Une composante du score, affichée telle quelle dans « Pourquoi cette proposition ? ». */
export interface ScoreComponent {
  label: string
  valeur: number
  poids: number
  contribution: number
}

/** Détail complet d'un score, pour rendre l'algorithme explicable (§15). */
export interface ScoreBreakdown {
  total: number
  components: ScoreComponent[]
}

/** Niveau de proximité effectivement franchi par un mouvement. */
export type ProximityLevel = 'meme_commune' | 'meme_departement' | 'meme_region' | 'hors_region'

/** Une proposition d'affectation issue de la simulation. */
export interface ProposedAssignment {
  phase: string
  postId: string
  teacherId: string
  nomEns: string
  prenomEns: string

  schoolOrigineId: string
  nomEtabOrigine: string
  communeOrigine: string
  departementOrigine: string
  regionOrigine: string

  schoolDestinationId: string
  nomEtabDestination: string
  communeDestination: string
  departementDestination: string
  regionDestination: string

  niveauProximite: ProximityLevel
  bareme: number
  score: number
  breakdown: ScoreBreakdown
}

/** Photographie d'une situation, avant ou après simulation. */
export interface SituationSnapshot {
  ecolesEnDeficit: number
  postesVacants: number
  deficitTotal: number
  /** Déficit restant par région, trié par volume décroissant. */
  parRegion: { region: string; deficit: number }[]
  /** Moyenne des élèves par enseignant État, `null` sans données élèves. */
  pressionMoyenne: number | null
}

/** Vérification d'un invariant métier après simulation (§14). */
export interface InvariantCheck {
  code: string
  label: string
  ok: boolean
  detail: string
}

/** Entrée du journal de simulation, consultable en Vue analyste. */
export interface SimulationLogEntry {
  etape: string
  message: string
  valeur: number | null
}

/** Un scénario : un périmètre géographique et un jeu de paramètres figés. */
export interface SimulationScenario {
  id: string
  nom: string
  description: string
  scope: GeographicScope
  settings: EngineSettings
  createdAt: string
  /** `true` pour les scénarios prédéfinis, qui ne sont pas supprimables. */
  predefini: boolean
}

/** Résultat complet d'une simulation. */
export interface SimulationResult {
  scenarioId: string
  scenarioNom: string
  scope: GeographicScope

  besoinInitial: number
  postesCouverts: number
  besoinResiduel: number
  enseignantsDeplaces: number
  ecolesBeneficiaires: number
  ecolesSources: number
  tauxCouverture: number
  /** Répartition des mouvements par périmètre administratif franchi. */
  mouvementsParPerimetre: { niveau: ProximityLevel; nombre: number }[]

  assignments: ProposedAssignment[]
  unmatchedTeachers: PoolTeacher[]
  uncoveredPosts: TeachingPost[]
  pool: RedeploymentPool

  before: SituationSnapshot
  after: SituationSnapshot

  /**
   * Décisions de la DRH (fait de Prince) prises en compte avant le calcul. Elles
   * ne sont pas des propositions : leurs enseignants sont exclus du vivier et les
   * effectifs des écoles concernées les intègrent déjà.
   */
  faitsPrince: FaitPrinceApplique[]

  invariants: InvariantCheck[]
  logs: SimulationLogEntry[]
  computedAt: string
}

/** Jeu de données importé, entièrement traité localement. */
export interface Dataset {
  schools: School[]
  teachers: Teacher[]
  /** `true` pour le jeu de démonstration embarqué, jamais présenté comme officiel. */
  demonstration: boolean
  importedAt: string
  sourceFiles: { etablissements: string | null; enseignants: string | null }
}

export type TeacherNeedIndex = Record<string, number>
export type TeacherSurplusIndex = Record<string, number>

/** Sortie du Moteur A : diagnostic école par école et totaux nationaux. */
export interface DiagnosticResult {
  settings: EngineSettings
  schools: SchoolDiagnostic[]
  bySchoolId: Record<string, SchoolDiagnostic>
  besoins: TeacherNeedIndex
  excedents: TeacherSurplusIndex
  totals: TerritorialTotals
  donneesElevesDisponibles: boolean
}

export interface DecisionReportSection {
  titre: string
  /** Paragraphes de texte, tous construits à partir de valeurs calculées. */
  paragraphes: string[]
  /** Tableau optionnel accompagnant la section. */
  tableau?: { entetes: string[]; lignes: (string | number)[][] }
  /** Liste à puces optionnelle. */
  points?: string[]
}

/** Rapport décisionnel assemblé à partir des résultats calculés (§19). */
export interface DecisionReport {
  genereLe: string
  anneeScolaire: string
  perimetre: string
  sections: DecisionReportSection[]
}
