/**
 * MOTEUR A — Diagnostic des besoins (Référentiel technique, §2.1 à §2.4).
 *
 * Ce moteur ne propose aucune affectation. Il calcule, école par école — et
 * section par section pour une école bilingue —, combien de maîtres il faut,
 * combien les salles permettent d'en affecter, ce qui manque et ce qui est de
 * trop. Dans l'ordre du référentiel :
 *
 *   E    = enseignants de l'État en poste − départs connus (retraites…)
 *   P    = ⌈N ÷ 60⌉                         maîtres selon la norme
 *   m    = minimum pédagogique              niveaux ouverts ÷ niveaux par maître
 *   D    = max(P ; m)                       dotation théorique
 *   BMAX = S_SF + 2 × S_DF                  maîtres affectables selon les salles
 *   K    = min(D ; BMAX)                    cible réellement affectable
 *   b    = max(0 ; K − E)                   besoin : postes à ouvrir
 *   x    = max(0 ; E − D)                   excédent mobilisable
 *   a    = max(0 ; min(E ; D) − BMAX)       surnombre lié aux salles
 *   s    = max(0 ; D − BMAX)                salles manquantes
 *
 * Le besoin se mesure par rapport à la cible K (ce que les salles permettent
 * d'affecter) ; l'excédent par rapport à la dotation D (ce dont les élèves ont
 * besoin). Un maître n'est mobilisable que s'il est de trop pour les élèves, pas
 * seulement pour les salles.
 *
 * Les postes officiellement déclarés (`nb_postes_ouverts`) ne sont jamais
 * écrasés : l'écart avec le besoin calculé est exposé séparément.
 */

import type {
  CalculBesoin,
  ClassementEcole,
  DiagnosticReason,
  PrioriteEcole,
  School,
  SchoolDiagnostic,
  SchoolSeverity,
  Teacher,
  TerritorialTotals,
} from '../../types/education'
import type { DiagnosticResult, EngineSettings, ReglesPriorite } from '../../types/simulation'
import { dateRentree } from '../config/settings'
import { ageFromBirthDate, ratio, round2 } from '../data/normalize'
import { STATUTS_EXCLUS } from '../data/parse'

// --- Départs connus -------------------------------------------------------------

const UNE_ANNEE_MS = 365.25 * 24 * 3600 * 1000

/**
 * Âge d'un enseignant à une date donnée : exact à partir de sa date de naissance ;
 * sinon, quand le fichier ne donne que l'âge (colonne « Age »), cet âge, lu à la
 * date du jour, est avancé jusqu'à la date demandée.
 */
export function ageA(t: Teacher, date: Date, aujourdhui: Date = new Date()): number | null {
  if (t.dateNaissance) return ageFromBirthDate(t.dateNaissance, date)
  if (t.age == null) return null
  return t.age + Math.max(0, date.getTime() - aujourdhui.getTime()) / UNE_ANNEE_MS
}

/** Vrai si l'enseignant tient une classe dans l'effectif E : payé par l'État et en activité. */
function compteDansEffectif(t: Teacher): boolean {
  return t.payeParEtat && !STATUTS_EXCLUS.has(t.statut)
}

/**
 * Départs à la retraite connus pour la rentrée préparée, par école : enseignants
 * qui auront atteint l'âge de la retraite au 1er septembre de l'année du plan.
 */
export function retraitesParEcole(teachers: Teacher[], settings: EngineSettings, decalageAns = 0): Map<string, number> {
  const date = dateRentree(settings.anneeScolaire, decalageAns)
  const parEcole = new Map<string, number>()
  for (const t of teachers) {
    if (!compteDansEffectif(t) || !t.idEtabAttache) continue
    const age = ageA(t, date)
    if (age != null && age >= settings.besoin.ageRetraite) parEcole.set(t.idEtabAttache, (parEcole.get(t.idEtabAttache) ?? 0) + 1)
  }
  return parEcole
}

/** Vrai si l'enseignant part à la retraite avant la rentrée préparée. */
export function partALaRetraite(t: Teacher, settings: EngineSettings, decalageAns = 0): boolean {
  const age = ageA(t, dateRentree(settings.anneeScolaire, decalageAns))
  return age != null && age >= settings.besoin.ageRetraite
}

// --- Règle du besoin -------------------------------------------------------------

