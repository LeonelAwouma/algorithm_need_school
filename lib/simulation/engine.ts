/**
 * MOTEUR B — Simulation d'affectation.
 *
 * Il part du diagnostic (Moteur A) et n'y touche pas : il consomme des postes à
 * couvrir et un vivier déjà borné par les excédents. Son seul rôle est de
 * proposer quel enseignant pourrait couvrir quel poste, selon quelles règles et
 * avec quel score.
 *
 * Pipeline (§14) :
 *   postes à couvrir → vivier mobilisable → périmètre géographique →
 *   barème individuel → score enseignant ↔ poste → affectation séquentielle →
 *   vérification des invariants → analyse avant / après.
 */

import type { SchoolDiagnostic } from '../../types/education'
import type {
  EngineSettings,
  GeographicScope,
  PoolTeacher,
  ProposedAssignment,
  ProximityLevel,
  SimulationLogEntry,
  SimulationResult,
  SimulationScenario,
  SituationSnapshot,
  TeachingPost,
} from '../../types/simulation'
import type { Teacher } from '../../types/education'
import type { FaitPrinceApplique } from '../../types/prince'
import { lower, round2 } from '../data/normalize'
import { besoinNormatif } from '../analytics/diagnostic'
import { construirePostes, nombreDePostes } from './posts'
import { construireVivier } from './pool'
import { niveauProximite, scoreEnseignantPoste } from './scoring'
import { verifierInvariants } from './invariants'

/** Index des postes disponibles, pour éviter de balayer toute la liste par enseignant. */
class IndexPostes {
  private readonly parCommune = new Map<string, TeachingPost[]>()
  private readonly parDepartement = new Map<string, TeachingPost[]>()
  private readonly tous: TeachingPost[]

  constructor(postes: TeachingPost[]) {
    this.tous = postes
    for (const p of postes) {
      const c = lower(p.commune)
      const d = lower(p.departement)
      const listeC = this.parCommune.get(c)
      if (listeC) listeC.push(p)
      else this.parCommune.set(c, [p])
      const listeD = this.parDepartement.get(d)
      if (listeD) listeD.push(p)
      else this.parDepartement.set(d, [p])
    }
  }

  /** Postes encore ouverts compatibles avec le périmètre demandé. */
  candidats(ens: Teacher, perimetre: GeographicScope): TeachingPost[] {
    if (perimetre === 'commune') return this.parCommune.get(lower(ens.communeAttache)) ?? []
    if (perimetre === 'departement') return this.parDepartement.get(lower(ens.departementAttache)) ?? []
    return this.tous
  }
}

/** Périmètre effectif d'une phase : le plus restrictif entre le scénario et la phase. */
function perimetreEffectif(scope: GeographicScope, phase: GeographicScope): GeographicScope {
  const rang: Record<GeographicScope, number> = { commune: 0, departement: 1, etendu: 2 }
  return rang[phase] < rang[scope] ? phase : scope
}

interface OptionsPhase {
  nom: string
  perimetre: GeographicScope
  filtre?: (p: PoolTeacher) => boolean
}

/**
 * Une passe d'affectation : chaque enseignant encore disponible, dans l'ordre
 * du barème, prend le meilleur poste encore ouvert de son périmètre.
 */
function executerPhase(
  vivier: PoolTeacher[],
  index: IndexPostes,
  settings: EngineSettings,
  scope: GeographicScope,
  options: OptionsPhase,
): ProposedAssignment[] {
  const affectations: ProposedAssignment[] = []
  const perimetre = perimetreEffectif(scope, options.perimetre)

  for (const candidat of vivier) {
    if (candidat.affecte) continue
    if (options.filtre && !options.filtre(candidat)) continue

    const ens = candidat.teacher
    let meilleurPoste: TeachingPost | null = null
    let meilleurScore = -Infinity

    for (const poste of index.candidats(ens, perimetre)) {
      if (poste.pourvu) continue
      // Un enseignant n'est jamais proposé sur un poste de sa propre école :
      // le mouvement n'aurait aucun effet sur la couverture.
      if (poste.schoolId === ens.idEtabAttache) continue
      const detail = scoreEnseignantPoste(ens, candidat.bareme, poste, settings.scoring, settings.phases)
      if (detail.total > meilleurScore) {
        meilleurScore = detail.total
        meilleurPoste = poste
      }
    }

    if (!meilleurPoste) continue

    const breakdown = scoreEnseignantPoste(ens, candidat.bareme, meilleurPoste, settings.scoring, settings.phases)
    candidat.affecte = true
    meilleurPoste.pourvu = true

    affectations.push({
      phase: options.nom,
      postId: meilleurPoste.id,
      teacherId: ens.id,
      nomEns: ens.nom,
      prenomEns: ens.prenom,

      schoolOrigineId: ens.idEtabAttache,
      nomEtabOrigine: candidat.ecoleOrigine.nom,
      communeOrigine: ens.communeAttache,
      departementOrigine: ens.departementAttache,
      regionOrigine: ens.regionAttache,

      schoolDestinationId: meilleurPoste.schoolId,
      nomEtabDestination: meilleurPoste.nomEtab,
      communeDestination: meilleurPoste.commune,
      departementDestination: meilleurPoste.departement,
      regionDestination: meilleurPoste.region,

      niveauProximite: niveauProximite(ens, meilleurPoste),
      bareme: candidat.bareme,
      score: breakdown.total,
      breakdown,
    })
  }

  return affectations
}

