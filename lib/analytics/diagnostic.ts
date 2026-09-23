/**
 * MOTEUR A — Diagnostic des ressources.
 *
 * Ce moteur ne propose aucune affectation. Il répond uniquement à :
 * où existe-t-il un déficit, où existe-t-il un excédent, combien de postes sont
 * nécessaires, et combien d'enseignants sont potentiellement mobilisables sans
 * mettre leur école d'origine en difficulté.
 *
 * Règles fondamentales (§1 du cahier des charges) :
 *   besoinNormatif   = nbClasses × enseignantsParClasse   (paramétrable)
 *   besoinTheorique  = max(0, besoinNormatif − enseignantsEtat)
 *   minimumAConserver = nbClasses (par défaut, paramétrable)
 *   excedentTheorique = max(0, enseignantsEtat − minimumAConserver)
 *
 * Les postes officiellement déclarés (`nb_postes_ouverts`) ne sont jamais
 * écrasés : ils sont conservés tels quels et l'écart avec le besoin calculé est
 * exposé séparément.
 */

import type {
  DiagnosticReason,
  School,
  SchoolDiagnostic,
  SchoolSeverity,
  TerritorialTotals,
} from '../../types/education'
import type { DiagnosticResult, EngineSettings } from '../../types/simulation'
import { ratio, round2 } from '../data/normalize'

/** Besoin normatif brut de l'école, avant déduction des enseignants présents. */
export function besoinNormatif(school: School, settings: EngineSettings): number {
  const parClasse = settings.normeEncadrement.enseignantsParClasse
  if (!Number.isFinite(parClasse) || parClasse <= 0) return school.nbClasses
  return Math.round(school.nbClasses * parClasse)
}

/**
 * Nombre d'enseignants que l'école doit conserver en toutes circonstances.
 * C'est ce seuil qui borne l'excédent mobilisable : le moteur de simulation ne
 * peut jamais faire descendre une école source en dessous.
 */
export function minimumAConserver(school: School, settings: EngineSettings): number {
  const regle = settings.minimumAConserver
  switch (regle.mode) {
    case 'ratioClasses':
      return Math.max(0, Math.round(school.nbClasses * regle.ratio))
    case 'valeurFixe':
      return Math.max(0, Math.round(regle.valeurFixe))
    case 'nbClasses':
    default:
      return Math.max(0, school.nbClasses)
  }
}

export function besoinTheorique(school: School, settings: EngineSettings): number {
  return Math.max(0, besoinNormatif(school, settings) - school.nbEnseignantsEtat)
}

export function excedentTheorique(school: School, settings: EngineSettings): number {
  return Math.max(0, school.nbEnseignantsEtat - minimumAConserver(school, settings))
}

/** Classe la situation d'une école selon les seuils configurés. */
export function severite(
  besoin: number,
  excedent: number,
  deficitRelatif: number | null,
  settings: EngineSettings,
): SchoolSeverity {
  if (besoin <= 0) return excedent > 0 ? 'excedent' : 'satisfaisant'
  if (deficitRelatif == null) return 'deficit_important'
  if (deficitRelatif <= settings.seuilsSeverite.faible) return 'deficit_faible'
  if (deficitRelatif <= settings.seuilsSeverite.important) return 'deficit_important'
  return 'deficit_critique'
}

/** Calcule le diagnostic d'un établissement, sans les raisons de priorisation. */
export function computeSchoolDiagnostic(school: School, settings: EngineSettings): SchoolDiagnostic {
  const normatif = besoinNormatif(school, settings)
  const minimum = minimumAConserver(school, settings)
  const besoin = Math.max(0, normatif - school.nbEnseignantsEtat)
  const excedent = Math.max(0, school.nbEnseignantsEtat - minimum)

  const totalEnseignants = school.nbEnseignantsEtat + (school.nbAutresEnseignants ?? 0)
  const eleves = school.effectifTotalEleves

  const elevesParEnseignant = ratio(eleves, totalEnseignants > 0 ? totalEnseignants : null)
  const elevesParEnseignantEtat = ratio(eleves, school.nbEnseignantsEtat > 0 ? school.nbEnseignantsEtat : null)
  const elevesParClasse = ratio(eleves, school.nbClasses > 0 ? school.nbClasses : null)

  const niveaux = Object.values(school.effectifParNiveau)
  const effectifMoyenParNiveau = niveaux.length > 0 ? niveaux.reduce((a, b) => a + b, 0) / niveaux.length : null

  const cible = settings.referentielEleves.cible
  const pressionPedagogique =
    cible != null && cible > 0 && elevesParEnseignantEtat != null ? elevesParEnseignantEtat / cible : null

  const deficitRelatif = normatif > 0 ? besoin / normatif : null

  return {
    school,
    nbClasses: school.nbClasses,
    enseignantsEtat: school.nbEnseignantsEtat,
    enseignantsMinimumAConserver: minimum,
    besoinTheorique: besoin,
    postesDeclares: school.nbPostesOuvertsDeclares,
    ecartBesoinDeclare: school.nbPostesOuvertsDeclares == null ? null : school.nbPostesOuvertsDeclares - besoin,
    excedentTheorique: excedent,

    elevesParEnseignant: elevesParEnseignant == null ? null : round2(elevesParEnseignant),
    elevesParEnseignantEtat: elevesParEnseignantEtat == null ? null : round2(elevesParEnseignantEtat),
    elevesParClasse: elevesParClasse == null ? null : round2(elevesParClasse),
    effectifMoyenParNiveau: effectifMoyenParNiveau == null ? null : round2(effectifMoyenParNiveau),
    pressionPedagogique: pressionPedagogique == null ? null : round2(pressionPedagogique),

    deficitAbsolu: besoin,
    deficitRelatif: deficitRelatif == null ? null : round2(deficitRelatif),
    severite: severite(besoin, excedent, deficitRelatif, settings),
    raisons: [],
  }
}

