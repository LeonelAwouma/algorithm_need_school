/**
 * Construction du rapport décisionnel (§19).
 *
 * Le rapport est un objet de données : il est assemblé une fois puis rendu à
 * l'écran, imprimé, ou exporté. Toutes ses phrases proviennent du générateur de
 * diagnostic textuel, donc de règles fixes appliquées à des valeurs calculées.
 */

import type { SchoolDiagnostic, TerritorialSummary } from '../../types/education'
import type { DataQualityReport } from '../../types/data-quality'
import type {
  DecisionReport,
  DecisionReportSection,
  DiagnosticResult,
  EngineSettings,
  SimulationResult,
} from '../../types/simulation'
import type { FaitPrinceApplique } from '../../types/prince'
import { LIBELLE_SITUATION } from '../data/situation-familiale'
import { trierParPriorite } from '../analytics/diagnostic'
import { LIBELLE_SOUS_SYSTEME, syntheseTerritoriale } from '../analytics/synthese'
import { LIBELLE_CLASSEMENT, LIBELLE_NATURE, LIBELLE_STATUT_PROPOSITION, LIBELLE_ZONE_SECURITE, ZONES_SECURITE } from '../simulation/libelles'
import { libelleNiveauEnfants } from '../analytics/territory'
import { MENTION_SIMULATION, diagnosticTerritorial, n, pct, pointsAttention, reductionDuDeficit } from '../analytics/narrative'
import { AVERTISSEMENT_SCENARIO_ETENDU, LIBELLE_SCOPE } from '../simulation/scenarios'

export interface ReportInput {
  diagnostic: DiagnosticResult
  diagnosticsFiltres: SchoolDiagnostic[]
  arbre: TerritorialSummary
  qualite: DataQualityReport | null
  resultat: SimulationResult | null
  /** Les trois scénarios géographiques, quand ils ont été calculés. */
  comparaison: SimulationResult[]
  perimetre: string
  settings: EngineSettings
  nbEnseignantsLus: number
  donneesDemonstration: boolean
  /** Décisions de la DRH (fait de Prince) : consignées dans le rapport quand il y en a. */
  faitsPrince?: FaitPrinceApplique[]
}

/** Libellés des critères du barème, pour la section Méthodologie du rapport. */
const LIBELLE_CRITERE_BAREME: Record<string, string> = {
  ancienneteCarriere: 'ancienneté de carrière',
  anciennetePoste: 'ancienneté au poste',
  situationFamiliale: 'situation matrimoniale',
  nbEnfants: "nombre d'enfants",
  formationContinue: 'formation continue',
  ageAjuste: 'âge',
}

const SEVERITE_LABEL: Record<SchoolDiagnostic['severite'], string> = {
  excedent: 'Excédent mobilisable',
  satisfaisant: 'Situation satisfaisante',
  deficit_faible: 'Déficit faible',
  deficit_important: 'Déficit important',
  deficit_critique: 'Déficit critique',
}

