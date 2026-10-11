/**
 * Serveur de référence — planification sur cinq ans, hypothèses, quotas et
 * indicateurs de suivi.
 *
 * MODÈLE PROVISOIRE. Le moteur actuel projette jusqu'à N+3
 * (lib/simulation/projection.ts) ; ce module prolonge ses règles jusqu'à N+5,
 * en attendant la validation des points ouverts du mémo (méthode officielle
 * d'attrition, règles de retraite, portée du vivier) :
 *   - situation de départ : les effectifs après le plan du scénario retenu ;
 *   - retraites : un enseignant part l'année où il atteint l'âge légal à la
 *     rentrée, compté une seule fois, dans l'école qu'il occupe après le plan ;
 *   - besoin d'une école : règle du référentiel (cible K) appliquée à l'effectif
 *     restant ;
 *   - attrition hors retraite : ⌈τ × effectif ÷ 100⌉, au niveau du périmètre ;
 *   - quotas : les quotas des années précédentes sont supposés recrutés, le
 *     besoin d'une année est donc le besoin nouveau de cette année.
 */

import { ageA, calculerBesoin } from '../../lib/analytics/diagnostic'
import { selectionLabel } from '../../lib/analytics/territory'
import { dateRentree } from '../../lib/config/settings'
import { STATUTS_EXCLUS } from '../../lib/data/parse'
import type { School, SousSysteme, TerritorialSummary, Teacher } from '../../types/education'
import {
  ANNEES_PLAN,
  type DepartRetraitePrevu,
  type DetailVersionPlanification,
  type DocumentationHypotheses,
  type EstimationAttrition,
  type EtatPlanification,
  type EvenementQuota,
  type EvolutionIndicateurs,
  type FiabiliteDonnees,
  type FiabiliteIndicateur,
  type Hypotheses,
  type IndicateursAnnee,
  type IndicateursSuivi,
  type LigneFiabilite,
  type LignePlanificationEcole,
  type NiveauTerritorial,
  type PlanDeparts,
  type QuotaRecrutement,
  type TableauPlanification,
  type VentilationSousSystemes,
  type VentilationTerritoriale,
  type VersionHypotheses,
  type VersionPlanification,
} from '../../../frontend/src/shared/api/contrat'
import { JEU, REFERENCE_ISO, SCENARIO_RETENU, noeuds, scenarioDe, type Contexte } from './contexte'
import { querySelection, selectionDe } from './diagnostic'
import type { Catalogue, Query } from './outils'

const F = 'planification'
const AUTEUR_INITIAL = 'Paramétrage initial'
type CleSousSysteme = SousSysteme | 'non_renseigne'
const SOUS_SYSTEMES: CleSousSysteme[] = ['francophone', 'anglophone', 'non_renseigne']

/** Projection d'une école, année par année. */
interface ProjectionEcole5 {
  ecole: School
  /** Effectif après le plan, avant les départs de N+1. */
  effectifInitial: number
  cible: number
  retraites: number[]
  effectifs: number[]
  besoins: number[]
  excedents: number[]
  /** Arrivées proposées par le scénario retenu. */
  arrivees: number
}

/** Hypothèses par défaut, toutes justifiées. */
export function hypothesesParDefaut(ctx: Contexte): Hypotheses {
  return {
    horizon: 5,
    retraite: {
      source: 'Référentiel du moteur (âge de la retraite), à confirmer par la DRH',
      justification: 'Âge légal retenu par le calcul actuel du besoin ; aucune exception n’est encore documentée.',
      ageLegal: ctx.settings.besoin.ageRetraite,
      dateReference: 'rentree',
      exceptions: [],
    },
    attrition: {
      source: 'Hypothèse provisoire du mémo de synthèse',
      justification: `Taux unique de ${ctx.settings.recrutement.tauxAttritionHorsRetraite} % par an, en attendant une méthode officielle.`,
      methode: 'taux_unique',
      tauxUnique: ctx.settings.recrutement.tauxAttritionHorsRetraite,
      parSousSysteme: {},
      parRegion: {},
      niveauArrondi: 'departement',
    },
    quotas: {
      source: 'Mémo de synthèse, §2.1',
      justification:
        'Les quotas des années précédentes sont supposés recrutés : chaque année ne porte que son besoin nouveau.',
      anneesPrecedentesRealisees: true,
    },
    vivier: {
      source: 'Mémo de synthèse, §2.2',
      justification: 'Seules les deux sources confirmées sont retenues : excédentaires et lauréats sans poste.',
      sources: ['excedentaire', 'laureat_sans_poste'],
    },
    version: 1,
    modifieesLe: REFERENCE_ISO,
    modifieesPar: AUTEUR_INITIAL,
  }
}

