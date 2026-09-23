/**
 * Modèle métier « éducation » : territoires, établissements, enseignants et
 * diagnostic de ressources. Ces types sont indépendants de React et du
 * navigateur ; ils sont partagés par le moteur de diagnostic (Moteur A), le
 * moteur de simulation (Moteur B), les agrégations territoriales et l'UI.
 */

/** Zone déclarée de l'établissement ou de rattachement de l'enseignant. */
export type Zone = 'urbaine' | 'semi_urbaine' | 'rurale' | 'inconnue'

/** Niveaux de la hiérarchie géographique : Cameroun → Région → Département → Commune → École. */
export type TerritoryLevel = 'national' | 'region' | 'departement' | 'commune' | 'ecole'

/** Les six niveaux du cycle primaire camerounais, dans l'ordre pédagogique. */
export const NIVEAUX_PRIMAIRE = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'] as const
export type NiveauPrimaire = (typeof NIVEAUX_PRIMAIRE)[number]

/**
 * Sévérité de la situation d'un établissement. Les seuils qui séparent
 * « faible », « important » et « critique » sont configurables
 * (voir EngineSettings.seuilsSeverite) et documentés dans la Méthodologie.
 */
export type SchoolSeverity =
  | 'excedent'
  | 'satisfaisant'
  | 'deficit_faible'
  | 'deficit_important'
  | 'deficit_critique'

/** Un nœud de la hiérarchie géographique, identifié par son chemin complet. */
export interface EducationTerritory {
  /** Chemin unique, ex. « Centre/Mfoundi/Yaoundé VII ». Vide pour le niveau national. */
  code: string
  level: TerritoryLevel
  nom: string
  region: string | null
  departement: string | null
  commune: string | null
  /** Code du territoire parent, `null` au niveau national. */
  parentCode: string | null
}

/**
 * Un établissement tel qu'il ressort du fichier importé, après normalisation.
 * Les champs « élèves » restent optionnels : les anciens fichiers, qui ne les
 * contiennent pas, doivent continuer à fonctionner (§26 du cahier des charges).
 */
export interface School {
  id: string
  nom: string
  region: string
  departement: string
  commune: string
  zone: Zone
  /** Zone telle qu'écrite dans le fichier, conservée pour l'affichage. */
  zoneBrute: string
  typeEtab: string

  nbClasses: number
  nbSallesClasse: number | null
  nbEnseignantsEtat: number
  nbAutresEnseignants: number | null

  /**
   * Postes officiellement déclarés dans le fichier (`nb_postes_ouverts`).
   * `null` quand la colonne est absente : cette donnée n'est jamais écrasée
   * par le besoin calculé, les deux sont affichés séparément.
   */
  nbPostesOuvertsDeclares: number | null

  classesMultigrades: number
  prioriteLocale: number

  effectifTotalEleves: number | null
  effectifFilles: number | null
  effectifGarcons: number | null
  effectifParNiveau: Partial<Record<NiveauPrimaire, number>>

  /** Index de la ligne source dans le classeur (1 = première ligne de données). */
  ligneSource: number
}

/** Un enseignant tel qu'il ressort du fichier importé, après normalisation. */
export interface Teacher {
  id: string
  nom: string
  prenom: string
  dateNaissance: Date | null
  age: number | null

  idEtabAttache: string
  communeAttache: string
  departementAttache: string
  regionAttache: string
  zoneAttache: Zone

  ancienneteCarriereAns: number
  anciennetePosteAns: number
  situationFamiliale: string
  nbEnfants: number
  formationContinue: number

  statut: string
  payeParEtat: boolean

  /**
   * Renseigné quand l'enseignant a été redéployé par fait de Prince (décision
   * de la DRH). Il est alors rattaché à sa nouvelle école et exclu du vivier :
   * l'algorithme ne le remet jamais en mouvement.
   */
  faitPrinceId?: string

  ligneSource: number
}

/** Raison factuelle expliquant la position d'une école dans les priorités (§9). */
export interface DiagnosticReason {
  code:
    | 'deficit'
    | 'pression_eleves'
    | 'classes_multigrades'
    | 'priorite_locale'
    | 'effectif_eleve'
    | 'ecart_postes_declares'
  /** Phrase prête à afficher, construite uniquement à partir des données calculées. */
  texte: string
}

/**
 * Diagnostic de ressources d'un établissement (Moteur A). Ne contient aucune
 * proposition d'affectation : uniquement des volumes observés et calculés.
 */
export interface SchoolDiagnostic {
  school: School

  nbClasses: number
  enseignantsEtat: number

  /** Seuil sous lequel l'école ne doit jamais descendre (règle configurable). */
  enseignantsMinimumAConserver: number
  /** max(0, besoinNormatif − enseignantsEtat). */
  besoinTheorique: number
  /** Postes déclarés dans le fichier, `null` si la colonne est absente. */
  postesDeclares: number | null
  /** postesDeclares − besoinTheorique, `null` si les postes déclarés manquent. */
  ecartBesoinDeclare: number | null
  /** max(0, enseignantsEtat − enseignantsMinimumAConserver). */
  excedentTheorique: number

  elevesParEnseignant: number | null
  elevesParEnseignantEtat: number | null
  elevesParClasse: number | null
  effectifMoyenParNiveau: number | null
  /**
   * Rapport entre les élèves par enseignant État et la cible configurée.
   * `null` si la cible n'est pas renseignée ou si les effectifs manquent.
   */
  pressionPedagogique: number | null

  /** Nombre d'enseignants manquants (= besoinTheorique). */
  deficitAbsolu: number
  /** deficitAbsolu / besoinNormatif, `null` si le besoin normatif est nul. */
  deficitRelatif: number | null

  severite: SchoolSeverity
  raisons: DiagnosticReason[]
}

/** Volume de besoin d'un établissement, utilisé pour construire les postes. */
export interface TeacherNeed {
  schoolId: string
  nombre: number
}

/** Volume d'excédent mobilisable d'un établissement, plafond de départs autorisés. */
export interface TeacherSurplus {
  schoolId: string
  nombre: number
}

/** Totaux d'un périmètre territorial, tous calculés à partir des diagnostics. */
export interface TerritorialTotals {
  ecolesAnalysees: number
  ecolesEnDeficit: number
  ecolesAvecExcedent: number
  ecolesSatisfaisantes: number

  classes: number
  enseignantsEtat: number
  autresEnseignants: number | null

  postesNecessaires: number
  postesDeclares: number | null
  excedentMobilisable: number

  effectifTotalEleves: number | null
  elevesParEnseignantEtat: number | null
  elevesParClasse: number | null

  classesMultigrades: number
}

/** Agrégat d'un territoire, avec ses enfants directs dans la hiérarchie. */
export interface TerritorialSummary {
  territory: EducationTerritory
  totals: TerritorialTotals
  /** Identifiants des écoles rattachées à ce territoire (transitivement). */
  schoolIds: string[]
  children: TerritorialSummary[]
}
