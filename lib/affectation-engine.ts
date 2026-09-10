/**
 * Moteur d'affectation séquentielle des enseignants — port TypeScript de la
 * logique validée en Python/Streamlit (barème individuel, score de poste,
 * phases DREB). Fonctions pures, sans dépendance à React ni au navigateur ;
 * seul exportAffectationsXlsx() dépend du paquet `xlsx`.
 *
 * UTILISATION
 * 1. Lire les deux classeurs (établissements, enseignants) en tableaux de
 *    lignes avec readFirstWorksheetRows(), première ligne = en-têtes.
 * 2. const { etablissements, enseignants } = parseAffectationRows({ etablissements: rows1, enseignants: rows2 })
 * 3. const resultat = runAffectation(etablissements, enseignants, config)
 * 4. exportAffectationsXlsx(resultat) pour le rapport Excel complet.
 *
 * Deux garde-fous du barème de configuration ne sont pas appliqués par
 * l'algorithme : le seuil "ne pas vider une école sous un taux donné" et le
 * déclenchement dédié aux permutations IAEB par âge (phase3_ages_vers_iaeb).
 * La règle IAEB reste toutefois active dans le score de poste (scoreAgeRegle),
 * simplement sans phase dédiée pour la prioriser — comme dans la version
 * Python d'origine.
 */

export interface AffectationConfig {
  seuils: {
    anciennetePosteBonusAns: number
    ageAgeAns: number
    ageJeuneAns: number
  }
  poidsBaremeIndividuel: {
    ancienneteCarriere: number
    anciennetePoste: number
    situationFamiliale: number
    nbEnfants: number
    formationContinue: number
    ageAjuste: number
  }
  pointsSituationFamiliale: Record<string, number>
  poidsScorePoste: {
    baremeEnseignant: number
    proximite: number
    anciennetePoste: number
    situationFamiliale: number
    ageRegle: number
    zoneRegle: number
  }
  pointsProximite: {
    memeCommune: number
    memeDepartement: number
    departementVoisin: number
    autre: number
  }
  reglesDreb: {
    phase1Commune: boolean
    phase2Departement: boolean
    phase3AgesVersIaeb: boolean
    phase3AnciensRuralVersUrbain: boolean
    phase3JeunesVersMultigrades: boolean
    phase4CommunePlusDemanderesse: boolean
  }
  gardesFous: {
    neePasViderEcoleSiTauxSous: number
    unEnseignantUneSeuleAffectation: boolean
    unPosteUnSeulEnseignant: boolean
  }
}

export const DEFAULT_CONFIG: AffectationConfig = {
  seuils: { anciennetePosteBonusAns: 5, ageAgeAns: 50, ageJeuneAns: 35 },
  poidsBaremeIndividuel: {
    ancienneteCarriere: 0.30, anciennetePoste: 0.25, situationFamiliale: 0.15,
    nbEnfants: 0.10, formationContinue: 0.10, ageAjuste: 0.10,
  },
  pointsSituationFamiliale: { celibataire: 10, marie: 6, divorce: 5, veuf: 5 },
  poidsScorePoste: {
    baremeEnseignant: 0.35, proximite: 0.35, anciennetePoste: 0.10,
    situationFamiliale: 0.08, ageRegle: 0.07, zoneRegle: 0.05,
  },
  pointsProximite: { memeCommune: 100, memeDepartement: 60, departementVoisin: 30, autre: 0 },
  reglesDreb: {
    phase1Commune: true, phase2Departement: true, phase3AgesVersIaeb: true,
    phase3AnciensRuralVersUrbain: true, phase3JeunesVersMultigrades: true, phase4CommunePlusDemanderesse: true,
  },
  gardesFous: { neePasViderEcoleSiTauxSous: 0.5, unEnseignantUneSeuleAffectation: true, unPosteUnSeulEnseignant: true },
}

// ---------------------------------------------------------------------------
// Types métier
// ---------------------------------------------------------------------------

export interface EtablissementEnrichi {
  idEtab: string; nomEtab: string; commune: string; departement: string; region: string; zone: string
  typeEtab: string; nbClasses: number; nbEnseignantsEtat: number; nbPostesOuverts: number
  classesMultigrades: number; prioriteLocale: number
  tauxEncadrementAbsolu: number; estNecessiteuse: boolean
}

export interface Enseignant {
  idEns: string; nom: string; prenom: string; dateNaissance: Date | null; age: number | null
  idEtabAttache: string; communeAttache: string; departementAttache: string; zoneAttache: string
  ancienneteCarriereAns: number; anciennetePosteAns: number
  situationFamiliale: string; nbEnfants: number; formationContinue: number
  statut: string; payeParEtat: string
}