/** Photographie de la situation de départ, telle que le diagnostic la décrit. */
function snapshotAvant(diagnostics: SchoolDiagnostic[], settings: EngineSettings, besoinInitial: number): SituationSnapshot {
  const parRegion = new Map<string, number>()
  let sommePression = 0
  let nbPression = 0

  for (const d of diagnostics) {
    const postes = nombreDePostes(d, settings)
    if (postes > 0) {
      const region = d.school.region || 'Région non renseignée'
      parRegion.set(region, (parRegion.get(region) ?? 0) + postes)
    }
    if (d.elevesParEnseignantEtat != null) {
      sommePression += d.elevesParEnseignantEtat
      nbPression++
    }
  }

  return {
    ecolesEnDeficit: diagnostics.filter(d => nombreDePostes(d, settings) > 0).length,
    postesVacants: besoinInitial,
    deficitTotal: besoinInitial,
    parRegion: [...parRegion.entries()]
      .map(([region, deficit]) => ({ region, deficit }))
      .sort((a, b) => b.deficit - a.deficit),
    pressionMoyenne: nbPression > 0 ? round2(sommePression / nbPression) : null,
  }
}

/** Photographie de la situation après application des propositions. */
function snapshotApres(
  diagnostics: SchoolDiagnostic[],
  settings: EngineSettings,
  assignments: ProposedAssignment[],
): { snapshot: SituationSnapshot; effectifsApres: Map<string, number> } {
  const arrivees = new Map<string, number>()
  const departs = new Map<string, number>()
  for (const a of assignments) {
    arrivees.set(a.schoolDestinationId, (arrivees.get(a.schoolDestinationId) ?? 0) + 1)
    departs.set(a.schoolOrigineId, (departs.get(a.schoolOrigineId) ?? 0) + 1)
  }

  const parRegion = new Map<string, number>()
  const effectifsApres = new Map<string, number>()
  let ecolesEnDeficit = 0
  let deficitTotal = 0
  let sommePression = 0
  let nbPression = 0

  for (const d of diagnostics) {
    const etatApres = d.enseignantsEtat + (arrivees.get(d.school.id) ?? 0) - (departs.get(d.school.id) ?? 0)
    effectifsApres.set(d.school.id, etatApres)

    const besoinApres = Math.max(0, besoinNormatif(d.school, settings) - etatApres)
    // Quand les postes viennent des déclarations, le reste à pourvoir est le
    // nombre de postes déclarés non couverts, et non le besoin recalculé.
    const resteApres =
      settings.sourceDesPostes === 'besoinCalcule'
        ? besoinApres
        : Math.max(0, nombreDePostes(d, settings) - (arrivees.get(d.school.id) ?? 0))

    if (resteApres > 0) {
      ecolesEnDeficit++
      deficitTotal += resteApres
      const region = d.school.region || 'Région non renseignée'
      parRegion.set(region, (parRegion.get(region) ?? 0) + resteApres)
    }

    if (d.school.effectifTotalEleves != null && etatApres > 0) {
      sommePression += d.school.effectifTotalEleves / etatApres
      nbPression++
    }
  }

  return {
    snapshot: {
      ecolesEnDeficit,
      postesVacants: deficitTotal,
      deficitTotal,
      parRegion: [...parRegion.entries()]
        .map(([region, deficit]) => ({ region, deficit }))
        .sort((a, b) => b.deficit - a.deficit),
      pressionMoyenne: nbPression > 0 ? round2(sommePression / nbPression) : null,
    },
    effectifsApres,
  }
}

export interface SimulationInput {
  /** Diagnostic calculé sur des données où les faits de Prince sont déjà appliqués. */
  diagnostics: SchoolDiagnostic[]
  teachers: Teacher[]
  scenario: SimulationScenario
  /** Décisions de la DRH déjà appliquées aux données, reprises dans le résultat et le journal. */
  faitsPrince?: FaitPrinceApplique[]
}

/**
 * Exécute une simulation complète pour un scénario donné.
 * Les objets d'entrée ne sont pas modifiés : postes et vivier sont reconstruits
 * à chaque appel, ce qui rend deux exécutions du même scénario identiques.
 */
