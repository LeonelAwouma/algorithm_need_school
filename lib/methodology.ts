/**
 * Contenu de la page Méthodologie, séparé de l'affichage pour être réutilisé
 * tel quel dans les exports (Word, rapport décisionnel).
 *
 * Il reprend le Référentiel technique de modélisation des plans de rotation, de
 * redéploiement et de déploiement. Le texte s'adresse d'abord à un lecteur non
 * informaticien : on explique ce que signifie chaque notion avant d'en donner la
 * formule, qui reste disponible en second plan.
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
    titre: 'Maîtres retenus — combien l’école en aura à la rentrée',
    explication:
      "On part des enseignants de l'État qui tiennent une classe et on retire les départs déjà connus, notamment les retraites. Sans cette déduction, une école dont un maître part à la retraite paraîtrait équilibrée et son poste ne serait ouvert qu'après la rentrée.",
    formule: 'E = enseignants de l’État en poste − départs connus',
    parametrable: "Les départs sont lus dans le fichier des établissements quand il les déclare ; sinon, ils sont repérés dans le fichier des enseignants à partir de l'âge de la retraite (60 ans par défaut).",
  },
  {
    titre: 'Norme — de combien de maîtres les élèves ont besoin',
    explication:
      "La note de cadrage retient un maître pour 60 élèves, arrondi à l'entier supérieur : 250 élèves demandent 5 maîtres. Une école ne descend cependant jamais sous un minimum pédagogique, qui dépend de ses niveaux ouverts : une école complète de 6 niveaux, regroupés deux à deux en classes multigrades, a besoin d'au moins 3 maîtres.",
    formule: 'P = ⌈N ÷ 60⌉ ; m = max(⌈niveaux ÷ 2⌉ ; niveaux − classes multigrades) ; dotation D = max(P ; m)',
    parametrable: "Quand le fichier renseigne les classes multigrades, le minimum pédagogique se calcule école par école : sans multigrade, un maître par niveau ouvert (6 pour une école complète) ; avec multigrades, chaque classe multigrade économise un maître, jusqu'au regroupement deux à deux (3 maîtres). La norme, la tolérance d'arrondi et le regroupement sont des paramètres à valider par la DRH. Sans effectif d'élèves, l'application se replie sur « une classe, un maître » et le signale.",
  },
  {
    titre: 'BMAX — combien de maîtres les salles permettent d’affecter',
    explication:
      "Le besoin des élèves peut dépasser ce que les salles permettent d'accueillir. Une salle en simple flux compte pour un maître, une salle en double flux pour deux ; un local qui ne peut pas servir de salle de classe n'est pas compté. Le besoin reconnu est plafonné par BMAX ; ce qui dépasse n'est pas perdu : il devient un besoin en salles.",
    formule: 'BMAX = salles en simple flux + 2 × salles en double flux ; cible K = min(D ; BMAX)',
    parametrable: 'Le double flux peut être désactivé : chaque salle compte alors pour un seul maître.',
  },
  {
    titre: 'Besoin, excédent, surnombre et salles manquantes',
    explication:
      "Le besoin se mesure par rapport à la cible K, c'est-à-dire à ce que les salles permettent d'affecter ; l'excédent par rapport à la dotation D, c'est-à-dire à ce dont les élèves ont besoin. Cette asymétrie est voulue : un maître n'est mobilisable que s'il est de trop pour les élèves, et pas seulement de trop pour les salles. Les maîtres au-delà des salles mais utiles aux élèves forment un surnombre : ils ne sont pas redéployés, le passage au double flux permet de les employer.",
    formule: 'b = max(0 ; K − E) ; x = max(0 ; E − D) ; a = max(0 ; min(E ; D) − BMAX) ; s = max(0 ; D − BMAX)',
  },
  {
    titre: 'Classement des écoles',
    explication:
      "Une école est nécessiteuse si elle a un besoin (b > 0) : ses postes sont ouverts au redéploiement, puis au recrutement. Elle est excédentaire si elle a un excédent (x > 0) : ses maîtres au-delà de la dotation forment le vivier. Elle est à examiner si elle a un surnombre lié aux salles (a > 0), et équilibrée dans les autres cas. Un manque de salles (s > 0) est signalé à part, comme besoin en infrastructures, quel que soit le classement.",
  },
  {
    titre: 'Sous-systèmes francophone et anglophone',
    explication:
      "Un maître formé pour un sous-système n'enseigne en règle générale pas dans l'autre. Les deux sous-systèmes sont traités séparément à toutes les étapes : une école bilingue forme deux unités de calcul, une par section, chacune avec ses élèves, ses salles et ses maîtres ; aucun besoin n'est compensé d'un sous-système à l'autre ; l'algorithme n'affecte personne hors de son sous-système. Seule une commission d'arbitrage peut décider un changement de sous-système.",
  },
  {
    titre: 'Priorité des écoles — poids de vulnérabilité et indice',
    explication:
      "Le poids de vulnérabilité additionne des points d'accessibilité (urbain 5, rural 10, rural enclavé 20) et de sécurité (zone verte 0, jaune 10, rouge 25). Il fixe le niveau de difficulté de l'école. Comme il ne mesure pas l'ampleur du besoin, on lui ajoute des points de besoin selon le REM actuel. Les postes sont servis par indice décroissant ; à indice égal, les écoles passent avant les structures, puis l'école au REM le plus élevé.",
    formule: 'w = α + σ ; niveau 1 si w ≥ 30, 2 si w ≥ 15, sinon 3 ; β = 0 (REM ≤ 80), 5 (≤ 100), 10 (≤ 150), 15 au-delà ou sans maître ; u = w + β',
    parametrable: 'Points, seuils et tranches sont à valider par la hiérarchie et modifiables dans le Référentiel.',
  },
  {
    titre: 'Demandes de mutation — qui est recevable',
    explication:
      "Les enseignants qui demandent une mutation formulent jusqu'à trois vœux classés. Une demande est recevable si l'enseignant compte au moins 5 ans de stabilité au poste et si son départ ne crée pas de déficit : son école d'attache doit être excédentaire, et ses départs restent dans la limite de son excédent. Les vœux qui portent sur l'autre sous-système sont transmis à la commission.",
    parametrable: 'La durée de stabilité (5 ans) et le nombre de vœux (3) sont des paramètres à confirmer.',
  },
  {
    titre: 'Score de priorité — comment les candidats sont départagés',
    explication:
      "Pour chaque école demandée, le score additionne des points d'ancienneté au poste, des points de service en zone difficile et, le cas échéant, une bonification pour un motif justifié (santé, regroupement familial) visant cette école. Le poids de l'école n'entre pas dans le score : il est identique pour tous les candidats à une même école. À score égal, passe d'abord la plus grande ancienneté générale, puis le plus âgé, puis le meilleur rang de tirage au sort.",
    formule: 'S = A + Z + B ; A = min(20 ; 10 + (années au poste − 6)) − 5 à moins de 5 ans de la retraite (0 avant 6 ans) ; Z = min(10 ; 2 × années en niveau 1 + années en niveau 2) ; B = 10',
  },
  {
    titre: 'Barème individuel (étage 1) — qui part en premier d’une école excédentaire',
    explication:
      "Le barème additionne cinq critères pondérés : la carrière et le service en zone difficile, l'ancienneté au poste, les charges familiales (chaque enfant à charge retire des points, pour protéger les familles), la formation continue et la cohorte d'âge (les plus jeunes sont les plus mobiles). Dans une école excédentaire, le maître au barème le plus élevé est proposé le premier pour un redéploiement obligatoire.",
    formule: 'barème = 0,30 × (ancienneté générale + Z) + 0,25 × A + 0,20 × (points de situation − 2 × enfants) + 0,15 × min(10 ; 2 × formations) + 0,10 × cohorte (10 jeune, 8 médiane, 5 senior)',
    parametrable: 'Poids et points se règlent dans la configuration du moteur.',
  },
  {
    titre: 'Score d’appariement (étage 2) — quel maître pour quel poste',
    explication:
      "Pour un poste donné, le score d'appariement combine le barème du maître, le poids du poste, la proximité (même commune, même IAEB, même département) et des ajustements : jeune enseignant vers une école à classes multigrades, senior vers une structure d'encadrement ou une école sans multigrade, transition du rural vers l'urbain après 5 ans au poste, bonification sur l'école visée par un motif justifié. Il désigne, à proximité égale, le maître proposé en redéploiement obligatoire.",
    formule: 'score = 0,25 × barème + 0,25 × u + 0,25 × points de proximité + 0,25 × ajustements',
    parametrable: "En variante, ce score peut aussi classer les candidats qui demandent une même école, à la place du score de priorité S du référentiel.",
  },
  {
    titre: 'Appariement — l’acceptation différée',
    explication:
      "Chaque candidat demande l'école placée en tête de sa liste ; chaque école garde provisoirement les mieux classés dans la limite de ses postes et refuse les autres ; chaque candidat refusé demande l'école suivante. Une acceptation reste provisoire jusqu'à la fin : c'est ce qui donne son nom à l'algorithme. Le résultat ne dépend pas de l'ordre de saisie, chaque refus s'explique par un candidat mieux classé, et ajouter une école à sa liste ne peut jamais nuire à l'enseignant.",
    parametrable: "Variante : examiner les vœux de l'école la plus lourde à la plus légère. Elle fait perdre la propriété de sincérité.",
  },
  {
    titre: 'Solutions proches, combinaisons et redéploiement obligatoire',
    explication:
      "Un candidat recevable dont aucun vœu n'est satisfait reçoit le poste ouvert le plus proche de ses vœux (commune, puis IAEB, puis département, puis région), jamais en zone rouge et jamais s'il est à moins de 5 ans de la retraite. Les écoles encore non couvertes sont présentées à la commission avec des combinaisons : redéploiement direct, chaîne de mouvements, permutation. En dernier recours, le redéploiement obligatoire déplace un maître d'une école excédentaire du même sous-système, par passes successives — même commune, même IAEB, même département, même région, puis hors région au niveau central — et, à proximité égale, le maître au meilleur score d'appariement ; les postes en zone rouge n'en font jamais l'objet.",
  },
  {
    titre: 'Niveau régional et niveau central',
    explication:
      "Les vœux à l'intérieur de la région sont traités au niveau régional. Les vœux interrégionaux et les besoins qu'aucune école de la région ne peut couvrir sont traités au niveau central, dans le scénario étendu.",
  },
  {
    titre: 'Nouveaux recrutés',
    explication:
      "Les nouveaux recrutés ne sont déployés que sur les postes restés vacants après le redéploiement. Le mieux classé au concours choisit le premier parmi ses trois choix ; à défaut, un poste lui est proposé dans le département, puis dans la région, puis il entre dans un vivier national pour arbitrage. Seuls les postes du sous-système de son concours lui sont proposés.",
  },
  {
    titre: 'Projection sur l’année N+2',
    explication:
      "Un enseignant qui ne peut pas être redéployé immédiatement peut voir un poste se libérer l'année suivante, à la suite d'un départ à la retraite. Les postes projetés en N+2 se calculent comme le besoin, à partir de l'effectif attendu après le plan et des départs prévisibles. Une projection n'est pas un engagement : elle est confirmée ou révisée lors du plan suivant.",
    formule: 'b(N+2) = max(0 ; K − (E(N+1) − départs prévisibles pendant N+1))',
  },
  {
    titre: 'Projection de N+1 à N+3',
    explication:
      "Pour chaque école, l'effectif part de la situation après le plan (mouvements et nouveaux recrutés compris), puis perd les enseignants qui atteignent l'âge de la retraite au cours de chaque année. Le besoin projeté suit la même règle que le besoin de la rentrée. L'attrition hors retraite est appliquée au territoire, par sous-système, et cumulée d'une année sur l'autre en l'absence de recrutement intermédiaire.",
    formule: 'E(N+k) = E(N+k−1) − retraites ; besoin = max(0 ; K − E) ; recrutement à prévoir = Σ max(0 ; B − X) + attrition cumulée',
  },
  {
    titre: 'Agrégation, recrutement à prévoir et degré d’aléa',
    explication:
      "Les résultats des écoles sont additionnés séparément pour chaque sous-système, après écrêtage à zéro : l'excédent d'une école n'annule pas le déficit d'une autre. Le recrutement à prévoir ajoute au besoin restant après redéploiement les départs imprévisibles attendus. Le degré d'aléa mesure la part de la dotation mal répartie entre les écoles d'un territoire ; il tombe à zéro quand besoin et excédent s'annulent.",
    formule: 'R = Σ max(0 ; B − X) par sous-système ; REC = R + ⌈τ* × E ÷ 100⌉ ; aléa = (B + X) ÷ Σ K',
    parametrable: "Le taux d'attrition hors retraite τ* se règle dans le Référentiel.",
  },
  {
    titre: 'Arbitrage et traçabilité',
    explication:
      "Le moteur produit des propositions, pas des décisions. Une commission peut valider une proposition, la rejeter ou la corriger ; la proposition initiale, la décision, son motif et l'instance qui l'a prise sont conservés. Après chaque décision, les besoins sont recalculés et l'algorithme est relancé sur les postes et les candidats restants.",
  },
]

export interface RegleMoteur {
  titre: string
  texte: string
}

/** Détail des étapes et garde-fous, pour un lecteur qui veut le fonctionnement exact. */
export const REGLES_MOTEUR: RegleMoteur[] = [
  {
    titre: 'Ordre des étapes',
    texte:
      "1. décisions de commission déjà prises ; 2. postes ouverts classés par indice de priorité ; 3. synthèse des vœux et scores ; 4. acceptation différée sur les vœux intrarégionaux ; 5. dans le scénario étendu, acceptation différée sur les vœux interrégionaux ; 6. solution la plus proche ; 7. combinaisons pour la commission ; 8. redéploiement obligatoire ; 9. recalcul des besoins, nouveaux recrutés et projection N+2.",
  },
  {
    titre: 'Limite des départs',
    texte:
      "À chaque étape, les départs d'une école restent dans la limite de son excédent x. Quand plus de candidats d'une même école obtiennent un vœu, les moins bien classés voient leur départ non validé et l'algorithme est relancé sans eux.",
  },
  {
    titre: 'Fait de Prince (décision de la DRH)',
    texte:
      "Un fait de Prince est un redéploiement décidé par la DRH en dehors de l'algorithme : aucun contrôle n'est appliqué. La décision est ensuite prise pour acquise dans tous les calculs : l'enseignant est rattaché à sa nouvelle école, les effectifs des deux écoles sont mis à jour avant le calcul des besoins, et cet enseignant n'est jamais remis en mouvement.",
  },
  {
    titre: 'Redéploiement obligatoire et barème individuel',
    texte:
      "Le référentiel laisse à la DRH la hiérarchie des critères du redéploiement obligatoire. L'application ordonne les départs imposés dans une école excédentaire selon le barème individuel : ancienneté de carrière, ancienneté au poste, situation matrimoniale, nombre d'enfants, formation continue et âge, chacun pondéré et paramétrable. Les enseignants à moins de 5 ans de la retraite en sont protégés.",
  },
  {
    titre: 'Libellés de situation matrimoniale',
    texte:
      "Les graphies sont rapprochées localement, en ignorant les accents, la casse, le genre et la ponctuation : « Marié », « Mariée » et « MARIE(E) » comptent pour la même situation. Une valeur non reconnue vaut zéro point et est listée dans la configuration du moteur.",
  },
  {
    titre: 'Vérifications systématiques',
    texte:
      "Après chaque simulation, onze contrôles sont exécutés : unicité de l'enseignant et du poste, respect de l'excédent, absence de déficit créé, origine légitime de chaque proposition, conservation du besoin, respect du périmètre, absence de mouvement interne, respect des faits de Prince, respect des sous-systèmes et de la règle de la zone rouge.",
  },
  {
    titre: 'Reproductibilité',
    texte:
      "Chaque scénario conserve une copie figée des paramètres avec lesquels il a été exécuté, et recalcule le diagnostic avec eux. Deux exécutions du même scénario sur les mêmes données produisent exactement le même résultat : l'acceptation différée ne dépend pas de l'ordre de saisie, et le départage ultime utilise le rang de tirage consigné au procès-verbal.",
  },
  {
    titre: 'Indicateurs non calculés',
    texte:
      "Les taux de stabilité, de rotation et d'intégration exigent un historique des mouvements sur plusieurs années. Le modèle d'élasticité à la productivité n'est pas défini par les sources : il n'est pas intégré à l'algorithme, conformément au référentiel (§2.7).",
  },
  {
    titre: 'Limites connues',
    texte:
      "La proximité repose sur l'égalité des libellés de commune, de département et de région, pas sur des distances réelles. Les situations individuelles absentes des fichiers ne sont pas prises en compte : elles relèvent de l'arbitrage.",
  },
  {
    titre: 'Traitement local',
    texte:
      "Toutes les étapes — lecture des classeurs, contrôle qualité, calculs, cartographie, textes de diagnostic, exports — s'exécutent sur le poste de l'utilisateur. Aucune intelligence artificielle générative n'intervient.",
  },
]

/** Correspondance entre vocabulaire technique et vocabulaire de la Vue simplifiée. */
export const VOCABULAIRE: { technique: string; simplifie: string }[] = [
  { technique: 'Vivier de redéploiement', simplifie: 'Enseignants potentiellement redéployables' },
  { technique: 'École excédentaire', simplifie: 'École disposant d’un excédent mobilisable' },
  { technique: 'École nécessiteuse', simplifie: 'École en déficit' },
  { technique: 'Cible K', simplifie: 'Maîtres réellement affectables' },
  { technique: 'Dotation D', simplifie: 'Maîtres dont les élèves ont besoin' },
  { technique: 'BMAX', simplifie: 'Maîtres que les salles permettent d’accueillir' },
  { technique: 'Indice de priorité u', simplifie: 'Ordre de service des écoles' },
  { technique: 'Score de priorité S', simplifie: 'Classement des demandes de mutation' },
  { technique: 'Acceptation différée', simplifie: 'Satisfaction des vœux' },
  { technique: 'REM', simplifie: 'Élèves par maître' },
]