/** Médiane d'une série, `null` si la série est vide. */
function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

/** Repères calculés sur l'ensemble du jeu de données, pour situer une école. */
interface ReperesNationaux {
  medianeEffectif: number | null
  medianeElevesParEnseignantEtat: number | null
}

/**
 * Construit les raisons factuelles qui expliquent la présence d'une école dans
 * les priorités (§9). Chaque raison découle d'une valeur calculée : aucune
 * justification n'est produite quand la donnée correspondante est absente.
 */
export function raisonsPriorite(d: SchoolDiagnostic, reperes: ReperesNationaux): DiagnosticReason[] {
  const raisons: DiagnosticReason[] = []

  if (d.besoinTheorique > 0) {
    const s = d.besoinTheorique > 1 ? 's' : ''
    raisons.push({
      code: 'deficit',
      texte: `Déficit de ${d.besoinTheorique} enseignant${s} : ${d.enseignantsEtat} en poste pour ${d.nbClasses} classe${d.nbClasses > 1 ? 's' : ''}.`,
    })
  }

  if (d.pressionPedagogique != null && d.pressionPedagogique > 1 && d.elevesParEnseignantEtat != null) {
    raisons.push({
      code: 'pression_eleves',
      texte: `Pression élèves / enseignant État de ${d.elevesParEnseignantEtat.toLocaleString('fr-FR')}, soit ${Math.round((d.pressionPedagogique - 1) * 100)} % au-dessus de la cible configurée.`,
    })
  } else if (
    d.elevesParEnseignantEtat != null &&
    reperes.medianeElevesParEnseignantEtat != null &&
    d.elevesParEnseignantEtat > reperes.medianeElevesParEnseignantEtat * 1.5
  ) {
    raisons.push({
      code: 'pression_eleves',
      texte: `Pression élèves / enseignant État de ${d.elevesParEnseignantEtat.toLocaleString('fr-FR')}, contre ${round2(reperes.medianeElevesParEnseignantEtat).toLocaleString('fr-FR')} pour la médiane du jeu de données.`,
    })
  }

  if (
    d.school.effectifTotalEleves != null &&
    reperes.medianeEffectif != null &&
    d.school.effectifTotalEleves > reperes.medianeEffectif * 2
  ) {
    raisons.push({
      code: 'effectif_eleve',
      texte: `Effectif de ${d.school.effectifTotalEleves.toLocaleString('fr-FR')} élèves, plus du double de la médiane du jeu de données (${reperes.medianeEffectif.toLocaleString('fr-FR')}).`,
    })
  }

  if (d.school.classesMultigrades > 0 && d.besoinTheorique > 0) {
    const s = d.school.classesMultigrades > 1 ? 's' : ''
    raisons.push({
      code: 'classes_multigrades',
      texte: `${d.school.classesMultigrades} classe${s} multigrade${s} déclarée${s} dans un établissement en déficit.`,
    })
  }

  if (d.school.prioriteLocale > 0 && d.school.prioriteLocale <= 3) {
    raisons.push({
      code: 'priorite_locale',
      texte: `Priorité locale déclarée au rang ${d.school.prioriteLocale} dans le fichier source.`,
    })
  }

  if (d.ecartBesoinDeclare != null && d.ecartBesoinDeclare !== 0) {
    const sens = d.ecartBesoinDeclare > 0 ? 'de plus que' : 'de moins que'
    raisons.push({
      code: 'ecart_postes_declares',
      texte: `${Math.abs(d.ecartBesoinDeclare)} poste(s) déclaré(s) ${sens} le besoin calculé (${d.postesDeclares} déclarés, ${d.besoinTheorique} calculés).`,
    })
  }

  return raisons
}

