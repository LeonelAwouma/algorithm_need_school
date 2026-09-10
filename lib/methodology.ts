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
    term: 'Écoles publiques',
    summary: "Le nombre total d'écoles primaires publiques prises en compte par le moteur.",
    explanation:
      "Seules les écoles publiques (« Public / Government »), telles que recensées dans le fichier des salles de classe 2024–2025, sont retenues : les écoles privées ne sont pas comptées. C'est le point de départ de tout le calcul — toutes les autres statistiques (besoins, vivier, rotations) ne portent que sur cet ensemble d'écoles.",
  },
  {
    term: 'Écoles calculables',
    summary: "Parmi les écoles publiques, celles pour lesquelles un besoin a pu être réellement calculé.",
    explanation:
      "Une école est « calculable » si elle a du personnel recensé, un nombre de salles cohérent (un nombre entier positif ou nul), et si la région, le département et l'arrondissement de son personnel correspondent bien à ceux de l'école. Si l'une de ces conditions manque, l'école est mise de côté et apparaît dans la rubrique Contrôles, avec le motif exact : aucun personnel connu, salles manquantes ou incohérentes, ou géographie discordante entre l'école et son personnel.",
  },
  {
    term: 'Besoin initial',
    summary: "Le nombre de salles de classe utilisées qui n'ont pas d'enseignant de l'État affecté.",
    explanation:
      "Pour chaque école calculable, on compare le nombre de salles utilisées pour les cours au nombre d'enseignants de l'État réellement en poste (hors directeurs). S'il y a plus de salles que d'enseignants, le besoin est égal à la différence ; s'il y a autant ou plus d'enseignants que de salles, le besoin est nul — il n'est jamais négatif. C'est une estimation fondée sur l'hypothèse « un enseignant par salle utilisée », pas un quota de recrutement officiellement validé.",
  },
  {
    term: 'Vivier potentiel',
    summary: "Les enseignants de l'État qui peuvent être redéployés vers une école en besoin.",
    explanation:
      "Dans une école qui compte plus d'enseignants que de salles utilisées (donc en excédent), les enseignants ayant entre 6 et 60 ans d'ancienneté dans cette école deviennent candidats à une rotation. Les plus anciens sont retenus en priorité, dans la limite du nombre d'enseignants en trop. Ce sont eux que le moteur propose ensuite pour couvrir les écoles en besoin (voir Rotations proposées).",
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
    description: "Vue d'ensemble dès l'ouverture de l'application : le nombre d'écoles, le besoin initial, le vivier disponible, et les régions où les besoins sont les plus importants.",
  },
  {
    label: 'Importation des données',
    description: "L'endroit où charger les quatre fichiers sources (salles, personnel, écoles, année 5) pour que le moteur calcule les besoins et les rotations — automatiquement depuis le dossier data/sources, ou en sélectionnant les fichiers à la main.",
  },
  {
    label: 'Écoles et besoins',
    description: "La liste complète des écoles publiques avec, pour chacune, son besoin de couverture, les départs et arrivées d'enseignants proposés, et le besoin qu'il reste à couvrir.",
  },
  {
    label: 'Vivier potentiel',
    description: "La liste des enseignants identifiés comme mobilisables pour une rotation, avec leur école d'origine, leur ancienneté et, s'il y en a une, la destination que le moteur leur propose.",
  },
  {
    label: 'Rotations proposées',
    description: "Le résultat concret du moteur : la liste des enseignants qu'il propose de déplacer, de quelle école vers quelle école.",
  },
  {
    label: 'Effectifs N / N+1',
    description: "Pour une école donnée, la comparaison entre son effectif actuel (Année N) et son effectif après application des rotations proposées (Année N+1).",
  },
  {
    label: 'Analyse territoriale',
    description: 'Les mêmes indicateurs que pour les écoles, mais regroupés par région ou par arrondissement, pour comparer les territoires entre eux.',
  },
  {
    label: 'Contrôles des données',
    description: "La liste des anomalies détectées dans les fichiers sources (école sans personnel, salles incohérentes, écarts entre fichiers…), pour vérifier la fiabilité des chiffres avant de les utiliser.",
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
    title: 'Besoin de couverture',
    text: "max(0, salles utilisées − enseignants État de fonction 2), plancher zéro. Les directeurs (fonction 1) et les agents d'appui sont exclus du calcul et du vivier.",
  },
  {
    title: 'Vivier potentiel',
    text: "Dans chaque école excédentaire, enseignants État avec ancienneté école > 5 ans et ≤ 60 ans, les plus anciens retenus dans la limite de l'excédent.",
  },
  {
    title: 'Phase 1 — Arrondissement',
    text: 'Même région, département, arrondissement et sous-système ; priorité au besoin restant le plus élevé puis au code école croissant.',
  },
  {
    title: 'Phase 2 — Département',
    text: "Pour les enseignants restants : même région, département et sous-système ; l'arrondissement le plus demandeur puis l'école la plus déficitaire.",
  },
  {
    title: 'Vue Année N / N+1',
    text: "Projection de la simulation : un enseignant affecté ailleurs quitte la colonne Année N+1 de son école d'origine et apparaît dans celle de sa destination. Aucune trajectoire interannuelle réelle n'est observée, faute d'identifiant personnel stable dans les sources.",
  },
  {
    title: 'Limites non implémentées',
    text: 'Distances réelles, permutations IAEB, classes multigrades, demandes individuelles de mobilité et quota officiel de recrutement.',
  },
]
