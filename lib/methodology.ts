/**
 * Contenu de la page Méthodologie, séparé de l'affichage pour pouvoir être
 * réutilisé tel quel dans l'export Word (lib/export-methodology-docx.ts).
 */

export interface GlossaryTerm {
  term: string
  summary: string
  explanation: string
}

/** Les quatre indicateurs clés du tableau de bord, en langage simple. */
export const KEY_INDICATORS: GlossaryTerm[] = [
  {
    term: 'Besoin total',
    summary: "Le nombre de postes ouverts, tous établissements confondus.",
    explanation:
      "Chaque établissement déclare un nombre de postes ouverts (nb_postes_ouverts). Le moteur crée un poste individuel par unité ouverte — c'est ce total qui constitue le besoin de départ, avant toute affectation.",
  },
  {
    term: 'Disponibles',
    summary: "Les enseignants du vivier, éligibles à une affectation.",
    explanation:
      "Un enseignant entre dans le vivier s'il est actif ou disponible, payé par l'État, et n'a pas le statut malade ou abandon. Chaque enseignant du vivier reçoit un barème individuel qui détermine sa priorité de passage.",
  },
  {
    term: 'Affectés',
    summary: "Les enseignants du vivier pour lesquels un poste a été trouvé.",
    explanation:
      "Le moteur parcourt les phases dans l'ordre (commune, département, règles ciblées, puis reste) et affecte chaque enseignant disponible au meilleur poste encore ouvert selon le score enseignant-poste. Un enseignant affecté ne repasse pas dans les phases suivantes.",
  },
  {
    term: 'À recruter',
    summary: "Les postes qui restent ouverts après toutes les phases.",
    explanation:
      "C'est le déficit final : des postes pour lesquels aucun enseignant du vivier n'a pu être proposé, à l'issue de toutes les phases activées. Ce chiffre appelle un recrutement externe, pas une simulation de plus.",
  },
]

export interface MenuSection {
  label: string
  description: string
}

/** Ce que contient chaque page du menu, en langage simple. */
export const MENU_SECTIONS: MenuSection[] = [
  {
    label: 'Tableau de bord',
    description: "Vue d'ensemble dès l'ouverture de l'application : la synthèse chiffrée de la dernière affectation calculée.",
  },
  {
    label: 'Importation des données',
    description: "L'endroit où charger les deux fichiers sources (établissements, enseignants) pour que le moteur calcule les affectations.",
  },
  {
    label: 'Paramètres de l\'algorithme',
    description: "Les seuils, les poids du barème individuel et du score de poste, et les phases DREB activables — modifiables avant de relancer le calcul. Un fichier de configuration JSON peut aussi être chargé ou téléchargé ici.",
  },
  {
    label: 'Écoles en besoin',
    description: "La liste des établissements ayant au moins un poste ouvert, avec leur taux d'encadrement.",
  },
  {
    label: 'Écoles fournisseurs',
    description: "Les établissements d'origine des enseignants du vivier, avec le nombre d'enseignants mobilisables par commune.",
  },
  {
    label: 'Affectations proposées',
    description: "Le résultat concret du moteur : la liste des enseignants affectés, de quel établissement d'origine vers quel poste, avec le score retenu.",
  },
  {
    label: 'Enseignants non affectés',
    description: "Les enseignants du vivier pour lesquels aucun poste compatible n'a été trouvé à l'issue de toutes les phases.",
  },
  {
    label: 'Postes non pourvus',
    description: "Les postes ouverts qui restent sans enseignant proposé — le déficit à recruter.",
  },
  {
    label: 'Vivier potentiel',
    description: "La liste complète des enseignants éligibles, avec leur barème individuel et leur statut d'affectation.",
  },
  {
    label: 'Méthodologie',
    description: 'Cette page : les définitions des indicateurs et les règles précises appliquées par le moteur.',
  },
]

export interface MethodRule {
  title: string
  text: string
}

/** Règles techniques précises du moteur, pour un public qui veut le détail exact. */
export const METHOD_RULES: MethodRule[] = [
  {
    title: 'Barème individuel',
    text: "Combinaison pondérée de l'ancienneté de carrière, d'un bonus d'ancienneté au poste (plafonné à 10 points à partir du seuil configuré), de la situation familiale, du nombre d'enfants, de la formation continue et d'un score d'âge ajusté (âge plafonné à 60 ans, divisé par 6). Détermine l'ordre de passage dans le vivier.",
  },
  {
    title: 'Score enseignant-poste',
    text: "Combinaison pondérée du barème individuel, d'un score de proximité (même commune > même département > autre), de l'ancienneté au poste, de la situation familiale, d'une règle d'âge (jeunes vers établissements multigrades, plus âgés vers IAEB ou établissements non multigrades) et d'une règle de zone (ancienneté rurale vers zone urbaine ou semi-urbaine). Un bonus de priorité locale s'ajoute selon le rang déclaré par l'établissement.",
  },
  {
    title: 'Phase 1 — Même commune',
    text: "Chaque enseignant du vivier, dans l'ordre du barème, est affecté au meilleur poste encore ouvert dans sa commune de rattachement.",
  },
  {
    title: 'Phase 2 — Même département',
    text: "Pour les enseignants restants : meilleur poste encore ouvert dans leur département de rattachement.",
  },
  {
    title: 'Phase 3 — Jeunes vers multigrades',
    text: "Pour les enseignants restants d'âge inférieur ou égal au seuil « jeune » : meilleur poste ouvert, tous établissements confondus, sans contrainte géographique.",
  },
  {
    title: 'Phase 3 — Anciens du rural vers l\'urbain',
    text: "Pour les enseignants restants rattachés à une zone rurale avec au moins 5 ans d'ancienneté au poste : meilleur poste ouvert, sans contrainte géographique.",
  },
  {
    title: 'Phase 4 — Reste',
    text: "Tous les enseignants encore disponibles sont affectés au meilleur poste encore ouvert, sans aucune contrainte.",
  },
  {
    title: 'Garde-fous déclarés, non appliqués par le calcul',
    text: "Le seuil « ne pas vider une école sous un taux donné » et la règle « permutations IAEB par âge » (phase3_ages_vers_iaeb) figurent dans la configuration mais ne pilotent aucune étape du moteur — comme dans la version d'origine. La règle d'âge vers IAEB reste néanmoins active dans le score enseignant-poste, indépendamment de cette case.",
  },
  {
    title: 'Limites',
    text: "Aucune distance réelle : la proximité repose sur l'égalité de commune ou de département déclarés, pas sur des coordonnées. Un enseignant n'est jamais affecté deux fois ; un poste n'accueille jamais deux enseignants — ces deux garanties sont structurelles, pas des options à activer.",
  },
]
