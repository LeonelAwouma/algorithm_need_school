/**
 * Dictionnaire local des colonnes attendues et de leurs alias.
 *
 * La reconnaissance des colonnes se fait entièrement hors ligne : nom exact,
 * puis alias de ce dictionnaire, puis comparaison normalisée, puis comparaison
 * approchante locale. Aucun service externe n'est appelé (contrainte §
 * « fonctionnement 100 % local »).
 */

export interface FieldDefinition {
  /** Nom du champ métier, tel qu'utilisé dans le code et l'UI avancée. */
  champ: string
  /** Libellé lisible affiché à un utilisateur non technique. */
  label: string
  /** Colonne indispensable au calcul : son absence bloque l'analyse. */
  requis: boolean
  /** Ce que l'on perd si la colonne est absente (affiché en clair). */
  consequence: string
  /** Noms de colonnes acceptés, en plus du nom canonique. */
  alias: string[]
}

export const SCHOOL_FIELDS: FieldDefinition[] = [
  {
    champ: 'id',
    label: "Code de l'établissement",
    requis: true,
    consequence: 'Sans identifiant, les enseignants ne peuvent pas être rattachés à leur école.',
    alias: ['id_etab', 'code_etab', 'code_etablissement', 'code_ecole', 'matricule_etab', 'id_ecole', 'code'],
  },
  {
    champ: 'nom',
    label: "Nom de l'établissement",
    requis: true,
    consequence: "Les tableaux et la fiche école n'auraient plus de libellé lisible.",
    alias: ['nom_etab', 'nom_etablissement', 'nom_ecole', 'libelle_etab', 'etablissement', 'ecole'],
  },
  {
    champ: 'region',
    label: 'Région',
    requis: true,
    consequence: "L'analyse territoriale et la carte ne peuvent pas être construites.",
    alias: ['region', 'nom_region', 'regions', 'libelle_region'],
  },
  {
    champ: 'departement',
    label: 'Département',
    requis: true,
    consequence: 'Le scénario départemental ne peut pas être calculé.',
    alias: ['departement', 'nom_departement', 'dept', 'departements'],
  },
  {
    champ: 'commune',
    label: 'Commune',
    requis: true,
    consequence: 'Le scénario local (même commune) ne peut pas être calculé.',
    alias: ['commune', 'nom_commune', 'arrondissement', 'communes'],
  },
  {
    champ: 'zone',
    label: 'Zone',
    requis: false,
    consequence: 'Les règles liées aux zones rurales ou urbaines sont neutralisées.',
    alias: ['zone', 'milieu', 'type_zone', 'zone_etab'],
  },
  {
    champ: 'typeEtab',
    label: "Type d'établissement",
    requis: false,
    consequence: "Les règles spécifiques par type d'établissement sont neutralisées.",
    alias: ['type_etab', 'type', 'type_etablissement', 'categorie', 'statut_etab'],
  },
  {
    champ: 'nbClasses',
    label: 'Nombre de classes',
    requis: true,
    consequence: 'Le besoin et le minimum à conserver ne peuvent pas être calculés.',
    alias: ['nb_classes', 'nombre_classes', 'classes', 'total_classes', 'nbre_classes'],
  },
  {
    champ: 'nbSallesClasse',
    label: 'Nombre de salles de classe',
    requis: false,
    consequence: "Le rapprochement entre salles disponibles et classes ouvertes n'est pas affiché.",
    alias: ['nb_salles_classe', 'nb_salles', 'salles_classe', 'nombre_salles', 'total_salles'],
  },
  {
    champ: 'nbEnseignantsEtat',
    label: "Enseignants payés par l'État",
    requis: true,
    consequence: "Sans effectif d'enseignants, ni le besoin ni l'excédent ne peuvent être calculés.",
    alias: [
      'nb_enseignants_etat',
      'enseignants_etat',
      'nb_ens_etat',
      'effectif_enseignants_etat',
      'nombre_enseignants_etat',
      'personnel_etat',
    ],
  },
  {
    champ: 'nbAutresEnseignants',
    label: 'Autres enseignants',
    requis: false,
    consequence: "Le ratio élèves par enseignant toutes catégories n'est pas calculé.",
    alias: [
      'nb_autres_enseignants',
      'autres_enseignants',
      'nb_maitres_parents',
      'maitres_parents',
      'enseignants_non_etat',
      'nb_ens_autres',
    ],
  },
  {
    champ: 'nbPostesOuvertsDeclares',
    label: 'Postes ouverts déclarés',
    requis: false,
    consequence: "L'écart entre besoin calculé et postes officiellement déclarés n'est pas affiché.",
    alias: ['nb_postes_ouverts', 'postes_ouverts', 'postes_declares', 'nb_postes', 'besoin_declare'],
  },
  {
    champ: 'classesMultigrades',
    label: 'Classes multigrades',
    requis: false,
    consequence: 'Les priorités liées aux classes multigrades sont neutralisées.',
    alias: ['classes_multigrades', 'nb_classes_multigrades', 'multigrades', 'classes_multigrade'],
  },
  {
    champ: 'prioriteLocale',
    label: 'Priorité locale',
    requis: false,
    consequence: "Le rang de priorité déclaré localement n'est pas pris en compte.",
    alias: ['priorite_locale', 'priorite', 'rang_priorite', 'ordre_priorite'],
  },
  {
    champ: 'effectifTotalEleves',
    label: "Effectif total d'élèves",
    requis: false,
    consequence: 'Les indicateurs pédagogiques (élèves par enseignant, pression) ne sont pas calculés.',
    alias: ['effectif_total_eleves', 'total_eleves', 'effectif_eleves', 'nb_eleves', 'effectif_total', 'eleves'],
  },
  {
    champ: 'effectifFilles',
    label: 'Effectif filles',
    requis: false,
    consequence: "La répartition par sexe n'est pas affichée.",
    alias: ['effectif_filles', 'total_filles', 'nb_filles', 'filles'],
  },
  {
    champ: 'effectifGarcons',
    label: 'Effectif garçons',
    requis: false,
    consequence: "La répartition par sexe n'est pas affichée.",
    alias: ['effectif_garcons', 'total_garcons', 'nb_garcons', 'garcons'],
  },
  {
    champ: 'effectifCI',
    label: 'Effectif CI',
    requis: false,
    consequence: "L'effectif moyen par niveau est calculé sur les seuls niveaux renseignés.",
    alias: ['effectif_ci', 'ci', 'eleves_ci', 'nb_ci', 'sil'],
  },
  {
    champ: 'effectifCP',
    label: 'Effectif CP',
    requis: false,
    consequence: "L'effectif moyen par niveau est calculé sur les seuls niveaux renseignés.",
    alias: ['effectif_cp', 'cp', 'eleves_cp', 'nb_cp'],
  },
  {
    champ: 'effectifCE1',
    label: 'Effectif CE1',
    requis: false,
    consequence: "L'effectif moyen par niveau est calculé sur les seuls niveaux renseignés.",
    alias: ['effectif_ce1', 'ce1', 'eleves_ce1', 'nb_ce1'],
  },
  {
    champ: 'effectifCE2',
    label: 'Effectif CE2',
    requis: false,
    consequence: "L'effectif moyen par niveau est calculé sur les seuls niveaux renseignés.",
    alias: ['effectif_ce2', 'ce2', 'eleves_ce2', 'nb_ce2'],
  },
  {
    champ: 'effectifCM1',
    label: 'Effectif CM1',
    requis: false,
    consequence: "L'effectif moyen par niveau est calculé sur les seuls niveaux renseignés.",
    alias: ['effectif_cm1', 'cm1', 'eleves_cm1', 'nb_cm1'],
  },
  {
    champ: 'effectifCM2',
    label: 'Effectif CM2',
    requis: false,
    consequence: "L'effectif moyen par niveau est calculé sur les seuls niveaux renseignés.",
    alias: ['effectif_cm2', 'cm2', 'eleves_cm2', 'nb_cm2'],
  },
]

