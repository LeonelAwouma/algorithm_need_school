/**
 * Serveur de référence — contexte « Diagnostic » : diagnostic du périmètre,
 * vue territoriale, options des filtres, priorités et synthèse.
 *
 * Chaque réponse est enregistrée pour tous les nœuds de l'arbre territorial
 * (national, régions, départements, communes) et, quand elle en dépend, pour
 * chaque scénario calculé.
 */

import { trierParPriorite } from '../../lib/analytics/diagnostic'
import {
  diagnosticTerritorial,
  pointsAttention,
  reductionDuDeficit,
  syntheseTableauDeBord,
} from '../../lib/analytics/narrative'
import { syntheseTerritoriale } from '../../lib/analytics/synthese'
import { breadcrumb, selectionLabel, selectionLevel, territoiresMixtes } from '../../lib/analytics/territory'
import { calculerFlux, restreindreResultat } from '../../lib/simulation/filter'
import type { SchoolDiagnostic, SchoolSeverity, TerritorialSummary, ZoneSecurite } from '../../types/education'
import type { SimulationResult } from '../../types/simulation'
import type {
  BesoinTerritoireEnfant,
  DiagnosticPerimetre,
  MouvementsTerritoire,
  OptionsFiltres,
  Priorites,
  RepartitionZoneSecurite,
  SyntheseDiagnostic,
  TerritorySelection,
  VueTerritoriale,
} from '../../../frontend/components/shared/api/contrat'
import { JEU, noeuds, type Contexte } from './contexte'
import { json, nettoyerQuery, type Catalogue, type Query } from './outils'

const F = 'diagnostic'
const SEVERITES: SchoolSeverity[] = [
  'excedent',
  'satisfaisant',
  'deficit_faible',
  'deficit_important',
  'deficit_critique',
]
const ZONES_SECURITE: ZoneSecurite[] = ['verte', 'jaune', 'rouge']

/** Sélection correspondant à un nœud de l'arbre. */
export function selectionDe(noeud: TerritorialSummary): TerritorySelection {
  return { region: noeud.territory.region, departement: noeud.territory.departement, commune: noeud.territory.commune }
}

/** Paramètres de requête d'une sélection territoriale. */
export function querySelection(selection: TerritorySelection, extra: Record<string, string> = {}): Query {
  return nettoyerQuery({ ...selection, ...extra })
}

/** Résultat d'un scénario vu depuis un périmètre : complet au national, restreint ailleurs. */
export function resultatDuPerimetre(resultat: SimulationResult, noeud: TerritorialSummary): SimulationResult {
  return noeud.territory.level === 'national' ? resultat : restreindreResultat(resultat, new Set(noeud.schoolIds))
}

/** Écoles du périmètre d'un nœud. */
export function diagnosticsDe(ctx: Contexte, noeud: TerritorialSummary): SchoolDiagnostic[] {
  const ids = new Set(noeud.schoolIds)
  return ctx.diagnostic.schools.filter(d => ids.has(d.school.id))
}

function mouvementsEnfants(noeud: TerritorialSummary, resultat: SimulationResult | null): MouvementsTerritoire[] {
  if (!resultat) return []
  return noeud.children.map(enfant => {
    const flux = calculerFlux(resultat, new Set(enfant.schoolIds))
    return {
      territoire: enfant.territory.nom,
      besoin: flux.besoinInitial,
      couverts: flux.postesCouverts,
      residuel: flux.besoinResiduel,
      recus: flux.enseignantsRecus,
      sortants: flux.enseignantsSortants,
      solde: flux.solde,
    }
  })
}

function parZoneSecurite(
  diagnostics: SchoolDiagnostic[],
  resultat: SimulationResult | null,
): RepartitionZoneSecurite[] {
  return ZONES_SECURITE.map(zone => {
    const ecoles = diagnostics.filter(d => (d.school.zoneSecurite ?? 'verte') === zone)
    const ids = new Set(ecoles.map(d => d.school.id))
    return {
      zone,
      ecoles: ecoles.length,
      nonRenseignees: zone === 'verte' ? ecoles.filter(d => d.school.zoneSecurite === null).length : 0,
      enDeficit: ecoles.filter(d => d.besoinTheorique > 0).length,
      postesManquants: ecoles.reduce((s, d) => s + d.besoinTheorique, 0),
      restantsApresScenario: resultat ? resultat.uncoveredPosts.filter(p => ids.has(p.schoolId)).length : null,
    }
  })
}