export interface VivierEnseignant extends Enseignant {
  bareme: number
  affecte: boolean
}

export interface Poste {
  idPoste: string; idEtab: string; nomEtab: string; commune: string; departement: string; region: string
  zone: string; typeEtab: string; classesMultigrades: number; prioriteLocale: number
  tauxEncadrementAbsolu: number
  pourvu: boolean
}

export interface Affectation {
  phase: string; idPoste: string; idEtab: string; nomEtab: string
  communePoste: string; departementPoste: string
  idEns: string; nomEns: string; prenomEns: string; communeOrigine: string
  bareme: number; scoreAffectation: number
}

export interface EcoleFournisseur { idEtab: string; commune: string; nbEnseignantsVivier: number }

export interface ResultatAffectation {
  synthese: {
    besoinTotal: number; disponibles: number; affectes: number
    nonAffectes: number; postesNonPourvus: number; aRecruter: number
  }
  ecolesEnBesoin: EtablissementEnrichi[]
  ecolesFournisseurs: EcoleFournisseur[]
  affectations: Affectation[]
  nonAffectes: VivierEnseignant[]
  postesNonPourvus: Poste[]
  vivier: VivierEnseignant[]
  etablissementsEnrichis: EtablissementEnrichi[]
}

// ---------------------------------------------------------------------------
// Lecture / nettoyage
// ---------------------------------------------------------------------------

const text = (v: unknown): string => (v == null ? '' : String(v)).trim()
const lower = (v: unknown): string => text(v).toLowerCase()

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = text(v).replace(',', '.')
  if (s === '') return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = text(v).replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function excelSerialToDate(n: number): Date {
  // Système de dates Excel 1900 : jour 0 = 30 décembre 1899.
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000)
}

function parseDateValue(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return excelSerialToDate(v)
  const s = text(v)
  if (!s) return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s)
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function ageFromBirthDate(d: Date | null): number | null {
  if (!d) return null
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const birthUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return (todayUtc - birthUtc) / 86400000 / 365.25
}

/** Convertit les lignes brutes (en-tête + données) d'une feuille en objets par nom de colonne. */
export function recordsFromRows(rows: unknown[][]): Record<string, unknown>[] {
  const heads = (rows[0] ?? []).map(text)
  return rows.slice(1)
    .filter(r => r.some(v => v != null && v !== ''))
    .map(r => Object.fromEntries(heads.map((h, i) => [h, r[i] ?? null])))
}

export interface RawAffectationRows {
  etablissements: unknown[][]
  enseignants: unknown[][]
}

export function parseAffectationRows(raw: RawAffectationRows): {
  etablissements: Record<string, unknown>[]
  enseignants: Record<string, unknown>[]
} {
  return {
    etablissements: recordsFromRows(raw.etablissements),
    enseignants: recordsFromRows(raw.enseignants),
  }
}

export function enrichirEtablissements(rows: Record<string, unknown>[]): EtablissementEnrichi[] {
  return rows.map(r => {
    const nbClasses = Math.max(1, Math.trunc(num(r.nb_classes, 0)) || 1)
    const nbEnseignantsEtat = Math.trunc(num(r.nb_enseignants_etat, 0))
    const nbPostesOuverts = Math.trunc(num(r.nb_postes_ouverts, 0))
    const classesMultigrades = Math.trunc(num(r.classes_multigrades, 0))
    const prioriteLocale = Math.trunc(num(r.priorite_locale, 0))
    return {
      idEtab: text(r.id_etab), nomEtab: text(r.nom_etab), commune: text(r.commune),
      departement: text(r.departement), region: text(r.region), zone: text(r.zone),
      typeEtab: text(r.type_etab),
      nbClasses, nbEnseignantsEtat, nbPostesOuverts, classesMultigrades, prioriteLocale,
      tauxEncadrementAbsolu: nbEnseignantsEtat / nbClasses,
      estNecessiteuse: nbPostesOuverts > 0,
    }
  })
}