export function construireRapport(input: ReportInput): DecisionReport {
  const { diagnostic, diagnosticsFiltres, arbre, qualite, resultat, comparaison, settings } = input
  const totals = arbre.totals
  const sections: DecisionReportSection[] = []

  // 1 — Contexte des données
  sections.push({
    titre: 'Contexte des données',
    paragraphes: [
      `Rapport établi le ${new Date().toLocaleDateString('fr-FR')} pour l'année scolaire ${settings.anneeScolaire}, sur le périmètre : ${input.perimetre}.`,
      input.donneesDemonstration
        ? "Ce rapport a été produit à partir du jeu de démonstration embarqué dans l'application. Ces valeurs sont fictives et ne constituent en aucun cas des statistiques officielles."
        : "Les données proviennent des fichiers importés par l'utilisateur et traités localement, sans transmission vers un service externe.",
      MENTION_SIMULATION,
    ],
  })

  // 2 — Couverture du jeu de données
  sections.push({
    titre: 'Couverture du jeu de données',
    paragraphes: [
      `${n(totals.ecolesAnalysees)} établissements et ${n(input.nbEnseignantsLus)} enseignants sont couverts par cette analyse.`,
    ],
    tableau: {
      entetes: ['Indicateur', 'Valeur'],
      lignes: [
        ['Établissements analysés', n(totals.ecolesAnalysees)],
        ['Classes', n(totals.classes)],
        ["Enseignants payés par l'État", n(totals.enseignantsEtat)],
        ['Autres enseignants', totals.autresEnseignants == null ? 'Non renseigné' : n(totals.autresEnseignants)],
        ['Élèves', totals.effectifTotalEleves == null ? 'Non renseigné' : n(totals.effectifTotalEleves)],
        ['Classes multigrades', n(totals.classesMultigrades)],
      ],
    },
  })

  // 3 — Qualité des données
  if (qualite) {
    const points: string[] = [
      `${n(qualite.ecolesValides)} établissements exploitables sur ${n(qualite.ecolesLues)} lignes lues.`,
      `${n(qualite.enseignantsValides)} enseignants exploitables sur ${n(qualite.enseignantsLus)} lignes lues.`,
      `Complétude territoriale (région, département et commune renseignés) : ${pct(qualite.territorialCompleteness.tauxComplet)}.`,
      ...qualite.errors.map(e => `${n(e.count)} ${e.label} — ${e.consequence}`),
      ...qualite.warnings.map(w => `${n(w.count)} ${w.label} — ${w.consequence}`),
    ]
    sections.push({
      titre: 'Qualité des données',
      paragraphes: [
        `Score de qualité : ${qualite.score} / 100 (${qualite.appreciation}). Ce score part de 100 et retire les points listés ci-dessous.`,
        qualite.donneesElevesDisponibles
          ? "Les effectifs élèves sont disponibles : les indicateurs pédagogiques sont calculés."
          : "Données élèves indisponibles — certains indicateurs pédagogiques ne peuvent pas être calculés.",
      ],
      points,
    })
  }

  // 4 — Situation générale
  sections.push({
    titre: 'Situation générale',
    paragraphes: diagnosticTerritorial(totals, input.nbEnseignantsLus, resultat, input.perimetre).map(e => e.texte),
    tableau: {
      entetes: ['Indicateur', 'Valeur'],
      lignes: [
        ['Établissements en déficit', n(totals.ecolesEnDeficit)],
        ['Établissements avec excédent mobilisable', n(totals.ecolesAvecExcedent)],
        ['Postes nécessaires (besoin calculé)', n(totals.postesNecessaires)],
        ['Salles manquantes (besoin en infrastructures)', n(totals.sallesManquantes)],
        ['Écoles à examiner (maîtres au-delà des salles)', n(totals.ecolesAExaminer)],
        ['Postes officiellement déclarés', totals.postesDeclares == null ? 'Non renseigné' : n(totals.postesDeclares)],
        ['Enseignants potentiellement redéployables', n(totals.excedentMobilisable)],
        ["Élèves par enseignant État", totals.elevesParEnseignantEtat == null ? 'Non renseigné' : totals.elevesParEnseignantEtat.toLocaleString('fr-FR')],
      ],
    },
  })

  // 4 bis — Fait de Prince : décisions de la DRH, consignées telles quelles.
  const decisions = (input.faitsPrince ?? []).filter(e => e.statut === 'applique')
  if (decisions.length > 0) {
    const ordonnees = [...decisions].sort((a, b) => a.fait.decideLe.localeCompare(b.fait.decideLe))
    sections.push({
      titre: 'Fait de Prince — décisions de la DRH',
      paragraphes: [
        `${n(decisions.length)} redéploiement${decisions.length > 1 ? 's' : ''} décidé${decisions.length > 1 ? 's' : ''} par la DRH en dehors de l'algorithme (fait de Prince).`,
        "Ces décisions sont prises en compte comme acquises dans tous les chiffres de ce rapport : les enseignants concernés sont rattachés à leur nouvelle école, les effectifs des écoles d'origine et de destination sont mis à jour, et ces enseignants ne sont jamais remis en mouvement par la simulation. Elles ne sont pas des propositions de l'algorithme.",
      ],
      tableau: {
        entetes: ['Enseignant', 'Matricule', "École d'origine", 'École de destination', 'Date', 'Référence'],
        lignes: ordonnees.map(({ fait }) => [
          fait.enseignant,
          fait.teacherId,
          `${fait.origine.nom} (${fait.origine.commune})`,
          `${fait.destination.nom} (${fait.destination.commune})`,
          new Date(fait.decideLe).toLocaleDateString('fr-FR'),
          fait.reference || '—',
        ]),
      },
    })
  }

  // 4 ter — Agrégation par sous-système, besoin résiduel, recrutement à prévoir (§2.6)
  const synthese = syntheseTerritoriale(diagnosticsFiltres, settings)
  sections.push({
    titre: 'Besoin résiduel et recrutement à prévoir',
    paragraphes: [
      "Les résultats des écoles sont additionnés séparément pour chaque sous-système : l'excédent d'une école n'annule pas le déficit d'une autre, et l'excédent francophone ne couvre pas le besoin anglophone, ni l'inverse.",
      `Recrutement à prévoir = besoin restant après redéploiement + départs imprévisibles attendus, avec un taux d'attrition hors retraite de ${settings.recrutement.tauxAttritionHorsRetraite.toLocaleString('fr-FR')} %.`,
      synthese.degreAlea == null
        ? "Le degré d'aléa ne peut pas être calculé."
        : `Degré d'aléa avant le plan : ${pct(synthese.degreAlea)} de la dotation est mal répartie entre les écoles du périmètre${resultat ? `, ${pct(resultat.syntheseApres.degreAlea ?? 0)} après le scénario retenu` : ''}.`,
    ],
    tableau: {
      entetes: ['Sous-système', 'Besoin B', 'Excédent X', 'Couvrable C', 'Restant R', 'Salles manquantes', 'Recrutement à prévoir'],
      lignes: [
        ...synthese.parSousSysteme.map(g => [
          LIBELLE_SOUS_SYSTEME[g.sousSysteme],
          g.besoin,
          g.excedent,
          g.couvrable,
          g.restant,
          g.sallesManquantes,
          g.recrutementAPrevoir,
        ]),
        ['Total', synthese.besoin, synthese.excedent, synthese.couvrable, synthese.restant, synthese.sallesManquantes, synthese.recrutementAPrevoir],
      ],
    },
  })

  // 4 quater — Zones de sécurité : la zone pèse dans la priorité et règle les affectations en zone rouge.
  const parZone = ZONES_SECURITE.map(z => {
    const ecoles = diagnosticsFiltres.filter(d => (d.school.zoneSecurite ?? 'verte') === z)
    return {
      z,
      ecoles: ecoles.length,
      enDeficit: ecoles.filter(d => d.besoinTheorique > 0).length,
      postesManquants: ecoles.reduce((s, d) => s + d.besoinTheorique, 0),
      restants: resultat ? resultat.uncoveredPosts.filter(p => (p.priorite.zoneSecurite ?? 'verte') === z).length : null,
    }
  })
  const sansZone = diagnosticsFiltres.filter(d => d.school.zoneSecurite === null).length
  const rouge = parZone.find(p => p.z === 'rouge')!
  sections.push({
    titre: 'Zones de sécurité',
    paragraphes: [
      `Chaque école reçoit des points de sécurité selon sa zone (verte ${n(settings.priorite.pointsSecurite.verte)}, jaune ${n(settings.priorite.pointsSecurite.jaune)}, rouge ${n(settings.priorite.pointsSecurite.rouge)}), ajoutés à son poids de vulnérabilité : plus la zone est exposée, plus ses postes sont servis tôt.`,
      settings.mobilite.regleZoneRouge
        ? `Règle de la zone rouge : aucun poste n'y est imposé ni proposé hors vœux. ${n(rouge.ecoles)} école(s) en zone rouge sur ce périmètre, dont ${n(rouge.enDeficit)} en déficit${rouge.restants !== null ? ` ; ${n(rouge.restants)} poste(s) y restent à pourvoir par le volontariat, les primes de zone difficile ou le recrutement` : ''}.`
        : 'La règle de la zone rouge est désactivée dans le référentiel : les postes en zone rouge sont traités comme les autres.',
      ...(sansZone > 0 ? [`${n(sansZone)} école(s) sans zone renseignée sont comptées en zone verte.`] : []),
    ],
    tableau: {
      entetes: ['Zone de sécurité', 'Écoles', 'En déficit', 'Postes manquants', ...(resultat ? ['Restant après le scénario'] : [])],
      lignes: parZone.map(p => [
        LIBELLE_ZONE_SECURITE[p.z],
        n(p.ecoles),
        n(p.enDeficit),
        n(p.postesManquants),
        ...(p.restants !== null ? [n(p.restants)] : []),
      ]),
    },
  })

  // 5 — Besoins territoriaux, au niveau immédiatement sous le périmètre
  const niveauEnfants = libelleNiveauEnfants(arbre)
  const niveauPetitsEnfants = arbre.children[0] ? libelleNiveauEnfants(arbre.children[0]) : 'commune'
  const regions = [...arbre.children].sort((a, b) => b.totals.postesNecessaires - a.totals.postesNecessaires)
  sections.push({
    titre: `Besoins territoriaux — ${niveauEnfants}s`,
    paragraphes: [
      regions.length === 0
        ? "Aucun territoire ne peut être constitué à partir des données disponibles."
        : `${regions.length} ${niveauEnfants}(s) apparaissent sur le périmètre analysé.`,
    ],
    tableau: {
      entetes: [majuscule(niveauEnfants), 'Écoles', 'En déficit', 'Postes nécessaires', 'Excédent mobilisable'],
      lignes: regions.map(r => [
        r.territory.nom,
        r.totals.ecolesAnalysees,
        r.totals.ecolesEnDeficit,
        r.totals.postesNecessaires,
        r.totals.excedentMobilisable,
      ]),
    },
  })

  // 6 — Niveau suivant
  const departements = regions
    .flatMap(r => r.children)
    .sort((a, b) => b.totals.postesNecessaires - a.totals.postesNecessaires)
    .slice(0, 30)
  sections.push({
    titre: `Besoins territoriaux — ${niveauPetitsEnfants}s`,
    paragraphes: [
      departements.length === 0
        ? `Aucun niveau « ${niveauPetitsEnfants} » n'est renseigné dans les données.`
        : `Les ${departements.length} ${niveauPetitsEnfants}s présentant les besoins les plus élevés.`,
    ],
    tableau: {
      entetes: [majuscule(niveauPetitsEnfants), 'Rattachement', 'Écoles', 'Postes nécessaires', 'Excédent mobilisable'],
      lignes: departements.map(d => [
        d.territory.nom,
        d.territory.departement && d.territory.level === 'commune' ? d.territory.departement : d.territory.region ?? '',
        d.totals.ecolesAnalysees,
        d.totals.postesNecessaires,
        d.totals.excedentMobilisable,
      ]),
    },
  })

  // 7 — Excédents mobilisables
  sections.push({
    titre: 'Excédents mobilisables',
    paragraphes: [
      `${n(totals.excedentMobilisable)} enseignants pourraient quitter leur établissement sans le placer en déficit : ce sont les maîtres au-delà de la dotation théorique D = max(P ; m) de leur école.`,
      resultat
        ? `Le vivier effectivement constitué pour le scénario retenu comporte ${n(resultat.pool.teachers.length)} enseignants, répartis dans ${n(resultat.pool.ecolesSources.length)} établissements.`
        : "Aucune simulation n'a encore été exécutée : le vivier n'a pas été constitué.",
    ],
    tableau: resultat
      ? {
          entetes: ['Motif', 'Enseignants écartés du vivier'],
          lignes: resultat.pool.exclusions.map(e => [e.label, e.count]),
        }
      : undefined,
  })

  // 8 — Résultats du scénario
  if (resultat) {
    const paragraphes = [
      `Scénario retenu : ${resultat.scenarioNom} (périmètre ${LIBELLE_SCOPE[resultat.scope].toLowerCase()}).`,
      `${n(resultat.postesCouverts)} postes couverts sur ${n(resultat.besoinInitial)}, soit un taux de couverture de ${pct(resultat.tauxCouverture)}.`,
      `${n(resultat.enseignantsDeplaces)} enseignants seraient déplacés, au bénéfice de ${n(resultat.ecolesBeneficiaires)} établissements, depuis ${n(resultat.ecolesSources)} établissements sources.`,
    ]
    if (resultat.scope === 'etendu') paragraphes.push(AVERTISSEMENT_SCENARIO_ETENDU)

    const recevables = resultat.candidatures.filter(c => c.recevable).length
    paragraphes.push(
      `${n(resultat.candidatures.length)} demandes de mutation, dont ${n(recevables)} recevables (stabilité au poste et école d'attache excédentaire).`,
    )
    sections.push({
      titre: 'Résultats du scénario',
      paragraphes,
      tableau: {
        entetes: ['Nature du mouvement', 'Nombre de propositions'],
        lignes: [
          ...resultat.mouvementsParNature.map(m => [LIBELLE_NATURE[m.nature], m.nombre]),
          ...resultat.mouvementsParPerimetre.map(m => [`dont ${libelleProximite(m.niveau).toLowerCase()}`, m.nombre]),
        ],
      },
    })

    // 8 bis — Plan individualisé (figure 2 du référentiel)
    const plan = [...resultat.assignments].sort((a, b) => a.nomEtabDestination.localeCompare(b.nomEtabDestination, 'fr'))
    sections.push({
      titre: 'Plan individualisé de rotation et de redéploiement',
      paragraphes: [
        "Pour chaque enseignant : l'école d'origine, l'affectation proposée, la nature du mouvement, le vœu satisfait le cas échéant, le statut de validation et l'année prévue. Ce sont des propositions soumises aux commissions.",
        plan.length > 200 ? `Les 200 premières lignes sur ${n(plan.length)} sont reproduites ; l'export Excel contient le plan complet.` : '',
      ].filter(Boolean),
      tableau: {
        entetes: ['Enseignant', 'Matricule', "École d'origine", 'Affectation proposée', 'Nature', 'Vœu', 'Statut', 'Année'],
        lignes: plan.slice(0, 200).map(a => [
          `${a.nomEns} ${a.prenomEns}`.trim(),
          a.teacherId,
          a.nomEtabOrigine,
          a.nomEtabDestination,
          LIBELLE_NATURE[a.nature],
          a.rangVoeu ?? '—',
          LIBELLE_STATUT_PROPOSITION[a.statut],
          a.annee,
        ]),
      },
    })

    // 8 ter — Commission d'arbitrage
    if (resultat.combinaisons.length > 0 || resultat.voeuxAutreSousSysteme.length > 0) {
      sections.push({
        titre: "Propositions à soumettre à la commission d'arbitrage",
        paragraphes: [
          "Écoles restées non couvertes après les vœux et les solutions proches, avec les combinaisons de redéploiement proposées (redéploiement direct, chaîne de mouvements, permutation), par ordre de priorité.",
          resultat.voeuxAutreSousSysteme.length > 0
            ? `${n(resultat.voeuxAutreSousSysteme.length)} vœu(x) portent sur l'autre sous-système : seule la commission peut décider un changement de sous-système.`
            : '',
        ].filter(Boolean),
        points: resultat.combinaisons.slice(0, 40).map(c => `${c.nomEtab} (indice ${c.indicePriorite}) — ${c.description}`),
      })
    }

    // 8 quater — Nouveaux recrutés et projection N+2
    if (resultat.recrutes) {
      sections.push({
        titre: 'Déploiement des nouveaux recrutés',
        paragraphes: [
          `${n(resultat.recrutes.affectations.length)} candidats affectés sur les postes restés vacants, par ordre de note d'admission ; ${n(resultat.recrutes.vivierNational.length)} placés dans le vivier national pour arbitrage ; ${n(resultat.recrutes.postesRestants)} postes restent vacants.`,
        ],
      })
    }
    if (resultat.postesProjetesN2 > 0 || resultat.projectionsN2.length > 0) {
      const projetes = resultat.projectionsN2.filter(p => p.schoolId)
      sections.push({
        titre: 'Projection sur l’année N+2',
        paragraphes: [
          `${n(resultat.postesProjetesN2)} postes projetés en N+2 après les départs prévisibles pendant l'année N+1. ${n(projetes.length)} enseignant(s) resté(s) dans le vivier y trouvent une possibilité, sous réserve de la confirmation des départs et du recalcul des besoins. Une projection n'est pas un engagement.`,
        ],
        tableau: projetes.length
          ? {
              entetes: ['Enseignant', "École d'attache", 'Poste projeté en N+2', 'Vœu'],
              lignes: projetes.slice(0, 50).map(p => [p.nom, p.nomEtabOrigine, p.nomEtab ?? '', p.rangVoeu ?? '—']),
            }
          : undefined,
      })
    }

    // 8 quinquies — Projection pluriannuelle
    sections.push({
      titre: 'Projection de N+1 à N+3',
      paragraphes: [
        `Effectifs après le plan, puis départs à la retraite à ${settings.besoin.ageRetraite} ans ; besoin projeté selon la cible K ; attrition hors retraite de ${settings.recrutement.tauxAttritionHorsRetraite.toLocaleString('fr-FR')} % par an appliquée au territoire, sans recrutement intermédiaire.`,
        resultat.postesZoneRougeNonPourvus > 0
          ? `${n(resultat.postesZoneRougeNonPourvus)} poste(s) en zone rouge restent sans maître : ils relèvent du volontariat, des primes de zone difficile ou du recrutement.`
          : '',
      ].filter(Boolean),
      tableau: {
        entetes: ['Rentrée', 'Sous-système', 'Effectif', 'Retraites', 'Attrition', 'Besoin', 'Excédent', 'Recrutement à prévoir'],
        lignes: resultat.projectionPluriannuelle.territoire.map(t => [
          t.annee, LIBELLE_SOUS_SYSTEME[t.sousSysteme], t.effectif, t.departsRetraite, t.attrition, t.besoin, t.excedent, t.recrutementAPrevoir,
        ]),
      },
    })

    // 9 — Avant / Après
    const reduction = reductionDuDeficit(resultat)
    sections.push({
      titre: 'Avant / Après simulation',
      paragraphes: reduction ? [reduction.texte] : ["La simulation ne réduit pas le déficit total sur ce périmètre."],
      tableau: {
        entetes: ['Indicateur', 'Avant', 'Après', 'Variation'],
        lignes: [
          variation('Établissements en déficit', resultat.before.ecolesEnDeficit, resultat.after.ecolesEnDeficit),
          variation('Postes vacants', resultat.before.postesVacants, resultat.after.postesVacants),
          variation('Déficit total', resultat.before.deficitTotal, resultat.after.deficitTotal),
        ],
      },
    })

    // 10 — Comparaison des scénarios
    if (comparaison.length > 1) {
      sections.push({
        titre: 'Comparaison des scénarios géographiques',
        paragraphes: [
          "Ce tableau présente les conséquences de chaque périmètre. Il n'établit aucun classement : le choix relève d'une décision humaine.",
        ],
        tableau: {
          entetes: ['Indicateur', 'Situation actuelle', ...comparaison.map(c => c.scenarioNom)],
          lignes: [
            ['Postes nécessaires', comparaison[0].besoinInitial, ...comparaison.map(c => c.besoinInitial)],
            ['Postes couverts', 0, ...comparaison.map(c => c.postesCouverts)],
            ['Enseignants déplacés', 0, ...comparaison.map(c => c.enseignantsDeplaces)],
            ['Écoles bénéficiaires', 0, ...comparaison.map(c => c.ecolesBeneficiaires)],
            ['Besoin résiduel', comparaison[0].besoinInitial, ...comparaison.map(c => c.besoinResiduel)],
            ['Taux de couverture', '0 %', ...comparaison.map(c => pct(c.tauxCouverture))],
          ],
        },
      })
    }
  }

  // 11 — Écoles prioritaires
  const prioritaires = trierParPriorite(diagnosticsFiltres.filter(d => d.besoinTheorique > 0)).slice(0, 25)
  sections.push({
    titre: 'Établissements nécessitant une attention particulière',
    paragraphes: [
      prioritaires.length === 0
        ? "Aucun établissement du périmètre ne présente de déficit."
        : `Les ${prioritaires.length} écoles nécessiteuses de plus fort indice de priorité u = w + β (poids de vulnérabilité et points de besoin), puis au REM actuel le plus élevé.`,
    ],
    tableau: {
      entetes: ['Établissement', 'Commune', 'Élèves', 'Maîtres retenus E', 'Cible K', 'Besoin b', 'Salles manquantes', 'Indice u', 'Classement'],
      lignes: prioritaires.map(d => [
        d.school.nom || d.school.id,
        d.school.commune,
        d.calcul.eleves ?? 'Non renseigné',
        d.calcul.enseignantsRetenus,
        d.calcul.cible,
        d.besoinTheorique,
        d.calcul.sallesManquantes,
        d.priorite.indice,
        `${LIBELLE_CLASSEMENT[d.classement]} — ${SEVERITE_LABEL[d.severite].toLowerCase()}`,
      ]),
    },
  })

  // 12 — Postes restant à couvrir
  if (resultat) {
    const parEcole = new Map<string, { nom: string; commune: string; region: string; nb: number }>()
    for (const p of resultat.uncoveredPosts) {
      const courant = parEcole.get(p.schoolId)
      if (courant) courant.nb++
      else parEcole.set(p.schoolId, { nom: p.nomEtab || p.schoolId, commune: p.commune, region: p.region, nb: 1 })
    }
    const lignes = [...parEcole.values()].sort((a, b) => b.nb - a.nb).slice(0, 25)
    sections.push({
      titre: 'Postes restant à couvrir après simulation',
      paragraphes: [
        `${n(resultat.besoinResiduel)} postes ne trouvent pas d'enseignant dans ce scénario. Ils relèvent d'un arbitrage hors redistribution interne.`,
      ],
      tableau: {
        entetes: ['Établissement', 'Commune', 'Région', 'Postes non pourvus'],
        lignes: lignes.map(l => [l.nom, l.commune, l.region, l.nb]),
      },
    })
  }

  // 13 — Méthodologie et hypothèses
  sections.push({
    titre: 'Méthodologie et hypothèses',
    paragraphes: [
      "Règle du besoin (Référentiel technique, §2.4), école par école et section par section pour une école bilingue :",
      `E = enseignants de l'État en poste − départs connus (âge de la retraite fixé à ${settings.besoin.ageRetraite} ans) ; P = ⌈N ÷ ${settings.besoin.elevesParMaitre}⌉${settings.besoin.toleranceArrondi > 0 ? ` avec une tolérance de ${settings.besoin.toleranceArrondi} élèves` : ''} ; m = niveaux ouverts ÷ ${settings.besoin.niveauxParMaitre} ; D = max(P ; m) ; BMAX = salles en simple flux + 2 × salles en double flux${settings.besoin.doubleFluxAutorise ? '' : ' (double flux non autorisé : une salle = un maître)'} ; K = min(D ; BMAX).`,
      "Besoin b = max(0 ; K − E) ; excédent mobilisable x = max(0 ; E − D) ; surnombre a = max(0 ; min(E ; D) − BMAX) ; salles manquantes s = max(0 ; D − BMAX). Sans effectif d'élèves, P se replie sur une classe = un maître, et l'école est signalée.",
      `Les postes à couvrir sont construits à partir de : ${libelleSourcePostes(settings)}. Ils sont classés par indice de priorité u = w + β : poids de vulnérabilité (accessibilité ${settings.priorite.pointsAccessibilite.urbain}/${settings.priorite.pointsAccessibilite.rural}/${settings.priorite.pointsAccessibilite.rural_enclave}, sécurité ${settings.priorite.pointsSecurite.verte}/${settings.priorite.pointsSecurite.jaune}/${settings.priorite.pointsSecurite.rouge}) et points de besoin selon le REM actuel.`,
      `Score de priorité d'un candidat : S = A + Z + B — ancienneté au poste (${settings.mobilite.pointsAncienneteBase} points à ${settings.mobilite.ancienneteDebutPointsAns} ans, +${settings.mobilite.pointsParAnSupplementaire} par an, plafond ${settings.mobilite.plafondAnciennete}, −${settings.mobilite.malusRetraite} à moins de ${settings.mobilite.anneesAvantRetraite} ans de la retraite), service en zone difficile (plafond ${settings.mobilite.plafondZoneDifficile}) et bonification de ${settings.mobilite.bonificationMotif} points pour un motif justifié. Départage : ancienneté générale, âge, rang de tirage.`,
      `Appariement par acceptation différée (Gale et Shapley), vœux examinés ${settings.mobilite.ordreExamen === 'voeux' ? "dans l'ordre choisi par l'enseignant" : 'par poids des écoles'} ; demandes recevables à partir de ${settings.mobilite.stabiliteMinimaleAns} ans de stabilité au poste et depuis une école excédentaire ; départs limités à l'excédent x.`,
      `Seuils de sévérité : déficit faible jusqu'à ${pct(settings.seuilsSeverite.faible)} de la cible K, important jusqu'à ${pct(settings.seuilsSeverite.important)}, critique au-delà.`,
      `Redéploiement obligatoire — ordre des départs dans une école excédentaire selon le barème individuel : ${Object.entries(settings.scoring.poidsBaremeIndividuel)
        .filter(([, poids]) => poids > 0)
        .map(([cle, poids]) => `${LIBELLE_CRITERE_BAREME[cle] ?? cle} (${poids})`)
        .join(', ')}. Points par situation matrimoniale : ${Object.entries(settings.scoring.pointsSituationFamiliale)
        .map(([cle, points]) => `${LIBELLE_SITUATION[cle] ?? cle} ${points}`)
        .join(', ')}.`,
    ],
  })

  // 14 — Points d'attention
  const attention = pointsAttention(diagnosticsFiltres, arbre, qualite)
  if (attention.length > 0) {
    sections.push({
      titre: "Points d'attention",
      paragraphes: [],
      points: attention.map(p => `${p.titre} — ${p.texte}`),
    })
  }

  // 15 — Limites
  sections.push({
    titre: 'Limites',
    paragraphes: [
      "La proximité repose sur l'égalité des libellés de commune, de département et de région déclarés dans les fichiers. Aucune distance réelle n'est calculée.",
      "Le diagnostic reflète l'état des données importées : un établissement absent du fichier est absent de l'analyse.",
      "Les propositions ne tiennent pas compte des situations individuelles non présentes dans les données (santé, contentieux, affectations en cours).",
      "Les décisions de la DRH (fait de Prince) sont appliquées sans contrôle de l'algorithme : le rapport les consigne, il ne les évalue pas.",
      "Les excédents sont calculés à partir des effectifs d'élèves, des niveaux ouverts et des salles déclarés ; un changement de carte scolaire modifie mécaniquement les résultats.",
      "Les taux de stabilité, de rotation et d'intégration du référentiel (§2.5) exigent un historique des mouvements sur plusieurs années : ils ne sont pas calculés à partir d'un seul jeu de données.",
    ],
  })

  // 16 — Mention finale
  sections.push({
    titre: 'Statut de ce document',
    paragraphes: [
      MENTION_SIMULATION,
      "Toute mutation, affectation ou ouverture de poste reste soumise aux procédures administratives en vigueur.",
    ],
  })

  return {
    genereLe: new Date().toISOString(),
    anneeScolaire: settings.anneeScolaire,
    perimetre: input.perimetre,
    sections,
  }
}

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1)
}

function variation(label: string, avant: number, apres: number): (string | number)[] {
  const delta = apres - avant
  const signe = delta > 0 ? '+' : ''
  const relatif = avant > 0 ? ` (${signe}${Math.round((delta / avant) * 100)} %)` : ''
  return [label, avant, apres, `${signe}${delta}${relatif}`]
}

function libelleSourcePostes(settings: EngineSettings): string {
  if (settings.sourceDesPostes === 'postesDeclares') return 'les postes officiellement déclarés dans le fichier'
  if (settings.sourceDesPostes === 'maximum') return 'le maximum entre le besoin calculé et les postes déclarés'
  return 'le besoin calculé école par école'
}

function libelleProximite(niveau: string): string {
  switch (niveau) {
    case 'meme_commune':
      return 'À l’intérieur de la commune'
    case 'meme_departement':
      return 'Entre communes du même département'
    case 'meme_region':
      return 'Entre départements de la même région'
    default:
      return "Entre régions"
  }
}