export const TEACHER_FIELDS: FieldDefinition[] = [
  {
    champ: 'id',
    label: "Matricule de l'enseignant",
    requis: true,
    consequence: "Sans identifiant, les doublons et les affectations ne peuvent pas être contrôlés.",
    alias: ['id_ens', 'matricule', 'code_ens', 'id_enseignant', 'matricule_ens'],
  },
  {
    champ: 'nom',
    label: 'Nom',
    requis: true,
    consequence: "Les propositions d'affectation ne seraient pas identifiables.",
    alias: ['nom', 'nom_ens', 'nom_enseignant', 'nom_famille'],
  },
  {
    champ: 'prenom',
    label: 'Prénom',
    requis: false,
    consequence: "L'identification des enseignants est moins précise.",
    alias: ['prenom', 'prenoms', 'prenom_ens'],
  },
  {
    champ: 'dateNaissance',
    label: 'Date de naissance',
    requis: false,
    consequence: "Les règles liées à l'âge sont neutralisées pour les enseignants concernés.",
    alias: ['date_naissance', 'naissance', 'date_de_naissance', 'ddn', 'né_le'],
  },
  {
    champ: 'idEtabAttache',
    label: "École de rattachement",
    requis: true,
    consequence: "Sans école d'attache, l'excédent mobilisable ne peut pas être respecté.",
    alias: ['id_etab_attache', 'id_etab', 'code_etab', 'etablissement_attache', 'ecole_attache', 'code_ecole'],
  },
  {
    champ: 'communeAttache',
    label: 'Commune de rattachement',
    requis: false,
    consequence: "Elle est reprise de l'école de rattachement quand elle est absente.",
    alias: ['commune_attache', 'commune', 'arrondissement_attache'],
  },
  {
    champ: 'departementAttache',
    label: 'Département de rattachement',
    requis: false,
    consequence: "Il est repris de l'école de rattachement quand il est absent.",
    alias: ['departement_attache', 'departement', 'dept_attache'],
  },
  {
    champ: 'regionAttache',
    label: 'Région de rattachement',
    requis: false,
    consequence: "Elle est reprise de l'école de rattachement quand elle est absente.",
    alias: ['region_attache', 'region'],
  },
  {
    champ: 'zoneAttache',
    label: 'Zone de rattachement',
    requis: false,
    consequence: "Elle est reprise de l'école de rattachement quand elle est absente.",
    alias: ['zone_attache', 'zone', 'milieu_attache'],
  },
  {
    champ: 'ancienneteCarriereAns',
    label: 'Ancienneté de carrière (ans)',
    requis: false,
    consequence: 'Ce critère du barème individuel vaut 0 pour les enseignants concernés.',
    alias: ['anciennete_carriere_ans', 'anciennete_carriere', 'anciennete', 'annees_service'],
  },
  {
    champ: 'anciennetePosteAns',
    label: 'Ancienneté au poste (ans)',
    requis: false,
    consequence: 'Ce critère du barème individuel vaut 0 pour les enseignants concernés.',
    alias: ['anciennete_poste_ans', 'anciennete_poste', 'annees_poste', 'anciennete_dans_le_poste'],
  },
  {
    champ: 'situationFamiliale',
    label: 'Situation familiale',
    requis: false,
    consequence: 'Ce critère du barème individuel vaut 0 pour les enseignants concernés.',
    alias: ['situation_familiale', 'situation_matrimoniale', 'statut_matrimonial', 'situation'],
  },
  {
    champ: 'nbEnfants',
    label: "Nombre d'enfants",
    requis: false,
    consequence: 'Ce critère du barème individuel vaut 0 pour les enseignants concernés.',
    alias: ['nb_enfants', 'nombre_enfants', 'enfants', 'nb_enfant'],
  },
  {
    champ: 'formationContinue',
    label: 'Formation continue',
    requis: false,
    consequence: 'Ce critère du barème individuel vaut 0 pour les enseignants concernés.',
    alias: ['formation_continue', 'formations', 'nb_formations', 'formation'],
  },
  {
    champ: 'statut',
    label: 'Statut',
    requis: false,
    consequence: "Tous les enseignants sont alors considérés comme en activité.",
    alias: ['statut', 'statut_ens', 'position', 'situation_administrative'],
  },
  {
    champ: 'payeParEtat',
    label: "Payé par l'État",
    requis: false,
    consequence: "Tous les enseignants sont alors considérés comme payés par l'État.",
    alias: ['paye_par_etat', 'paye_etat', 'prise_en_charge', 'source_salaire', 'payeur'],
  },
]

/** Index des champs par nom, pour retrouver un libellé depuis un identifiant. */
export const FIELD_BY_NAME: Record<string, FieldDefinition> = Object.fromEntries(
  [...SCHOOL_FIELDS, ...TEACHER_FIELDS].map(f => [f.champ, f]),
)

/** Champs « effectif élèves » : leur présence conditionne les indicateurs pédagogiques. */
export const STUDENT_FIELDS = [
  'effectifTotalEleves',
  'effectifFilles',
  'effectifGarcons',
  'effectifCI',
  'effectifCP',
  'effectifCE1',
  'effectifCE2',
  'effectifCM1',
  'effectifCM2',
] as const