function besoinsParEnfant(noeud: TerritorialSummary, resultat: SimulationResult | null): BesoinTerritoireEnfant[] {
  return noeud.children
    .filter(e => e.totals.postesNecessaires > 0)
    .map(e => {
      const couverts = resultat ? calculerFlux(resultat, new Set(e.schoolIds)).postesCouverts : 0
      const postesNecessaires = e.totals.postesNecessaires
      return {
        territoire: e.territory,
        postesNecessaires,
        couverts,
        restant: Math.max(0, postesNecessaires - couverts),
        taux: postesNecessaires > 0 ? Math.round((couverts / postesNecessaires) * 100) : 0,
      }
    })
    .sort((a, b) => b.postesNecessaires - a.postesNecessaires)
    .slice(0, 12)
}

/** Enregistre les routes du diagnostic pour chaque nœud et chaque scénario. */
export function routesDiagnostic(ctx: Contexte, catalogue: Catalogue): void {
  const base = `jeux/${JEU}`
  const types = [...new Set(ctx.diagnostic.schools.map(d => d.school.typeEtab).filter(Boolean))].sort()
  const zones = [...new Set(ctx.diagnostic.schools.map(d => d.school.zone))].sort()
  const variantesScenario: [Record<string, string>, SimulationResult | null][] = [
    [{}, null],
    ...ctx.scenarios.map(s => [{ scenario: s.scenario.id }, s.resultat] as [Record<string, string>, SimulationResult]),
  ]

  for (const noeud of noeuds(ctx.arbre)) {
    const selection = selectionDe(noeud)
    const q = querySelection(selection)
    const diagnostics = diagnosticsDe(ctx, noeud)
    const perimetre = selectionLabel(selection)

    const diagnostic: DiagnosticPerimetre = {
      totals: noeud.totals,
      ecoles: json(trierParPriorite(diagnostics)),
      ecolesDuJeu: ctx.diagnostic.schools.length,
      donneesElevesDisponibles: ctx.diagnostic.donneesElevesDisponibles,
      ecolesEnRepli: diagnostics.filter(d => d.calcul.methode === 'repli_classes').length,
      ecolesSansSalles: diagnostics.filter(d => d.calcul.bmax === null).length,
    }
    catalogue.ajouter(F, `${base}/diagnostic/`, q, diagnostic)

    const enDeficit = trierParPriorite(diagnostics).filter(d => d.besoinTheorique > 0)
    const priorites: Priorites = { ecoles: json(enDeficit), total: enDeficit.length }
    catalogue.ajouter(F, `${base}/priorites/`, q, priorites)

    const regionNoeud = selection.region ? ctx.arbre.children.find(c => c.territory.nom === selection.region) : null
    const deptNoeud =
      regionNoeud && selection.departement
        ? regionNoeud.children.find(c => c.territory.nom === selection.departement)
        : null
    const options: OptionsFiltres = {
      regions: ctx.arbre.children.map(c => c.territory.nom),
      departements: regionNoeud ? regionNoeud.children.map(c => c.territory.nom) : [],
      communes: deptNoeud ? deptNoeud.children.map(c => c.territory.nom) : [],
      typesEtab: types,
      zones,
    }
    catalogue.ajouter(F, `${base}/territoires/options/`, q, options)

    const enseignantsLus = ctx.dataset.teachers.filter(t => noeud.schoolIds.includes(t.idEtabAttache)).length
    for (const [extra, complet] of variantesScenario) {
      const resultat = complet ? resultatDuPerimetre(complet, noeud) : null
      const qs = querySelection(selection, extra)

      const vue: VueTerritoriale = {
        niveau: selectionLevel(selection),
        perimetre,
        noeud,
        enfants: noeud.children,
        filAriane: breadcrumb(selection),
        mouvementsEnfants: mouvementsEnfants(noeud, complet),
      }
      catalogue.ajouter(F, `${base}/territoires/`, qs, vue)

      const parSeverite = Object.fromEntries(
        SEVERITES.map(s => [s, diagnostics.filter(d => d.severite === s).length]),
      ) as Record<SchoolSeverity, number>
      const synthese: SyntheseDiagnostic = {
        perimetre,
        totals: noeud.totals,
        syntheseTableauDeBord: syntheseTableauDeBord(noeud.totals, resultat, perimetre),
        diagnosticTerritorial: diagnosticTerritorial(noeud.totals, enseignantsLus, resultat, perimetre),
        pointsAttention: pointsAttention(diagnostics, noeud, null),
        territoiresMixtes: territoiresMixtes(noeud.children),
        syntheseTerritoriale: syntheseTerritoriale(diagnostics, ctx.settings),
        parSeverite,
        parZoneSecurite: parZoneSecurite(diagnostics, resultat),
        besoinsParEnfant: besoinsParEnfant(noeud, complet),
        reductionDeficit: resultat ? reductionDuDeficit(resultat) : null,
      }
      catalogue.ajouter(F, `${base}/synthese/`, qs, synthese)
    }
  }
}