/** Effectif après le plan et retraites de chaque école sur cinq ans. */
function projeterEcoles(ctx: Contexte): ProjectionEcole5[] {
  const { resultat } = scenarioDe(ctx, SCENARIO_RETENU)
  const position = new Map<string, string>()
  const ecart = new Map<string, number>()
  const arrivees = new Map<string, number>()
  for (const a of resultat.assignments) {
    position.set(a.teacherId, a.schoolDestinationId)
    ecart.set(a.schoolDestinationId, (ecart.get(a.schoolDestinationId) ?? 0) + 1)
    ecart.set(a.schoolOrigineId, (ecart.get(a.schoolOrigineId) ?? 0) - 1)
    arrivees.set(a.schoolDestinationId, (arrivees.get(a.schoolDestinationId) ?? 0) + 1)
  }

  // Année de départ de chaque enseignant : la première rentrée où il atteint l'âge légal.
  const R = ctx.settings.besoin.ageRetraite
  const retraites = new Map<string, number[]>()
  for (const t of ctx.dataset.teachers) {
    if (!t.payeParEtat || STATUTS_EXCLUS.has(t.statut) || !t.idEtabAttache) continue
    const k = ANNEES_PLAN.findIndex((_, i) => (ageA(t, dateRentree(ctx.settings.anneeScolaire, i)) ?? 0) >= R)
    if (k < 0 || ageA(t, dateRentree(ctx.settings.anneeScolaire, k)) == null) continue
    const ecole = position.get(t.id) ?? t.idEtabAttache
    const parAnnee = retraites.get(ecole) ?? ANNEES_PLAN.map(() => 0)
    parAnnee[k]++
    retraites.set(ecole, parAnnee)
  }

  return ctx.diagnostic.schools
    .filter(d => !d.school.estStructure)
    .map(d => {
      const ecole = d.school
      const effectifInitial = Math.max(0, ecole.nbEnseignantsEtat + (ecart.get(ecole.id) ?? 0))
      const parAnnee = retraites.get(ecole.id) ?? ANNEES_PLAN.map(() => 0)
      const effectifs: number[] = []
      const besoins: number[] = []
      const excedents: number[] = []
      let restant = effectifInitial
      let cible = 0
      for (let k = 0; k < ANNEES_PLAN.length; k++) {
        restant = Math.max(0, restant - parAnnee[k])
        const calcul = calculerBesoin({ ...ecole, nbEnseignantsEtat: restant }, ctx.settings, 0)
        cible = calcul.cible
        effectifs.push(restant)
        besoins.push(calcul.besoin)
        excedents.push(calcul.excedent)
      }
      return {
        ecole,
        effectifInitial,
        cible,
        retraites: parAnnee,
        effectifs,
        besoins,
        excedents,
        arrivees: arrivees.get(ecole.id) ?? 0,
      }
    })
}

/** Les huit indicateurs, année par année, pour un ensemble d'écoles. */
function indicateurs(ctx: Contexte, ecoles: ProjectionEcole5[]): IndicateursAnnee[] {
  const taux = ctx.settings.recrutement.tauxAttritionHorsRetraite
  const somme = (f: (e: ProjectionEcole5) => number) => ecoles.reduce((s, e) => s + f(e), 0)
  let effectifDebut = somme(e => e.effectifInitial)
  let attritionCumulee = 0
  let besoinCumulePrecedent = 0

  return ANNEES_PLAN.map((annee, k) => {
    const departsRetraite = somme(e => e.retraites[k])
    const departsAttrition = Math.ceil((taux * effectifDebut) / 100)
    attritionCumulee += departsAttrition
    const besoinCumule = somme(e => e.besoins[k]) + attritionCumulee
    const besoin = Math.max(0, besoinCumule - besoinCumulePrecedent)
    besoinCumulePrecedent = besoinCumule
    const ressourcesVivier = k === 0 ? somme(e => e.excedents[0]) : 0
    const quotaCalcule = Math.max(0, besoin - ressourcesVivier)
    const ligne: IndicateursAnnee = {
      annee,
      effectifDebut,
      departsRetraite,
      departsAttrition,
      besoin,
      ressourcesVivier,
      quotaCalcule,
      quotaRetenu: null,
      nominationsPrevues: 0,
      nominationsRealisees: 0,
      deploiementsPrevus: k === 0 ? somme(e => e.arrivees) : 0,
      deploiementsRealises: 0,
      besoinRestant: quotaCalcule,
    }
    effectifDebut = Math.max(0, effectifDebut - departsRetraite - departsAttrition)
    return ligne
  })
}