export function nettoyerEnseignants(rows: Record<string, unknown>[]): Enseignant[] {
  return rows
    .map(r => {
      const statut = lower(r.statut) || 'actif'
      const payeParEtat = lower(r.paye_par_etat) || 'oui'
      const dateNaissance = parseDateValue(r.date_naissance)
      return {
        idEns: text(r.id_ens), nom: text(r.nom), prenom: text(r.prenom),
        dateNaissance, age: ageFromBirthDate(dateNaissance),
        idEtabAttache: text(r.id_etab_attache), communeAttache: text(r.commune_attache),
        departementAttache: text(r.departement_attache), zoneAttache: text(r.zone_attache),
        ancienneteCarriereAns: num(r.anciennete_carriere_ans, 0), anciennetePosteAns: num(r.anciennete_poste_ans, 0),
        situationFamiliale: text(r.situation_familiale), nbEnfants: num(r.nb_enfants, 0),
        formationContinue: num(r.formation_continue, 0),
        statut, payeParEtat,
      }
    })
    .filter(e => e.statut !== 'malade' && e.statut !== 'abandon')
}

// ---------------------------------------------------------------------------
// Barème et scores
// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function pointsSituation(situation: string, cfg: AffectationConfig): number {
  return cfg.pointsSituationFamiliale[lower(situation)] ?? 0
}

export function calculerBaremeIndividuel(ens: Enseignant, cfg: AffectationConfig): number {
  const w = cfg.poidsBaremeIndividuel
  const bonusPoste = ens.anciennetePosteAns >= cfg.seuils.anciennetePosteBonusAns ? 10 : ens.anciennetePosteAns
  const sit = pointsSituation(ens.situationFamiliale, cfg)
  const ageScore = ens.age != null ? Math.min(ens.age, 60) / 6 : 5

  return round4(
    w.ancienneteCarriere * ens.ancienneteCarriereAns
    + w.anciennetePoste * bonusPoste
    + w.situationFamiliale * sit
    + w.nbEnfants * ens.nbEnfants
    + w.formationContinue * ens.formationContinue
    + w.ageAjuste * ageScore,
  )
}

function scoreProximite(ens: Enseignant, poste: Poste, cfg: AffectationConfig): number {
  const p = cfg.pointsProximite
  if (lower(ens.communeAttache) === lower(poste.commune)) return p.memeCommune
  if (lower(ens.departementAttache) === lower(poste.departement)) return p.memeDepartement
  return p.autre
}

function scoreAgeRegle(ens: Enseignant, poste: Poste, cfg: AffectationConfig): number {
  if (ens.age == null) return 0
  const { ageJeuneAns, ageAgeAns } = cfg.seuils
  if (ens.age <= ageJeuneAns && poste.classesMultigrades > 0) return 15
  if (ens.age >= ageAgeAns) {
    if (poste.typeEtab.toUpperCase() === 'IAEB') return 15
    if (poste.classesMultigrades === 0) return 8
  }
  return 0
}

function scoreZoneRegle(ens: Enseignant, poste: Poste): number {
  const zFrom = lower(ens.zoneAttache)
  const zTo = lower(poste.zone)
  if (zFrom === 'rurale' && (zTo === 'urbaine' || zTo === 'semi_urbaine') && ens.anciennetePosteAns >= 5) return 12
  return 0
}

export function scoreEnseignantPoste(ens: VivierEnseignant, poste: Poste, cfg: AffectationConfig): number {
  const w = cfg.poidsScorePoste
  return round4(
    w.baremeEnseignant * ens.bareme
    + w.proximite * scoreProximite(ens, poste, cfg)
    + w.anciennetePoste * ens.anciennetePosteAns
    + w.situationFamiliale * pointsSituation(ens.situationFamiliale, cfg)
    + w.ageRegle * scoreAgeRegle(ens, poste, cfg)
    + w.zoneRegle * scoreZoneRegle(ens, poste),
  )
}

// ---------------------------------------------------------------------------
// Construction du vivier et des postes
// ---------------------------------------------------------------------------

export function construirePostes(etabs: EtablissementEnrichi[]): Poste[] {
  const postes: Poste[] = []
  for (const e of etabs) {
    for (let k = 0; k < e.nbPostesOuverts; k++) {
      postes.push({
        idPoste: `${e.idEtab}_P${k + 1}`, idEtab: e.idEtab, nomEtab: e.nomEtab,
        commune: e.commune, departement: e.departement, region: e.region, zone: e.zone,
        typeEtab: e.typeEtab, classesMultigrades: e.classesMultigrades,
        prioriteLocale: e.prioriteLocale || 99, tauxEncadrementAbsolu: e.tauxEncadrementAbsolu,
        pourvu: false,
      })
    }
  }
  return postes
}

const PAYE_OUI = new Set(['oui', 'yes', '1', 'true'])

