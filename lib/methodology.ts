/**
 * Contenu de la page Méthodologie, séparé de l'affichage pour être réutilisé
 * tel quel dans les exports (Word, rapport décisionnel).
 *
 * Le texte s'adresse d'abord à un lecteur non informaticien : on explique ce que
 * signifie chaque notion avant d'en donner la formule. Les formules restent
 * disponibles, mais en second plan (§22).
 */

export interface NotionMethodologique {
  /** Question telle qu'un utilisateur se la pose. */
  titre: string
  /** Réponse en langage courant, sans notation mathématique. */
  explication: string
  /** Formule exacte appliquée par le moteur, affichée en second plan. */
  formule?: string
  /** Ce qui change si on modifie le paramétrage. */
  parametrable?: string
}

export const NOTIONS: NotionMethodologique[] = [
  {
    titre: 'Besoin — pourquoi une école est considérée en déficit',
    explication:
      "On compare le nombre d'enseignants payés par l'État présents dans l'école au nombre qu'il faudrait pour couvrir ses classes. S'il en manque, l'écart constitue le besoin de l'école. Une école qui a autant d'enseignants que de classes n'a aucun besoin ; une école qui en a davantage n'a pas un besoin négatif, elle a simplement un besoin nul.",
    formule: 'besoin = max(0 ; nombre de classes × enseignants par classe − enseignants payés par l’État)',
    parametrable:
      "Le nombre d'enseignants attendus par classe est un paramètre. Par défaut il vaut 1, ce qui correspond à la règle « une classe, un enseignant ».",
  },
  {
    titre: 'Postes déclarés — pourquoi deux chiffres peuvent différer',
    explication:
      "Certains fichiers contiennent une colonne de postes officiellement ouverts. Cette valeur n'est jamais écrasée par le besoin calculé : les deux sont affichées côte à côte, ainsi que leur écart. Un écart n'est pas une erreur, il signale seulement que la déclaration administrative et le calcul reposent sur des critères différents.",
  },
  {
    titre: 'Excédent — pourquoi certains enseignants peuvent être mobilisables',
    explication:
      "Une école ne peut céder un enseignant que si elle en garde assez pour fonctionner. On définit donc un minimum à conserver, et seuls les enseignants au-delà de ce minimum sont considérés comme potentiellement redéployables. Une école de 8 classes qui compte 11 enseignants garde ses 8 enseignants et peut en mobiliser 3 au maximum — jamais davantage.",
    formule: 'excédent mobilisable = max(0 ; enseignants payés par l’État − minimum à conserver)',
    parametrable:
      "Le minimum à conserver vaut par défaut le nombre de classes. Il peut devenir une proportion du nombre de classes, ou une valeur fixe par établissement.",
  },
  {
    titre: 'Vivier — qui entre réellement dans la simulation',
    explication:
      "Être en activité et payé par l'État ne suffit pas. Un enseignant n'entre dans le vivier que si son école dispose d'un excédent, et le nombre de candidats retenus dans une école ne dépasse jamais cet excédent. C'est le barème individuel qui départage ensuite les enseignants d'une même école : les mieux classés sont les premiers candidats au départ.",
  },
  {
    titre: 'Redéploiement — ce que signifie couvrir un poste',
    explication:
      "Couvrir un poste par redistribution, c'est proposer qu'un enseignant d'une école en excédent rejoigne une école en déficit. Aucune création de poste, aucun recrutement : uniquement un déplacement. Un enseignant ne peut être proposé qu'une seule fois, et un poste ne peut recevoir qu'un seul enseignant.",
  },
  {
    titre: 'Besoin résiduel — ce qui reste après la simulation',
    explication:
      "Ce sont les postes pour lesquels aucun enseignant mobilisable n'a pu être proposé dans le périmètre retenu. Ce nombre ne relève plus d'une redistribution interne : il documente un besoin qui appelle un autre type d'arbitrage.",
    formule: 'besoin initial = postes couverts + besoin résiduel',
  },
  {
    titre: 'Barème individuel — pourquoi certains enseignants apparaissent avant d’autres',
    explication:
      "Le barème combine l'ancienneté de carrière, l'ancienneté au poste, la situation familiale, le nombre d'enfants, la formation continue et un score lié à l'âge. Il sert à ordonner les candidats, pas à évaluer la qualité du travail d'un enseignant.",
    formule:
      'barème = 0,30 × ancienneté carrière + 0,25 × ancienneté poste (plafonnée à 10) + 0,15 × points situation familiale + 0,10 × nombre d’enfants + 0,10 × formation continue + 0,10 × âge ajusté (âge plafonné à 60, divisé par 6)',
    parametrable: 'Chacun des six poids est modifiable dans la page Paramètres.',
  },
  {
    titre: 'Score de compatibilité — comment un poste est choisi',
    explication:
      "Pour chaque enseignant mobilisable, le moteur examine les postes ouverts de son périmètre et retient celui qui obtient le score le plus élevé. Le score combine le barème de l'enseignant, la proximité géographique, l'ancienneté au poste, la situation familiale, une règle d'âge, une règle de zone, et la priorité déclarée par l'établissement. Toutes les composantes affichées dans « Pourquoi cette proposition ? » sont celles qui ont réellement servi au calcul.",
    formule:
      'score = 0,35 × barème + 0,35 × points de proximité + 0,10 × ancienneté poste + 0,08 × points situation familiale + 0,07 × règle d’âge + 0,05 × règle de zone + bonus de priorité locale',
  },
  {
    titre: 'Scénarios géographiques — commune, département, étendu',
    explication:
      "Le scénario local n'autorise que les mouvements à l'intérieur d'une même commune. Le scénario départemental élargit au département. Le scénario étendu ne pose aucune contrainte : il mesure un plafond théorique de redistribution et peut impliquer des déplacements géographiquement peu réalistes. Ces trois scénarios répondent à la même question sous trois contraintes différentes, et aucun n'est présenté comme préférable.",
  },
  {
    titre: 'Sévérité — comment les écoles sont classées',
    explication:
      "Une école sans besoin est dite en situation satisfaisante, ou en excédent si elle dépasse son minimum à conserver. Pour les écoles en déficit, on rapporte le nombre de postes manquants au besoin total de l'école : un déficit faible concerne une petite part des classes, un déficit critique en concerne une grande part.",
    formule: 'déficit relatif = besoin / (nombre de classes × enseignants par classe)',
    parametrable: 'Les deux seuils qui séparent déficit faible, important et critique sont modifiables dans les Paramètres.',
  },
  {
    titre: 'Indicateurs pédagogiques — quand ils sont calculés',
    explication:
      "Les élèves par enseignant, par classe et par niveau ne sont calculés que si le fichier contient les effectifs correspondants. Quand ils sont absents, l'application l'indique explicitement plutôt que de compléter par une valeur estimée. La pression pédagogique, elle, suppose en plus qu'une cible « élèves par enseignant » ait été renseignée par l'utilisateur, avec son année et sa source.",
  },
]