/** Disponibilité des données qui fondent les projections d'un ensemble d'écoles. */
function ligneFiabilite(ctx: Contexte, territoire: string, ecoles: ProjectionEcole5[]): LigneFiabilite {
  const ids = new Set(ecoles.map(e => e.ecole.id))
  const enseignants: Teacher[] = ctx.dataset.teachers.filter(t => ids.has(t.idEtabAttache))
  const part = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100) / 100)
  return {
    territoire,
    ecoles: ecoles.length,
    enseignants: enseignants.length,
    tauxDateNaissance: part(enseignants.filter(t => t.dateNaissance || t.age != null).length, enseignants.length),
    tauxSousSysteme: part(enseignants.filter(t => t.sousSysteme).length, enseignants.length),
    tauxEffectifsEleves: part(ecoles.filter(e => e.ecole.effectifTotalEleves != null).length, ecoles.length),
  }
}

function fiabiliteIndicateurs(ligne: LigneFiabilite): FiabiliteIndicateur[] {
  const niveau = (taux: number): FiabiliteIndicateur['niveau'] =>
    taux >= 0.9 ? 'bonne' : taux >= 0.6 ? 'partielle' : 'faible'
  const pct = (taux: number) => `${Math.round(taux * 100)} %`
  return [
    {
      indicateur: 'departsRetraite',
      niveau: niveau(ligne.tauxDateNaissance),
      detail: `Âge connu pour ${pct(ligne.tauxDateNaissance)} des enseignants.`,
    },
    {
      indicateur: 'departsAttrition',
      niveau: 'partielle',
      detail: 'Taux d’attrition provisoire, en attendant une méthode officielle.',
    },
    {
      indicateur: 'besoin',
      niveau: niveau(ligne.tauxEffectifsEleves),
      detail: `Effectifs d’élèves connus pour ${pct(ligne.tauxEffectifsEleves)} des écoles.`,
    },
    {
      indicateur: 'ressourcesVivier',
      niveau: 'partielle',
      detail: 'Seules les sources confirmées du vivier sont comptées.',
    },
  ]
}

function niveauEnfants(noeud: TerritorialSummary): NiveauTerritorial {
  switch (noeud.territory.level) {
    case 'national':
      return 'region'
    case 'region':
      return 'departement'
    default:
      return 'commune'
  }
}