export function construireVivier(enseignants: Enseignant[], cfg: AffectationConfig): VivierEnseignant[] {
  const eligibles = enseignants.filter(e =>
    (e.statut === 'actif' || e.statut === 'disponible') && PAYE_OUI.has(e.payeParEtat))
  const vivier: VivierEnseignant[] = eligibles.map(e => ({ ...e, bareme: calculerBaremeIndividuel(e, cfg), affecte: false }))
  vivier.sort((a, b) => b.bareme - a.bareme)
  return vivier
}

function postesDisponibles(postes: Poste[]): Poste[] {
  return postes.filter(p => !p.pourvu)
}

function enseignantsDisponibles(vivier: VivierEnseignant[]): VivierEnseignant[] {
  return vivier.filter(e => !e.affecte)
}

function choisirMeilleurPoste(
  ens: VivierEnseignant, candidats: Poste[], cfg: AffectationConfig,
  contrainteCommune: boolean, contrainteDept: boolean,
): Poste | null {
  let cdf = candidats
  if (contrainteCommune) cdf = cdf.filter(p => lower(p.commune) === lower(ens.communeAttache))
  if (contrainteDept) cdf = cdf.filter(p => lower(p.departement) === lower(ens.departementAttache))
  if (cdf.length === 0) return null

  let best: Poste | null = null
  let bestScore = -Infinity
  for (const p of cdf) {
    const score = scoreEnseignantPoste(ens, p, cfg) + Math.max(0, 20 - p.prioriteLocale)
    if (score > bestScore) { bestScore = score; best = p }
  }
  return best
}