export function runSimulation(input: SimulationInput): SimulationResult {
  const { diagnostics, teachers, scenario } = input
  const settings = scenario.settings
  const logs: SimulationLogEntry[] = []
  const faitsPrince = input.faitsPrince ?? []
  const nbFaitsPrince = faitsPrince.filter(e => e.statut === 'applique').length
  if (nbFaitsPrince > 0) {
    logs.push({
      etape: 'Fait de Prince',
      message:
        'Redéploiements décidés par la DRH, appliqués avant le calcul et pris en compte comme acquis : effectifs des écoles mis à jour, enseignants exclus du vivier.',
      valeur: nbFaitsPrince,
    })
  }

  const postes = construirePostes(diagnostics, settings)
  const besoinInitial = postes.length
  logs.push({ etape: 'Postes à couvrir', message: `Construits à partir de « ${libelleSourcePostes(settings)} ».`, valeur: besoinInitial })

  const pool = construireVivier(teachers, diagnostics, settings)
  logs.push({ etape: 'Vivier mobilisable', message: `Enseignants retenus, dans la limite de l'excédent de chaque école.`, valeur: pool.teachers.length })
  logs.push({ etape: 'Excédent théorique total', message: "Somme des excédents calculés école par école, avant contrainte géographique.", valeur: pool.excedentTotal })
  for (const ex of pool.exclusions) {
    logs.push({ etape: 'Exclusion du vivier', message: ex.label, valeur: ex.count })
  }

  const index = new IndexPostes(postes)
  const vivier = pool.teachers
  const assignments: ProposedAssignment[] = []
  const phases = settings.phases

  const executer = (options: OptionsPhase) => {
    const avant = assignments.length
    assignments.push(...executerPhase(vivier, index, settings, scenario.scope, options))
    logs.push({ etape: `Phase — ${options.nom}`, message: 'Propositions ajoutées par cette phase.', valeur: assignments.length - avant })
  }

  if (phases.phaseEffetPrince) {
    executer({ nom: 'Passage prioritaire', perimetre: 'etendu' })
  }
  if (phases.phase1Commune) {
    executer({ nom: 'Même commune', perimetre: 'commune' })
  }
  if (phases.phase2Departement) {
    executer({ nom: 'Même département', perimetre: 'departement' })
  }
  if (phases.phase3JeunesVersMultigrades) {
    const seuil = settings.scoring.seuils.ageJeuneAns
    executer({
      nom: 'Jeunes enseignants vers classes multigrades',
      perimetre: 'etendu',
      filtre: p => p.teacher.age != null && p.teacher.age <= seuil,
    })
  }
  if (phases.phase3AnciensRuralVersUrbain) {
    executer({
      nom: 'Anciens en zone rurale vers zone urbaine',
      perimetre: 'etendu',
      filtre: p => p.teacher.zoneAttache === 'rurale' && p.teacher.anciennetePosteAns >= 5,
    })
  }
  if (phases.phase4Reste) {
    executer({ nom: 'Répartition du reste', perimetre: 'etendu' })
  }

  const unmatchedTeachers = vivier.filter(p => !p.affecte)
  const uncoveredPosts = postes.filter(p => !p.pourvu)

  const before = snapshotAvant(diagnostics, settings, besoinInitial)
  const { snapshot: after, effectifsApres } = snapshotApres(diagnostics, settings, assignments)

  const ecolesBeneficiaires = new Set(assignments.map(a => a.schoolDestinationId)).size
  const ecolesSources = new Set(assignments.map(a => a.schoolOrigineId)).size

  const compteurPerimetre = new Map<ProximityLevel, number>()
  for (const a of assignments) compteurPerimetre.set(a.niveauProximite, (compteurPerimetre.get(a.niveauProximite) ?? 0) + 1)

  const resultat: SimulationResult = {
    scenarioId: scenario.id,
    scenarioNom: scenario.nom,
    scope: scenario.scope,

    besoinInitial,
    postesCouverts: assignments.length,
    besoinResiduel: uncoveredPosts.length,
    enseignantsDeplaces: assignments.length,
    ecolesBeneficiaires,
    ecolesSources,
    tauxCouverture: besoinInitial > 0 ? assignments.length / besoinInitial : 0,
    mouvementsParPerimetre: (['meme_commune', 'meme_departement', 'meme_region', 'hors_region'] as ProximityLevel[])
      .map(niveau => ({ niveau, nombre: compteurPerimetre.get(niveau) ?? 0 }))
      .filter(m => m.nombre > 0),

    assignments,
    unmatchedTeachers,
    uncoveredPosts,
    pool,

    before,
    after,

    faitsPrince,

    invariants: [],
    logs,
    computedAt: new Date().toISOString(),
  }

  resultat.invariants = verifierInvariants(resultat, diagnostics, settings, effectifsApres)
  logs.push({
    etape: 'Vérifications',
    message: 'Invariants métier contrôlés après simulation.',
    valeur: resultat.invariants.filter(i => i.ok).length,
  })

  return resultat
}

function libelleSourcePostes(settings: EngineSettings): string {
  switch (settings.sourceDesPostes) {
    case 'postesDeclares':
      return 'postes officiellement déclarés'
    case 'maximum':
      return 'maximum entre besoin calculé et postes déclarés'
    default:
      return 'besoin calculé école par école'
  }
}