/** Niveaux ouverts : déclarés, sinon niveaux ayant des élèves, sinon classes dans la limite des 6 niveaux. */
export function niveauxOuverts(school: School): number {
  if (school.niveauxOuverts != null && school.niveauxOuverts > 0) return Math.min(6, school.niveauxOuverts)
  const niveaux = Object.values(school.effectifParNiveau).filter(v => v > 0).length
  if (niveaux > 0) return niveaux
  // Sans classe ni niveau renseigné (format MINEDUB), l'école est supposée complète : 6 niveaux.
  return school.nbClasses > 0 ? Math.min(6, school.nbClasses) : 6
}

/**
 * m : maîtres nécessaires aux niveaux ouverts.
 *
 * Quand le fichier renseigne les classes multigrades et que la règle école par
 * école est retenue, une école sans classe multigrade a un maître par niveau, et
 * chaque classe multigrade économise un maître, sans descendre sous le regroupement
 * maximal (3 maîtres pour 6 niveaux regroupés deux à deux). Sinon, le regroupement
 * paramétré s'applique uniformément.
 */
export function minimumPedagogique(school: School, settings: EngineSettings): number {
  const parMaitre = Math.max(1, Math.round(settings.besoin.niveauxParMaitre))
  const niveaux = niveauxOuverts(school)
  const regroupe = Math.ceil(niveaux / parMaitre)
  if (!settings.besoin.minimumSelonMultigrades || !school.classesMultigradesRenseignees) return regroupe
  // Moins de classes que de niveaux : les niveaux sont regroupés, même si le fichier ne le dit pas.
  const regroupements = Math.max(school.classesMultigrades, school.nbClasses > 0 ? niveaux - school.nbClasses : 0)
  return Math.max(regroupe, niveaux - Math.max(0, regroupements))
}

/** P : maîtres nécessaires selon la norme d'élèves par maître, avec la tolérance d'arrondi. */
export function normeEleves(eleves: number, settings: EngineSettings): number {
  const norme = settings.besoin.elevesParMaitre > 0 ? settings.besoin.elevesParMaitre : 60
  if (eleves <= 0) return 0
  const tolerance = Math.max(0, settings.besoin.toleranceArrondi)
  if (tolerance === 0) return Math.ceil(eleves / norme)
  return Math.max(1, Math.ceil((eleves - tolerance) / norme))
}

/** BMAX : une salle en simple flux compte pour un maître, en double flux pour deux. `null` si les salles manquent. */
export function bmax(school: School, settings: EngineSettings): number | null {
  if (school.nbSallesClasse == null) return null
  const salles = Math.max(0, school.nbSallesClasse)
  const doubleFlux = settings.besoin.doubleFluxAutorise ? Math.min(salles, Math.max(0, school.sallesDoubleFlux ?? 0)) : 0
  return salles + doubleFlux
}

/**
 * Calcule toutes les grandeurs du besoin d'une école. `departs` : départs connus
 * à déduire de l'effectif ; s'ils ne sont pas fournis, ceux déclarés dans le
 * fichier sont utilisés.
 */
export function calculerBesoin(school: School, settings: EngineSettings, departs?: number): CalculBesoin {
  const enPoste = Math.max(0, school.nbEnseignantsEtat)
  const departsConnus = settings.besoin.deduireDepartsConnus
    ? Math.min(enPoste, Math.max(0, departs ?? school.departsConnusDeclares ?? 0))
    : 0
  const E = enPoste - departsConnus
  const eleves = school.effectifTotalEleves != null && school.effectifTotalEleves >= 0 ? school.effectifTotalEleves : null

  const methode: CalculBesoin['methode'] = eleves != null ? 'norme_eleves' : 'repli_classes'
  const P =
    eleves != null
      ? normeEleves(eleves, settings)
      : Math.round(Math.max(0, school.nbClasses) * Math.max(0, settings.besoin.enseignantsParClasseRepli))
  const m = minimumPedagogique(school, settings)
  const D = Math.max(P, m)
  const B = bmax(school, settings)
  const K = B == null ? D : Math.min(D, B)

  return {
    eleves,
    enseignantsEnPoste: enPoste,
    departsConnus,
    enseignantsRetenus: E,
    norme: P,
    minimumPedagogique: m,
    dotation: D,
    bmax: B,
    cible: K,
    besoin: Math.max(0, K - E),
    excedent: Math.max(0, E - D),
    surnombre: B == null ? 0 : Math.max(0, Math.min(E, D) - B),
    sallesManquantes: B == null ? 0 : Math.max(0, D - B),
    remActuel: eleves != null && enPoste > 0 ? round2(eleves / enPoste) : null,
    methode,
  }
}