function affecter(
  vivier: VivierEnseignant[], postes: Poste[], cfg: AffectationConfig, phase: string,
  options: { contrainteCommune?: boolean; contrainteDept?: boolean; filtre?: (e: VivierEnseignant) => boolean } = {},
): Affectation[] {
  const affectations: Affectation[] = []
  let ensDispo = enseignantsDisponibles(vivier)
  if (options.filtre) ensDispo = ensDispo.filter(options.filtre)

  for (const ens of ensDispo) {
    const poste = choisirMeilleurPoste(ens, postesDisponibles(postes), cfg, !!options.contrainteCommune, !!options.contrainteDept)
    if (!poste) continue

    ens.affecte = true
    poste.pourvu = true
    const score = scoreEnseignantPoste(ens, poste, cfg)
    affectations.push({
      phase, idPoste: poste.idPoste, idEtab: poste.idEtab, nomEtab: poste.nomEtab,
      communePoste: poste.commune, departementPoste: poste.departement,
      idEns: ens.idEns, nomEns: ens.nom, prenomEns: ens.prenom, communeOrigine: ens.communeAttache,
      bareme: ens.bareme, scoreAffectation: score,
    })
  }
  return affectations
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function runAffectation(
  etablissementsRows: Record<string, unknown>[],
  enseignantsRows: Record<string, unknown>[],
  cfg: AffectationConfig,
): ResultatAffectation {
  const etablissementsEnrichis = enrichirEtablissements(etablissementsRows)
  const enseignants = nettoyerEnseignants(enseignantsRows)

  const postes = construirePostes(etablissementsEnrichis)
  const vivier = construireVivier(enseignants, cfg)

  const besoinTotal = postes.length
  const disponibles = vivier.length
  const affectations: Affectation[] = []

  if (cfg.reglesDreb.phase1Commune) {
    affectations.push(...affecter(vivier, postes, cfg, 'phase1_commune', { contrainteCommune: true }))
  }
  if (cfg.reglesDreb.phase2Departement) {
    affectations.push(...affecter(vivier, postes, cfg, 'phase2_departement', { contrainteDept: true }))
  }
  if (cfg.reglesDreb.phase3JeunesVersMultigrades) {
    const ageJeune = cfg.seuils.ageJeuneAns
    affectations.push(...affecter(vivier, postes, cfg, 'phase3_jeunes_multigrades', {
      filtre: e => e.age != null && e.age <= ageJeune,
    }))
  }
  if (cfg.reglesDreb.phase3AnciensRuralVersUrbain) {
    affectations.push(...affecter(vivier, postes, cfg, 'phase3_rural_urbain', {
      filtre: e => lower(e.zoneAttache) === 'rurale' && e.anciennetePosteAns >= 5,
    }))
  }
  if (cfg.reglesDreb.phase4CommunePlusDemanderesse) {
    affectations.push(...affecter(vivier, postes, cfg, 'phase4_reste'))
  }

  const nonAffectes = vivier.filter(e => !e.affecte)
  const postesNonPourvus = postes.filter(p => !p.pourvu)
  const aRecruter = postesNonPourvus.length

  const ecolesEnBesoin = etablissementsEnrichis.filter(e => e.estNecessiteuse)

  const fournisseursMap = new Map<string, EcoleFournisseur>()
  for (const e of vivier) {
    const key = `${e.idEtabAttache} ${e.communeAttache}`
    const existing = fournisseursMap.get(key)
    if (existing) existing.nbEnseignantsVivier++
    else fournisseursMap.set(key, { idEtab: e.idEtabAttache, commune: e.communeAttache, nbEnseignantsVivier: 1 })
  }

  return {
    synthese: {
      besoinTotal, disponibles, affectes: affectations.length,
      nonAffectes: nonAffectes.length, postesNonPourvus: postesNonPourvus.length, aRecruter,
    },
    ecolesEnBesoin,
    ecolesFournisseurs: Array.from(fournisseursMap.values()),
    affectations,
    nonAffectes,
    postesNonPourvus,
    vivier,
    etablissementsEnrichis,
  }
}

// ---------------------------------------------------------------------------
// Export Excel (rapport complet, plusieurs feuilles)
// ---------------------------------------------------------------------------

export async function exportAffectationsXlsx(resultat: ResultatAffectation): Promise<Uint8Array> {
  const XLSX = await import('xlsx')

  function sheet<T>(rows: T[], columns: [string, keyof T][]) {
    const aoa = [columns.map(([label]) => label), ...rows.map(r => columns.map(([, key]) => r[key] as string | number | null))]
    return XLSX.utils.aoa_to_sheet(aoa)
  }

  const wb = XLSX.utils.book_new()

  const s = resultat.synthese
  XLSX.utils.book_append_sheet(wb, sheet(
    [{ ...s }],
    [['Besoin total', 'besoinTotal'], ['Disponibles', 'disponibles'], ['Affectés', 'affectes'],
      ['Non affectés', 'nonAffectes'], ['Postes non pourvus', 'postesNonPourvus'], ['À recruter', 'aRecruter']],
  ), 'Synthese')

  XLSX.utils.book_append_sheet(wb, sheet(resultat.ecolesEnBesoin, [
    ['Code établissement', 'idEtab'], ['École', 'nomEtab'], ['Commune', 'commune'], ['Département', 'departement'],
    ['Postes ouverts', 'nbPostesOuverts'], ["Taux d'encadrement", 'tauxEncadrementAbsolu'],
  ]), 'Ecoles_Necessiteuses')

  XLSX.utils.book_append_sheet(wb, sheet(resultat.ecolesFournisseurs, [
    ['Code établissement', 'idEtab'], ['Commune', 'commune'], ['Enseignants du vivier', 'nbEnseignantsVivier'],
  ]), 'Ecoles_Fournisseurs')

  XLSX.utils.book_append_sheet(wb, sheet(resultat.affectations, [
    ['Phase', 'phase'], ['Poste', 'idPoste'], ['École', 'nomEtab'], ['Commune poste', 'communePoste'],
    ['Département poste', 'departementPoste'], ['Enseignant', 'idEns'], ['Nom', 'nomEns'], ['Prénom', 'prenomEns'],
    ['Commune origine', 'communeOrigine'], ['Barème', 'bareme'], ['Score', 'scoreAffectation'],
  ]), 'Affectations')

  XLSX.utils.book_append_sheet(wb, sheet(resultat.nonAffectes, [
    ['Enseignant', 'idEns'], ['Nom', 'nom'], ['Prénom', 'prenom'], ['École attache', 'idEtabAttache'],
    ['Commune', 'communeAttache'], ['Barème', 'bareme'],
  ]), 'Non_Affectes')

  XLSX.utils.book_append_sheet(wb, sheet(resultat.postesNonPourvus, [
    ['Poste', 'idPoste'], ['École', 'nomEtab'], ['Commune', 'commune'], ['Département', 'departement'],
  ]), 'Postes_Non_Pourvus')

  XLSX.utils.book_append_sheet(wb, sheet(resultat.vivier, [
    ['Enseignant', 'idEns'], ['Nom', 'nom'], ['Prénom', 'prenom'], ['École attache', 'idEtabAttache'],
    ['Commune', 'communeAttache'], ['Ancienneté poste', 'anciennetePosteAns'], ['Âge', 'age'],
    ['Barème', 'bareme'], ['Affecté', 'affecte'],
  ]), 'Vivier_Detail')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}