/** Additionne les diagnostics d'un ensemble d'écoles en totaux territoriaux. */
export function agregerTotaux(diagnostics: SchoolDiagnostic[]): TerritorialTotals {
  let classes = 0
  let enseignantsEtat = 0
  let autresEnseignants: number | null = null
  let postesNecessaires = 0
  let postesDeclares: number | null = null
  let excedentMobilisable = 0
  let effectifTotalEleves: number | null = null
  let classesMultigrades = 0
  let ecolesEnDeficit = 0
  let ecolesAvecExcedent = 0
  let ecolesSatisfaisantes = 0

  for (const d of diagnostics) {
    classes += d.nbClasses
    enseignantsEtat += d.enseignantsEtat
    if (d.school.nbAutresEnseignants != null) autresEnseignants = (autresEnseignants ?? 0) + d.school.nbAutresEnseignants
    postesNecessaires += d.besoinTheorique
    if (d.postesDeclares != null) postesDeclares = (postesDeclares ?? 0) + d.postesDeclares
    excedentMobilisable += d.excedentTheorique
    if (d.school.effectifTotalEleves != null) effectifTotalEleves = (effectifTotalEleves ?? 0) + d.school.effectifTotalEleves
    classesMultigrades += d.school.classesMultigrades
    if (d.besoinTheorique > 0) ecolesEnDeficit++
    if (d.excedentTheorique > 0) ecolesAvecExcedent++
    if (d.besoinTheorique === 0) ecolesSatisfaisantes++
  }

  const elevesParEnseignantEtat = ratio(effectifTotalEleves, enseignantsEtat > 0 ? enseignantsEtat : null)
  const elevesParClasse = ratio(effectifTotalEleves, classes > 0 ? classes : null)

  return {
    ecolesAnalysees: diagnostics.length,
    ecolesEnDeficit,
    ecolesAvecExcedent,
    ecolesSatisfaisantes,
    classes,
    enseignantsEtat,
    autresEnseignants,
    postesNecessaires,
    postesDeclares,
    excedentMobilisable,
    effectifTotalEleves,
    elevesParEnseignantEtat: elevesParEnseignantEtat == null ? null : round2(elevesParEnseignantEtat),
    elevesParClasse: elevesParClasse == null ? null : round2(elevesParClasse),
    classesMultigrades,
  }
}

/**
 * Exécute le diagnostic complet. Les écoles sans identifiant ou sans classe
 * exploitable sont écartées du calcul : elles restent visibles dans le rapport
 * qualité, mais elles ne doivent pas fausser les totaux.
 */
export function runDiagnostic(schools: School[], settings: EngineSettings): DiagnosticResult {
  const exploitables = schools.filter(s => s.id !== '' && s.nbClasses > 0 && s.nbEnseignantsEtat >= 0)

  // Une école ne doit apparaître qu'une fois : en cas de doublon d'identifiant,
  // seule la première ligne est retenue, et le doublon est signalé côté qualité.
  const vus = new Set<string>()
  const uniques = exploitables.filter(s => {
    if (vus.has(s.id)) return false
    vus.add(s.id)
    return true
  })

  const bruts = uniques.map(s => computeSchoolDiagnostic(s, settings))

  const reperes: ReperesNationaux = {
    medianeEffectif: mediane(bruts.map(d => d.school.effectifTotalEleves).filter((v): v is number => v != null)),
    medianeElevesParEnseignantEtat: mediane(bruts.map(d => d.elevesParEnseignantEtat).filter((v): v is number => v != null)),
  }

  const diagnostics = bruts.map(d => ({ ...d, raisons: raisonsPriorite(d, reperes) }))

  const bySchoolId: Record<string, SchoolDiagnostic> = {}
  const besoins: Record<string, number> = {}
  const excedents: Record<string, number> = {}
  for (const d of diagnostics) {
    bySchoolId[d.school.id] = d
    if (d.besoinTheorique > 0) besoins[d.school.id] = d.besoinTheorique
    if (d.excedentTheorique > 0) excedents[d.school.id] = d.excedentTheorique
  }

  return {
    settings,
    schools: diagnostics,
    bySchoolId,
    besoins,
    excedents,
    totals: agregerTotaux(diagnostics),
    donneesElevesDisponibles: diagnostics.some(d => d.school.effectifTotalEleves != null),
  }
}

/**
 * Trie les écoles par ordre de priorité d'attention : déficit absolu, puis
 * pression pédagogique, puis classes multigrades, puis priorité locale.
 * Tri purement descriptif — il n'engage aucune décision.
 */
export function trierParPriorite(diagnostics: SchoolDiagnostic[]): SchoolDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    if (b.deficitAbsolu !== a.deficitAbsolu) return b.deficitAbsolu - a.deficitAbsolu
    const pa = a.elevesParEnseignantEtat ?? -1
    const pb = b.elevesParEnseignantEtat ?? -1
    if (pb !== pa) return pb - pa
    if (b.school.classesMultigrades !== a.school.classesMultigrades) {
      return b.school.classesMultigrades - a.school.classesMultigrades
    }
    const la = a.school.prioriteLocale > 0 ? a.school.prioriteLocale : 999
    const lb = b.school.prioriteLocale > 0 ? b.school.prioriteLocale : 999
    return la - lb
  })
}