/** Classement d'une école selon les résultats du calcul (§2.4). */
export function classer(c: CalculBesoin): ClassementEcole {
  if (c.besoin > 0) return 'necessiteuse'
  if (c.excedent > 0) return 'excedentaire'
  if (c.surnombre > 0) return 'a_examiner'
  return 'equilibree'
}

/** b : besoin en maîtres de l'école. */
export function besoinTheorique(school: School, settings: EngineSettings, departs?: number): number {
  return calculerBesoin(school, settings, departs).besoin
}

/** x : excédent mobilisable de l'école. */
export function excedentTheorique(school: School, settings: EngineSettings, departs?: number): number {
  return calculerBesoin(school, settings, departs).excedent
}

// --- Poids de vulnérabilité et indice de priorité (§3.1) ----------------------------

/** Accessibilité retenue : déclarée, sinon déduite de la zone. */
export function accessibiliteDe(school: School): 'urbain' | 'semi_urbain' | 'rural' | 'rural_enclave' {
  if (school.accessibilite) return school.accessibilite
  if (school.zone === 'rurale') return 'rural'
  return school.zone === 'semi_urbaine' ? 'semi_urbain' : 'urbain'
}

export function niveauDifficulte(poids: number, regles: ReglesPriorite): 1 | 2 | 3 {
  if (poids >= regles.seuilNiveau1) return 1
  if (poids >= regles.seuilNiveau2) return 2
  return 3
}

/** β : 0 jusqu'à un REM de 80, 5 jusqu'à 100, 10 jusqu'à 150, 15 au-delà ou pour une école sans maître. */
export function pointsBesoin(remActuel: number | null, enseignantsEnPoste: number, eleves: number | null, regles: ReglesPriorite): number {
  if (enseignantsEnPoste === 0 && (eleves ?? 0) > 0) return regles.pointsBesoinAuDela
  if (remActuel == null) return 0
  for (const tranche of [...regles.tranchesBesoin].sort((a, b) => a.remMax - b.remMax)) {
    if (remActuel <= tranche.remMax) return tranche.points
  }
  return regles.pointsBesoinAuDela
}

export function calculerPriorite(school: School, settings: EngineSettings, calcul: CalculBesoin | null): PrioriteEcole {
  const regles = settings.priorite
  const alpha = regles.pointsAccessibilite[accessibiliteDe(school)]
  const sigma = regles.pointsSecurite[school.zoneSecurite ?? 'verte']
  // w = α + σ avec les coefficients par défaut (1 et 1) ; des coefficients différents
  // doivent rester cohérents avec les seuils des niveaux de difficulté.
  const poids = Math.round((regles.coefAccessibilite * alpha + regles.coefSecurite * sigma) * 100) / 100
  const beta = school.estStructure || !calcul ? 0 : pointsBesoin(calcul.remActuel, calcul.enseignantsEnPoste, calcul.eleves, regles)
  return {
    pointsAccessibilite: alpha,
    pointsSecurite: sigma,
    poids,
    niveauDifficulte: niveauDifficulte(poids, regles),
    pointsBesoin: beta,
    indice: poids + beta,
    zoneRouge: school.zoneSecurite === 'rouge',
  }
}

// --- Diagnostic d'une école ----------------------------------------------------------