/** Enregistre les routes de la planification et renvoie son état initial. */
export function routesPlanification(ctx: Contexte, catalogue: Catalogue) {
  const base = `jeux/${JEU}`
  const ecoles = projeterEcoles(ctx)
  const ecolesDe = (noeud: TerritorialSummary) => {
    const ids = new Set(noeud.schoolIds)
    return ecoles.filter(e => ids.has(e.ecole.id))
  }
  const sousSystemeDe = (e: ProjectionEcole5): CleSousSysteme => e.ecole.sousSysteme ?? 'non_renseigne'

  const hypotheses = hypothesesParDefaut(ctx)
  catalogue.ajouter(F, 'hypotheses/defaut/', {}, hypotheses)
  const documentation: DocumentationHypotheses = {
    sections: [
      {
        titre: 'Départs à la retraite',
        paragraphes: [
          `Un enseignant part l’année où il atteint ${hypotheses.retraite.ageLegal} ans à la rentrée scolaire.`,
          hypotheses.retraite.justification,
        ],
      },
      {
        titre: 'Attrition hors retraite',
        paragraphes: [
          `Taux annuel de ${hypotheses.attrition.tauxUnique} %, appliqué à l’effectif du périmètre et arrondi à l’entier supérieur.`,
          hypotheses.attrition.justification,
        ],
      },
      { titre: 'Quotas de recrutement', paragraphes: [hypotheses.quotas.justification] },
      { titre: 'Vivier', paragraphes: [hypotheses.vivier.justification] },
    ],
  }
  catalogue.ajouter(F, `${base}/hypotheses/documentation/`, {}, documentation)

  let tableauNational: TableauPlanification | null = null
  for (const noeud of noeuds(ctx.arbre)) {
    const selection = selectionDe(noeud)
    const perimetre = selectionLabel(selection)
    const dansNoeud = ecolesDe(noeud)
    const fiabilite = ligneFiabilite(ctx, perimetre, dansNoeud)
    const variantes: [Query, CleSousSysteme | null][] = [
      [querySelection(selection), null],
      ...SOUS_SYSTEMES.filter(s => s !== 'non_renseigne').map(
        s => [querySelection(selection, { sousSysteme: s }), s] as [Query, CleSousSysteme],
      ),
    ]
    for (const [q, sousSysteme] of variantes) {
      const retenues = sousSysteme ? dansNoeud.filter(e => sousSystemeDe(e) === sousSysteme) : dansNoeud
      const tableau: TableauPlanification = {
        perimetre,
        niveau: noeud.territory.level === 'ecole' ? 'commune' : noeud.territory.level,
        sousSysteme: sousSysteme === 'non_renseigne' ? null : sousSysteme,
        scenarioId: SCENARIO_RETENU,
        version: 1,
        calculeLe: REFERENCE_ISO,
        annees: indicateurs(ctx, retenues),
        fiabilite: fiabiliteIndicateurs(fiabilite),
      }
      catalogue.ajouter(F, `${base}/planification/`, q, tableau)
      if (noeud.territory.level === 'national' && !sousSysteme) tableauNational = tableau
    }

    const q = querySelection(selection)
    const territoires: VentilationTerritoriale = {
      niveau: niveauEnfants(noeud),
      lignes: noeud.children.map(enfant => ({
        territoire: enfant.territory,
        annees: indicateurs(ctx, ecolesDe(enfant)),
      })),
    }
    catalogue.ajouter(F, `${base}/planification/territoires/`, q, territoires)

    const sousSystemes: VentilationSousSystemes = {
      lignes: SOUS_SYSTEMES.map(s => ({
        sousSysteme: s,
        annees: indicateurs(
          ctx,
          dansNoeud.filter(e => sousSystemeDe(e) === s),
        ),
      })).filter(l => l.annees.some(a => a.effectifDebut > 0)),
    }
    catalogue.ajouter(F, `${base}/planification/sous-systemes/`, q, sousSystemes)

    const retraites: DepartRetraitePrevu[] = []
    const ids = new Set(noeud.schoolIds)
    for (const t of ctx.dataset.teachers) {
      if (!ids.has(t.idEtabAttache) || !t.payeParEtat || STATUTS_EXCLUS.has(t.statut)) continue
      const k = ANNEES_PLAN.findIndex(
        (_, i) => (ageA(t, dateRentree(ctx.settings.anneeScolaire, i)) ?? 0) >= ctx.settings.besoin.ageRetraite,
      )
      if (k < 0) continue
      const age = ageA(t, dateRentree(ctx.settings.anneeScolaire, k))
      if (age == null) continue
      retraites.push({
        annee: ANNEES_PLAN[k],
        matricule: t.id,
        nom: `${t.nom} ${t.prenom}`.trim(),
        schoolId: t.idEtabAttache,
        nomEtab: ctx.ecoleParId.get(t.idEtabAttache)?.nom ?? t.idEtabAttache,
        dateNaissance: t.dateNaissance ? t.dateNaissance.toISOString() : null,
        ageAuDepart: Math.floor(age),
      })
    }
    retraites.sort((a, b) => a.annee.localeCompare(b.annee) || a.nom.localeCompare(b.nom, 'fr'))
    const departs: PlanDeparts = {
      retraites,
      attrition: SOUS_SYSTEMES.flatMap(s =>
        indicateurs(
          ctx,
          dansNoeud.filter(e => sousSystemeDe(e) === s),
        )
          .filter(a => a.departsAttrition > 0)
          .map(a => ({ annee: a.annee, territoire: perimetre, sousSysteme: s, departs: a.departsAttrition })),
      ),
    }
    catalogue.ajouter(F, `${base}/planification/departs/`, q, departs)

    const fiabiliteDonnees: FiabiliteDonnees = {
      global: fiabilite,
      parTerritoire: noeud.children.map(e => ligneFiabilite(ctx, e.territory.nom, ecolesDe(e))),
    }
    catalogue.ajouter(F, `${base}/planification/fiabilite/`, q, fiabiliteDonnees)

    const n1 = indicateurs(ctx, dansNoeud)[0]
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
    const suivi: IndicateursSuivi = {
      perimetre,
      indicateurs: [
        {
          code: 'couverture_besoin',
          libelle: 'Couverture du besoin de N+1 par les redéploiements',
          valeur: pct(n1.deploiementsPrevus, n1.deploiementsPrevus + n1.besoin),
          unite: 'pourcentage',
          detail: `${n1.deploiementsPrevus} redéploiement(s) prévu(s) pour ${n1.besoin} poste(s) encore à pourvoir.`,
        },
        {
          code: 'mobilisation_vivier',
          libelle: 'Mobilisation du vivier',
          valeur: 0,
          unite: 'pourcentage',
          detail: `${n1.ressourcesVivier} personne(s) disponible(s), aucune encore nommée.`,
        },
        {
          code: 'realisation_nominations',
          libelle: 'Réalisation des nominations',
          valeur: null,
          unite: 'pourcentage',
          detail: 'Aucune nomination validée pour l’instant.',
        },
        {
          code: 'ecart_prevu_realise',
          libelle: 'Écart entre mouvements prévus et réalisés',
          valeur: n1.deploiementsPrevus,
          unite: 'nombre',
          detail: 'Mouvements prévus non encore mis en œuvre.',
        },
        {
          code: 'besoin_residuel',
          libelle: 'Besoin restant en N+1',
          valeur: n1.besoinRestant,
          unite: 'nombre',
          detail: 'Après mobilisation du vivier, avant quotas.',
        },
      ],
    }
    catalogue.ajouter(F, `${base}/indicateurs/`, q, suivi)
    const evolution: EvolutionIndicateurs = {
      points: [{ version: 1, calculeLe: REFERENCE_ISO, indicateurs: suivi.indicateurs }],
    }
    catalogue.ajouter(F, `${base}/indicateurs/evolution/`, q, evolution)
  }

  const lignesEcoles: LignePlanificationEcole[] = ecoles.map(e => ({
    schoolId: e.ecole.id,
    nomEtab: e.ecole.nom,
    region: e.ecole.region,
    departement: e.ecole.departement,
    commune: e.ecole.commune,
    sousSysteme: e.ecole.sousSysteme,
    cible: e.cible,
    annees: ANNEES_PLAN.map((annee, k) => ({
      annee,
      effectif: e.effectifs[k],
      departsRetraite: e.retraites[k],
      besoin: e.besoins[k],
      excedent: e.excedents[k],
    })),
  }))
  catalogue.ajouterListe(F, `${base}/planification/ecoles/`, {}, lignesEcoles)

  if (!tableauNational) throw new Error('Tableau national absent')
  const version: VersionPlanification = {
    version: 1,
    calculeLe: REFERENCE_ISO,
    declencheur: 'Import du jeu de démonstration',
    auteur: null,
  }
  const detail: DetailVersionPlanification = { version, tableau: tableauNational }
  catalogue.ajouter(F, `${base}/planification/versions/1/`, {}, detail)

  // Quotas calculés par région, sous-système et année.
  const quotas: QuotaRecrutement[] = []
  const historiqueQuotas: EvenementQuota[] = []
  for (const region of ctx.arbre.children) {
    for (const s of SOUS_SYSTEMES) {
      const retenues = ecolesDe(region).filter(e => sousSystemeDe(e) === s)
      if (retenues.length === 0) continue
      for (const a of indicateurs(ctx, retenues)) {
        quotas.push({
          annee: a.annee,
          codeTerritoire: region.territory.code,
          territoire: region.territory.nom,
          sousSysteme: s,
          calcule: a.quotaCalcule,
          retenu: a.quotaCalcule,
          motifAjustement: null,
          statut: 'calcule',
          ajustePar: null,
          valideLe: null,
        })
        historiqueQuotas.push({
          annee: a.annee,
          codeTerritoire: region.territory.code,
          evenement: 'calcul',
          valeur: a.quotaCalcule,
          motif: null,
          auteur: null,
          le: REFERENCE_ISO,
        })
      }
    }
  }

  const etat: EtatPlanification = {
    version: 1,
    calculeLe: REFERENCE_ISO,
    declencheur: version.declencheur,
    obsolete: false,
    scenarioRetenuId: SCENARIO_RETENU,
  }
  const historiqueHypotheses: VersionHypotheses[] = [
    {
      version: 1,
      modifieesLe: REFERENCE_ISO,
      modifieesPar: AUTEUR_INITIAL,
      motif: 'Hypothèses par défaut',
      hypotheses,
    },
  ]
  const estimationAttrition: EstimationAttrition = {
    tauxPropose: null,
    methode: 'Comparaison des effectifs entre deux actualisations successives',
    base: 'Une seule photographie des effectifs est disponible pour ce jeu.',
    avertissements: ['Il faut au moins une actualisation des fichiers pour estimer un taux observé.'],
  }

  return {
    hypotheses,
    historiqueHypotheses,
    quotas,
    historiqueQuotas,
    versionsPlanification: [version],
    etatPlanification: etat,
    estimationAttrition,
  }
}