export interface RegleMoteur {
  titre: string
  texte: string
}

/** Détail des phases et garde-fous, pour un lecteur qui veut le fonctionnement exact. */
export const REGLES_MOTEUR: RegleMoteur[] = [
  {
    titre: 'Ordre des phases',
    texte:
      "Les enseignants du vivier sont parcourus par barème décroissant. Une phase « même commune » s'exécute d'abord, puis « même département », puis des phases ciblées (jeunes enseignants vers les classes multigrades, enseignants anciens en zone rurale vers l'urbain), puis une phase de répartition du reste. Un enseignant affecté ne repasse pas dans les phases suivantes.",
  },
  {
    titre: 'Périmètre du scénario',
    texte:
      "Le périmètre choisi dans le scénario est toujours la contrainte la plus forte. Dans un scénario local, même la phase « répartition du reste » reste limitée à la commune de rattachement.",
  },
  {
    titre: 'Fait de Prince (décision de la DRH)',
    texte:
      "Un fait de Prince est un redéploiement décidé par la DRH en dehors de l'algorithme : aucun contrôle n'est appliqué (ancienneté, âge, statut, excédent de l'école d'origine, besoin de l'école de destination, périmètre géographique). La décision est ensuite prise pour acquise dans tous les calculs : l'enseignant est rattaché à sa nouvelle école, les effectifs des deux écoles sont mis à jour avant le calcul des besoins et des excédents, et cet enseignant est exclu du vivier — l'algorithme ne le remet jamais en mouvement. Les décisions sont consignées dans le rapport et un contrôle vérifie après chaque simulation qu'aucune n'a été contournée.",
  },
  {
    titre: 'Passage prioritaire, sans contrainte géographique',
    texte:
      "Phase optionnelle, désactivée par défaut, exécutée avant toutes les autres et sans contrainte de commune ni de département. Elle contourne délibérément l'ordre géographique normal : elle n'est proposée que pour permettre de mesurer l'effet d'un tel contournement. À la différence de l'fait de Prince, elle reste une phase de l'algorithme : elle ne désigne aucun enseignant en particulier.",
  },
  {
    titre: 'Critères du barème individuel',
    texte:
      "Le barème classe les enseignants d'une même école pour déterminer lesquels partiraient en premier. Il additionne six critères, chacun multiplié par son poids : ancienneté de carrière, ancienneté au poste, situation matrimoniale, nombre d'enfants, formation continue et âge. Les points par situation matrimoniale (célibataire, marié, divorcé, veuf, séparé, union libre) comme les poids de chaque critère sont paramétrables ; mettre un poids à zéro neutralise le critère. Le détail complet du calcul est consultable enseignant par enseignant.",
  },
  {
    titre: 'Libellés de situation matrimoniale',
    texte:
      "Les fichiers n'écrivent pas la situation matrimoniale de façon uniforme. Les graphies sont rapprochées localement, en ignorant les accents, la casse, le genre et la ponctuation : « Marié », « Mariée » et « MARIE(E) » comptent pour la même situation. Une valeur qu'aucun rapprochement ne reconnaît vaut zéro point : elle est alors listée dans la configuration du moteur, avec son effectif, pour être ajoutée au barème si nécessaire.",
  },
  {
    titre: 'Plafond de départs',
    texte:
      "Le nombre de candidats retenus dans une école ne peut pas dépasser son excédent calculé. Ce plafond est appliqué à la constitution du vivier, puis revérifié après la simulation.",
  },
  {
    titre: 'Mouvements internes exclus',
    texte:
      "Un enseignant n'est jamais proposé sur un poste de sa propre école : le mouvement n'améliorerait aucune couverture.",
  },
  {
    titre: 'Vérifications systématiques',
    texte:
      "Après chaque simulation, huit contrôles sont exécutés : unicité de l'enseignant, unicité du poste, respect de l'excédent, absence de déficit créé dans une école source, provenance des propositions depuis le vivier, conservation du besoin (initial = couvert + résiduel), respect du périmètre, et absence de mouvement interne. Leur résultat est affiché, y compris en cas d'écart.",
  },
  {
    titre: 'Reproductibilité',
    texte:
      "Chaque scénario conserve une copie figée des paramètres avec lesquels il a été exécuté. Deux exécutions du même scénario sur les mêmes données produisent exactement le même résultat : aucun tirage aléatoire n'intervient.",
  },
  {
    titre: 'Limites connues',
    texte:
      "La proximité repose sur l'égalité des libellés de commune, de département et de région, pas sur des distances réelles. Les situations individuelles absentes des fichiers (santé, contentieux, affectations en cours) ne sont pas prises en compte. Les excédents dépendent du nombre de classes déclaré : une modification de la carte scolaire modifie mécaniquement les résultats.",
  },
  {
    titre: 'Traitement local',
    texte:
      "Toutes les étapes — lecture des classeurs, contrôle qualité, calculs, cartographie, textes de diagnostic, exports — s'exécutent sur le poste de l'utilisateur. Aucune intelligence artificielle générative n'intervient : les textes proviennent de modèles de phrases déclenchés par des conditions sur les valeurs calculées.",
  },
]

/** Correspondance entre vocabulaire technique et vocabulaire de la Vue simplifiée (§28). */
export const VOCABULAIRE: { technique: string; simplifie: string }[] = [
  { technique: 'Vivier potentiel', simplifie: 'Enseignants potentiellement redéployables' },
  { technique: 'Écoles fournisseurs', simplifie: 'Écoles disposant d’un excédent mobilisable' },
  { technique: 'Affectation séquentielle', simplifie: 'Simulation de répartition' },
  { technique: 'Besoin total', simplifie: 'Postes nécessaires' },
  { technique: 'Postes non pourvus', simplifie: 'Postes non pourvus' },
  { technique: 'Barème individuel', simplifie: 'Ordre de passage des enseignants' },
  { technique: 'Score enseignant-poste', simplifie: 'Compatibilité avec le poste' },
  { technique: 'Taux d’encadrement absolu', simplifie: 'Enseignants par classe' },
]