/** Classe la gravité d'un besoin selon les seuils configurés (besoin rapporté à la cible). */
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
export function computeSchoolDiagnostic(school: School, settings: EngineSettings, departs?: number): SchoolDiagnostic {
  const calcul = calculerBesoin(school, settings, departs)
  const besoin = calcul.besoin
  const excedent = calcul.excedent

  const totalEnseignants = school.nbEnseignantsEtat + (school.nbAutresEnseignants ?? 0)
  const eleves = school.effectifTotalEleves

  const elevesParEnseignant = ratio(eleves, totalEnseignants > 0 ? totalEnseignants : null)
  const elevesParEnseignantEtat = ratio(eleves, school.nbEnseignantsEtat > 0 ? school.nbEnseignantsEtat : null)
  const elevesParClasse = ratio(eleves, school.nbClasses > 0 ? school.nbClasses : null)

  const niveaux = Object.values(school.effectifParNiveau)
  const effectifMoyenParNiveau = niveaux.length > 0 ? niveaux.reduce((a, b) => a + b, 0) / niveaux.length : null

  const norme = settings.besoin.elevesParMaitre
  const pressionPedagogique = norme > 0 && elevesParEnseignantEtat != null ? elevesParEnseignantEtat / norme : null

  const deficitRelatif = calcul.cible > 0 ? besoin / calcul.cible : null

  return {
    school,
    nbClasses: school.nbClasses,
    enseignantsEtat: calcul.enseignantsRetenus,
    enseignantsMinimumAConserver: calcul.dotation,
    besoinTheorique: besoin,
    postesDeclares: school.nbPostesOuvertsDeclares,
    ecartBesoinDeclare: school.nbPostesOuvertsDeclares == null ? null : school.nbPostesOuvertsDeclares - besoin,
    excedentTheorique: excedent,
    calcul,
    classement: classer(calcul),
    priorite: calculerPriorite(school, settings, calcul),

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

const fr = (n: number) => n.toLocaleString('fr-FR')
const pluriel = (n: number, mot: string) => `${fr(n)} ${mot}${n > 1 ? 's' : ''}`

/**
 * Raisons factuelles qui expliquent la situation d'une école. Chaque raison
 * découle d'une valeur calculée : aucune justification n'est produite quand la
 * donnée correspondante est absente.
 */
export function raisonsPriorite(d: SchoolDiagnostic): DiagnosticReason[] {
  const raisons: DiagnosticReason[] = []
  const c = d.calcul

  if (c.besoin > 0) {
    const plafond = c.bmax != null && c.bmax < c.dotation ? `, plafonnée à ${fr(c.cible)} par les salles` : ''
    raisons.push({
      code: 'deficit',
      texte: `Besoin de ${pluriel(c.besoin, 'maître')} : ${fr(c.enseignantsRetenus)} retenu(s) à la rentrée pour une cible de ${fr(c.cible)}${plafond}.`,
    })
  }

  if (c.departsConnus > 0) {
    raisons.push({
      code: 'deficit',
      texte: `${pluriel(c.departsConnus, 'départ')} connu(s) à la rentrée (retraite) déduit(s) de l'effectif.`,
    })
  }

  if (c.remActuel != null && d.pressionPedagogique != null && d.pressionPedagogique > 1) {
    raisons.push({
      code: 'pression_eleves',
      texte: `REM actuel de ${fr(c.remActuel)} élèves par maître, au-dessus de la norme de ${fr(Math.round(c.remActuel / d.pressionPedagogique))}.`,
    })
  }

  if (c.sallesManquantes > 0) {
    raisons.push({
      code: 'effectif_eleve',
      texte: `${pluriel(c.sallesManquantes, 'salle')} manquante(s) pour atteindre la dotation de ${fr(c.dotation)} maîtres : besoin en infrastructures.`,
    })
  }

  if (c.surnombre > 0) {
    raisons.push({
      code: 'effectif_eleve',
      texte: `${pluriel(c.surnombre, 'maître')} au-delà des salles, mais utile(s) aux élèves : à examiner (passage au double flux), pas à redéployer.`,
    })
  }

  if (d.school.classesMultigrades > 0 && c.besoin > 0) {
    raisons.push({
      code: 'classes_multigrades',
      texte: `${pluriel(d.school.classesMultigrades, 'classe')} multigrade(s) déclarée(s) dans une école nécessiteuse.`,
    })
  }

  if (d.priorite.niveauDifficulte < 3) {
    raisons.push({
      code: 'priorite_locale',
      texte: `École de niveau de difficulté ${d.priorite.niveauDifficulte} (poids de vulnérabilité ${fr(d.priorite.poids)})${d.priorite.zoneRouge ? ', en zone rouge' : ''}.`,
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

/** Additionne les diagnostics d'un ensemble d'écoles en totaux territoriaux (écrêtage avant addition). */
export function agregerTotaux(diagnostics: SchoolDiagnostic[]): TerritorialTotals {
  let classes = 0
  let enseignantsEtat = 0
  let autresEnseignants: number | null = null
  let postesNecessaires = 0
  let postesDeclares: number | null = null
  let excedentMobilisable = 0
  let sallesManquantes = 0
  let surnombre = 0
  let effectifTotalEleves: number | null = null
  let classesMultigrades = 0
  let ecolesEnDeficit = 0
  let ecolesAvecExcedent = 0
  let ecolesSatisfaisantes = 0
  let ecolesAExaminer = 0

  for (const d of diagnostics) {
    classes += d.nbClasses
    enseignantsEtat += d.enseignantsEtat
    if (d.school.nbAutresEnseignants != null) autresEnseignants = (autresEnseignants ?? 0) + d.school.nbAutresEnseignants
    postesNecessaires += d.besoinTheorique
    if (d.postesDeclares != null) postesDeclares = (postesDeclares ?? 0) + d.postesDeclares
    excedentMobilisable += d.excedentTheorique
    sallesManquantes += d.calcul.sallesManquantes
    surnombre += d.calcul.surnombre
    if (d.school.effectifTotalEleves != null) effectifTotalEleves = (effectifTotalEleves ?? 0) + d.school.effectifTotalEleves
    classesMultigrades += d.school.classesMultigrades
    if (d.besoinTheorique > 0) ecolesEnDeficit++
    if (d.excedentTheorique > 0) ecolesAvecExcedent++
    if (d.besoinTheorique === 0) ecolesSatisfaisantes++
    if (d.classement === 'a_examiner') ecolesAExaminer++
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
    sallesManquantes,
    surnombre,
    ecolesAExaminer,
    effectifTotalEleves,
    elevesParEnseignantEtat: elevesParEnseignantEtat == null ? null : round2(elevesParEnseignantEtat),
    elevesParClasse: elevesParClasse == null ? null : round2(elevesParClasse),
    classesMultigrades,
  }
}

/**
 * Exécute le diagnostic complet. `teachers` sert à repérer les départs à la
 * retraite connus de chaque école ; une école qui déclare ses départs dans le
 * fichier garde sa déclaration. Les structures administratives sont mises à part :
 * elles accueillent des postes mais n'ont ni élèves, ni REM, ni BMAX.
 */
export function runDiagnostic(schools: School[], settings: EngineSettings, teachers: Teacher[] = []): DiagnosticResult {
  const structures: School[] = []
  const vusStructures = new Set<string>()
  for (const s of schools) {
    if (s.estStructure && s.id !== '' && !vusStructures.has(s.id)) {
      vusStructures.add(s.id)
      structures.push(s)
    }
  }

  const exploitables = schools.filter(
    s => !s.estStructure && s.id !== '' && (s.nbClasses > 0 || (s.effectifTotalEleves ?? 0) > 0) && s.nbEnseignantsEtat >= 0,
  )

  // Une unité de calcul n'apparaît qu'une fois : en cas de doublon d'identifiant,
  // seule la première ligne est retenue, et le doublon est signalé côté qualité.
  const vus = new Set<string>()
  const uniques = exploitables.filter(s => {
    if (vus.has(s.id)) return false
    vus.add(s.id)
    return true
  })

  const retraites = retraitesParEcole(teachers, settings)
  const diagnostics = uniques.map(s => {
    const departs = s.departsConnusDeclares ?? retraites.get(s.id) ?? 0
    const d = computeSchoolDiagnostic(s, settings, departs)
    return { ...d, raisons: raisonsPriorite(d) }
  })

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
    structures,
    ecolesEnRepli: diagnostics.filter(d => d.calcul.methode === 'repli_classes').length,
    ecolesSansSalles: diagnostics.filter(d => d.calcul.bmax == null).length,
  }
}

/**
 * Ordre de priorité d'attention : écoles nécessiteuses d'abord, par indice de
 * priorité u décroissant, puis REM actuel le plus élevé, puis besoin (§2.6, §3.1).
 */
export function trierParPriorite(diagnostics: SchoolDiagnostic[]): SchoolDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const na = a.besoinTheorique > 0 ? 1 : 0
    const nb = b.besoinTheorique > 0 ? 1 : 0
    if (nb !== na) return nb - na
    if (b.priorite.indice !== a.priorite.indice) return b.priorite.indice - a.priorite.indice
    const ra = a.calcul.remActuel ?? -1
    const rb = b.calcul.remActuel ?? -1
    if (rb !== ra) return rb - ra
    if (b.deficitAbsolu !== a.deficitAbsolu) return b.deficitAbsolu - a.deficitAbsolu
    return a.school.id.localeCompare(b.school.id)
  })
}
