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
      `${n(totals.excedentMobilisable)} enseignants pourraient quitter leur établissement sans le placer en déficit, au regard de la règle « ${libelleMinimum(settings)} ».`,
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

    sections.push({
      titre: 'Résultats du scénario',
      paragraphes,
      tableau: {
        entetes: ['Périmètre du mouvement', 'Nombre de propositions'],
        lignes: resultat.mouvementsParPerimetre.map(m => [libelleProximite(m.niveau), m.nombre]),
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
        : `Les ${prioritaires.length} établissements présentant les déficits les plus élevés, puis la pression élèves la plus forte.`,
    ],
    tableau: {
      entetes: ['Établissement', 'Commune', 'Classes', 'Enseignants État', 'Déficit', 'Élèves/enseignant État', 'Situation'],
      lignes: prioritaires.map(d => [
        d.school.nom || d.school.id,
        d.school.commune,
        d.nbClasses,
        d.enseignantsEtat,
        d.besoinTheorique,
        d.elevesParEnseignantEtat ?? 'Non renseigné',
        SEVERITE_LABEL[d.severite],
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
      `Besoin d'un établissement = max(0 ; nombre de classes × ${settings.normeEncadrement.enseignantsParClasse} − enseignants payés par l'État).`,
      `Minimum à conserver = ${libelleMinimum(settings)}. Excédent mobilisable = max(0 ; enseignants État − minimum à conserver).`,
      `Les postes à couvrir sont construits à partir de : ${libelleSourcePostes(settings)}.`,
      settings.referentielEleves.cible == null
        ? "Aucune cible « élèves par enseignant » n'est configurée : la pression pédagogique n'est pas calculée."
        : `Cible « élèves par enseignant » configurée : ${settings.referentielEleves.cible} (année ${settings.referentielEleves.annee || 'non précisée'}, source : ${settings.referentielEleves.source || 'non précisée'}).`,
      `Seuils de sévérité : déficit faible jusqu'à ${pct(settings.seuilsSeverite.faible)} du besoin normatif, important jusqu'à ${pct(settings.seuilsSeverite.important)}, critique au-delà.`,
      `Barème individuel : ${Object.entries(settings.scoring.poidsBaremeIndividuel)
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
      "Les excédents sont calculés à partir du nombre de classes déclaré ; un changement de carte scolaire modifie mécaniquement les résultats.",
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

function libelleMinimum(settings: EngineSettings): string {
  const r = settings.minimumAConserver
  if (r.mode === 'ratioClasses') return `${r.ratio} × nombre de classes (arrondi)`
  if (r.mode === 'valeurFixe') return `${r.valeurFixe} enseignant(s) par établissement`
  return 'nombre de classes'
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
