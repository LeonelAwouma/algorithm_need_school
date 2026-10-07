/**
 * MOTEUR B — Plan de rotation et de redéploiement (Référentiel technique, §3).
 *
 * Il part du diagnostic (Moteur A) et n'y touche pas. Il rapproche deux
 * populations — les postes ouverts des écoles nécessiteuses et des structures
 * d'accueil, et les enseignants qui demandent une mutation — puis traite les
 * situations résiduelles. Dans l'ordre :
 *
 *   0. décisions des commissions déjà prises (validations, corrections, rejets) ;
 *   1. référentiel des postes, classé par indice de priorité u (§3.1) ;
 *   2. synthèse des vœux, recevabilité et score S = A + Z + B (§3.2, §3.3) ;
 *   3. acceptation différée sur les vœux intrarégionaux — niveau régional (§3.4) ;
 *   4. acceptation différée sur les vœux interrégionaux — niveau central (§3.6),
 *      dans le scénario étendu ;
 *   5. solution la plus proche pour les demandes non satisfaites, hors vœux et
 *      hors zone rouge (§3.5) ;
 *   6. combinaisons proposées à la commission pour les écoles non couvertes (§3.5) ;
 *   7. redéploiement obligatoire depuis les écoles excédentaires (§3.7) ;
 *   8. recalcul des besoins, déploiement des nouveaux recrutés sur les postes
 *      restés vacants (§3.8) et projection N+2 du vivier (§3.9).
 *
 * À chaque étape : un poste n'est proposé qu'à un enseignant du même
 * sous-système, et les départs d'une école restent dans la limite de son
 * excédent x. Le moteur produit des propositions, pas des décisions (§3.10).
 */

import type { School, SchoolDiagnostic, Teacher } from '../../types/education'
import type {
  Candidature,
  CombinaisonArbitrage,
  DecisionArbitrage,
  DecisionArbitrageAppliquee,
  NatureMouvement,
  ProjectionN2,
  ProposedAssignment,
  ProximityLevel,
  Recrue,
  ScoreBreakdown,
  SimulationLogEntry,
  SimulationResult,
  SimulationScenario,
  SituationSnapshot,
  StatutProposition,
  TeachingPost,
  TourAppariement,
  VoeuAutreSousSysteme,
  VoeuExamine,
} from '../../types/simulation'
import type { FaitPrinceApplique } from '../../types/prince'
import { lower, round2 } from '../data/normalize'
import { ageA, runDiagnostic } from '../analytics/diagnostic'
import { syntheseTerritoriale } from '../analytics/synthese'
import { dateRentree } from '../config/settings'
import { accepterDiffere } from './appariement'
import {
  IndexUnites,
  construireCandidatures,
  dansLePerimetre,
  departager,
  detaillerScore,
  scoreBase,
  sousSystemesCompatibles,
} from './candidatures'
import { verifierInvariants } from './invariants'
import { construireVivier } from './pool'
import { construirePostes, nombreDePostes } from './posts'
import { deployerRecrues } from './recrutes'
import { RANG_PROXIMITE, calculerBaremeIndividuel, niveauProximite, scoreAppariement } from './scoring'
import { motifJustifie } from './candidatures'
import { projeterPluriannuel } from './projection'

export interface SimulationInput {
  /** Diagnostic calculé sur des données où les faits de Prince sont déjà appliqués. */
  diagnostics: SchoolDiagnostic[]
  /**
   * Établissements bruts. Quand ils sont fournis, le diagnostic est recalculé avec
   * les paramètres figés du scénario : un scénario qui change une règle du besoin
   * (double flux, norme, minimum pédagogique…) en voit tout l'effet.
   */
  schools?: School[]
  teachers: Teacher[]
  scenario: SimulationScenario
  faitsPrince?: FaitPrinceApplique[]
  /** Structures administratives d'accueil (délégations, IAEB). */
  structures?: School[]
  /** Décisions des commissions d'arbitrage, appliquées avant l'algorithme. */
  arbitrages?: DecisionArbitrage[]
  /** Candidats au concours, déployés sur les postes restés vacants. */
  recrues?: Recrue[]
}

/** Trace des départs autorisés par école : jamais plus que l'excédent x. */
class Departs {
  private readonly restants = new Map<string, number>()
  constructor(diagnostics: SchoolDiagnostic[]) {
    for (const d of diagnostics) this.restants.set(d.school.id, d.excedentTheorique)
  }
  restant(schoolId: string): number {
    return this.restants.get(schoolId) ?? 0
  }
  consommer(schoolId: string): void {
    this.restants.set(schoolId, this.restant(schoolId) - 1)
  }
  copie(): Map<string, number> {
    return new Map(this.restants)
  }
}

/** Postes ouverts par école, consommés dans l'ordre. */
class Postes {
  readonly parEcole = new Map<string, TeachingPost[]>()
  constructor(readonly tous: TeachingPost[]) {
    for (const p of tous) {
      const liste = this.parEcole.get(p.schoolId) ?? []
      liste.push(p)
      this.parEcole.set(p.schoolId, liste)
    }
  }
  libres(schoolId: string): number {
    return (this.parEcole.get(schoolId) ?? []).filter(p => !p.pourvu).length
  }
  prendre(schoolId: string): TeachingPost | null {
    const poste = (this.parEcole.get(schoolId) ?? []).find(p => !p.pourvu) ?? null
    if (poste) poste.pourvu = true
    return poste
  }
  capacites(): Map<string, number> {
    const m = new Map<string, number>()
    for (const id of this.parEcole.keys()) m.set(id, this.libres(id))
    return m
  }
}

const cle = (teacherId: string, schoolId: string) => `${teacherId}|${schoolId}`

/**
 * Apparie des candidats par acceptation différée en respectant la limite des
 * départs de chaque école d'attache (§3.2, §5.4 étape 4) : au-delà de l'excédent,
 * les candidats les moins bien classés de l'école voient leur départ non validé,
 * puis l'algorithme est relancé sans eux.
 */
function apparierAvecPlafond(
  candidats: Candidature[],
  listePour: (c: Candidature) => VoeuExamine[],
  capacites: Map<string, number>,
  departsRestants: (schoolId: string) => number,
  niveau: string,
  ordre: 'voeux' | 'poids',
): { matches: Map<string, VoeuExamine>; exclus: Set<string>; tours: TourAppariement[]; tronque: boolean } {
  const parId = new Map(candidats.map(c => [c.teacher.id, c]))
  const exclus = new Set<string>()
  let tours: TourAppariement[] = []
  let tronque = false

  for (let iteration = 0; iteration < candidats.length + 1; iteration++) {
    const listes = new Map<string, VoeuExamine[]>()
    const participants = candidats
      .filter(c => !exclus.has(c.teacher.id))
      .map(c => {
        const voeux = [...listePour(c)]
        if (ordre === 'poids') voeux.sort((a, b) => b.poidsExamen - a.poidsExamen || a.rang - b.rang)
        listes.set(c.teacher.id, voeux)
        return { id: c.teacher.id, liste: voeux.map(v => v.schoolId as string) }
      })

    const scorePour = (teacherId: string, schoolId: string) =>
      listes.get(teacherId)?.find(v => v.schoolId === schoolId)?.score ?? 0

    const res = accepterDiffere(
      participants,
      capacites,
      (schoolId, a, b) =>
        departager(
          { score: scorePour(a, schoolId), teacher: (parId.get(a) as Candidature).teacher },
          { score: scorePour(b, schoolId), teacher: (parId.get(b) as Candidature).teacher },
        ),
      niveau,
    )
    tours = res.tours
    tronque = res.tronque

    // Limite des départs par école d'attache.
    const parOrigine = new Map<string, string[]>()
    for (const teacherId of res.affectations.keys()) {
      const origine = (parId.get(teacherId) as Candidature).teacher.idEtabAttache
      parOrigine.set(origine, [...(parOrigine.get(origine) ?? []), teacherId])
    }
    let depassement = false
    for (const [origine, ids] of parOrigine) {
      const limite = Math.max(0, departsRestants(origine))
      if (ids.length <= limite) continue
      depassement = true
      ids.sort((a, b) =>
        departager(
          { score: scorePour(a, res.affectations.get(a) as string), teacher: (parId.get(a) as Candidature).teacher },
          { score: scorePour(b, res.affectations.get(b) as string), teacher: (parId.get(b) as Candidature).teacher },
        ),
      )
      for (const id of ids.slice(limite)) exclus.add(id)
    }

    if (!depassement) {
      const matches = new Map<string, VoeuExamine>()
      for (const [teacherId, schoolId] of res.affectations) {
        const voeu = listes.get(teacherId)?.find(v => v.schoolId === schoolId)
        if (voeu) matches.set(teacherId, voeu)
      }
      return { matches, exclus, tours, tronque }
    }
  }
  return { matches: new Map(), exclus, tours, tronque }
}

/** Photographie de la situation de départ, telle que le diagnostic la décrit. */
function snapshotAvant(diagnostics: SchoolDiagnostic[], settings: SimulationScenario['settings'], besoinInitial: number): SituationSnapshot {
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
    parRegion: [...parRegion.entries()].map(([region, deficit]) => ({ region, deficit })).sort((a, b) => b.deficit - a.deficit),
    pressionMoyenne: nbPression > 0 ? round2(sommePression / nbPression) : null,
  }
}

/** Effectifs après le plan, et situation recalculée (§2.4 appliqué aux effectifs nouveaux). */
function snapshotApres(
  diagnostics: SchoolDiagnostic[],
  settings: SimulationScenario['settings'],
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
    const besoinApres = Math.max(0, d.calcul.cible - etatApres)
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
      parRegion: [...parRegion.entries()].map(([region, deficit]) => ({ region, deficit })).sort((a, b) => b.deficit - a.deficit),
      pressionMoyenne: nbPression > 0 ? round2(sommePression / nbPression) : null,
    },
    effectifsApres,
  }
}

/**
 * Exécute le plan complet pour un scénario donné. Les objets d'entrée ne sont
 * pas modifiés : postes, candidatures et vivier sont reconstruits à chaque appel,
 * ce qui rend deux exécutions du même scénario identiques.
 */
export function runSimulation(input: SimulationInput): SimulationResult {
  const { teachers, scenario } = input
  const settings = scenario.settings
  const diagnosticScenario = input.schools ? runDiagnostic(input.schools, settings, teachers) : null
  const diagnostics = diagnosticScenario?.schools ?? input.diagnostics
  const m = settings.mobilite
  const scope = scenario.scope
  const structures = diagnosticScenario?.structures ?? input.structures ?? []
  const faitsPrince = input.faitsPrince ?? []
  const logs: SimulationLogEntry[] = []

  const nbFaitsPrince = faitsPrince.filter(e => e.statut === 'applique').length
  if (nbFaitsPrince > 0) {
    logs.push({
      etape: 'Fait de Prince',
      message: 'Redéploiements décidés par la DRH, appliqués avant le calcul comme acquis : effectifs mis à jour, enseignants hors de tout mouvement.',
      valeur: nbFaitsPrince,
    })
  }

  const diagParId = new Map(diagnostics.map(d => [d.school.id, d]))
  const unites = new IndexUnites([...diagnostics.map(d => d.school), ...structures])
  const teacherParId = new Map<string, Teacher>()
  for (const t of teachers) if (t.id && !teacherParId.has(t.id)) teacherParId.set(t.id, t)

  // 1 — Référentiel des postes, classé par priorité.
  const postes = new Postes(construirePostes(diagnostics, settings, structures))
  const besoinInitial = postes.tous.length
  logs.push({ etape: 'Postes ouverts', message: `Écoles nécessiteuses et structures d'accueil, classées par indice de priorité u = w + β.`, valeur: besoinInitial })

  const departs = new Departs(diagnostics)
  const assignments: ProposedAssignment[] = []
  const affectes = new Set<string>()
  const interdits = new Set<string>()

  const affecter = (
    t: Teacher,
    poste: TeachingPost,
    o: { phase: string; nature: NatureMouvement; rangVoeu: number | null; statut: StatutProposition; bareme: number; breakdown: ScoreBreakdown; arbitrageId?: string },
  ) => {
    affectes.add(t.id)
    departs.consommer(t.idEtabAttache)
    assignments.push({
      phase: o.phase,
      nature: o.nature,
      rangVoeu: o.rangVoeu,
      statut: o.statut,
      annee: 'N+1',
      postId: poste.id,
      teacherId: t.id,
      nomEns: t.nom,
      prenomEns: t.prenom,
      sousSysteme: t.sousSysteme,
      schoolOrigineId: t.idEtabAttache,
      nomEtabOrigine: unites.parId.get(t.idEtabAttache)?.nom ?? t.idEtabAttache,
      communeOrigine: t.communeAttache,
      departementOrigine: t.departementAttache,
      regionOrigine: t.regionAttache,
      schoolDestinationId: poste.schoolId,
      nomEtabDestination: poste.nomEtab,
      communeDestination: poste.commune,
      departementDestination: poste.departement,
      regionDestination: poste.region,
      niveauProximite: niveauProximite(t, poste),
      bareme: o.bareme,
      score: o.breakdown.total,
      breakdown: o.breakdown,
      arbitrageId: o.arbitrageId,
    })
  }

  // 0 — Décisions d'arbitrage : la proposition initiale est conservée dans la décision,
  // les corrections sont appliquées avant l'algorithme, qui est relancé sur le reste.
  const arbitrages: DecisionArbitrageAppliquee[] = []
  for (const decision of input.arbitrages ?? []) {
    const t = teacherParId.get(decision.teacherId)
    const refuser = (motif: string) => arbitrages.push({ decision, appliquee: false, motif })
    if (!t) {
      refuser("Enseignant absent des données chargées.")
      continue
    }
    if (decision.decision === 'rejeter') {
      if (decision.propositionInitiale) interdits.add(cle(t.id, decision.propositionInitiale.schoolId))
      arbitrages.push({ decision, appliquee: true, motif: 'Proposition écartée : l’algorithme est relancé sans elle.' })
      continue
    }
    const destination = decision.decision === 'valider' ? decision.propositionInitiale?.schoolId : decision.schoolDestinationId
    if (!destination) {
      refuser('Aucune école de destination.')
      continue
    }
    if (affectes.has(t.id)) {
      refuser('Une autre décision affecte déjà cet enseignant.')
      continue
    }
    const unite = unites.parId.get(destination)
    if (!unite) {
      refuser('École de destination absente des données chargées.')
      continue
    }
    if (!sousSystemesCompatibles(t.sousSysteme, unite.sousSysteme) && !decision.changementSousSysteme) {
      refuser('Poste de l’autre sous-système : un changement de sous-système doit être décidé explicitement.')
      continue
    }
    if (diagParId.has(t.idEtabAttache) && departs.restant(t.idEtabAttache) <= 0) {
      refuser("Le départ dépasserait l'excédent de l'école d'attache.")
      continue
    }
    const poste = postes.prendre(destination)
    if (!poste) {
      refuser("Plus aucun poste ouvert dans l'école retenue.")
      continue
    }
    const rang = t.voeux.findIndex(code => unites.resoudre(code, t.sousSysteme)?.id === destination)
    affecter(t, poste, {
      phase: decision.decision === 'valider' ? 'Validé par la commission' : 'Décision de la commission',
      nature: decision.decision === 'valider' ? decision.propositionInitiale?.nature ?? 'voeu' : 'arbitrage',
      rangVoeu: rang >= 0 ? rang + 1 : null,
      statut: decision.decision === 'valider' ? 'valide' : 'arbitre',
      bareme: 0,
      breakdown: { total: 0, components: [{ label: `Décision de la commission ${decision.instance === 'centrale' ? 'centrale' : 'régionale'} — ${decision.motif || 'sans motif saisi'}`, valeur: 0, poids: 0, contribution: 0 }] },
      arbitrageId: decision.id,
    })
    arbitrages.push({
      decision,
      appliquee: true,
      motif: decision.changementSousSysteme ? 'Appliquée, avec changement de sous-système.' : 'Appliquée.',
    })
  }
  if (arbitrages.length > 0) {
    logs.push({ etape: 'Arbitrage', message: 'Décisions des commissions appliquées avant le calcul.', valeur: arbitrages.filter(a => a.appliquee).length })
  }

  // 2 — Synthèse des vœux et scores.
  const candidatures = construireCandidatures(teachers, { diagnostics: diagParId, unites, settings, scope })
  for (const c of candidatures) {
    if (affectes.has(c.teacher.id)) {
      c.issue = 'arbitrage'
      c.detailIssue = 'Affectation décidée par la commission.'
    }
  }
  const recevables = candidatures.filter(c => c.recevable && !affectes.has(c.teacher.id))
  logs.push({ etape: 'Demandes de mutation', message: 'Enseignants ayant formulé au moins un vœu.', valeur: candidatures.length })
  logs.push({ etape: 'Demandes recevables', message: `Stabilité d'au moins ${m.stabiliteMinimaleAns} ans et école d'attache excédentaire.`, valeur: recevables.length })

  /** École visée par un motif justifié : celle désignée, sinon le premier vœu. */
  const ecoleVisee = (t: Teacher): string | null => {
    if (!motifJustifie(t)) return null
    const code = t.ecoleMotif ?? t.voeux[0]
    return code ? unites.resoudre(code, t.sousSysteme)?.id ?? null : null
  }
  const niveauDe = (schoolId: string) => diagParId.get(schoolId)?.priorite.niveauDifficulte ?? null
  /** Un poste représentatif d'une unité, pour calculer un score d'appariement même sans poste ouvert (projection N+2). */
  const posteDe = (schoolId: string): TeachingPost | null => {
    const ouvert = postes.parEcole.get(schoolId)?.[0]
    if (ouvert) return ouvert
    const d = diagParId.get(schoolId)
    if (!d) return null
    return {
      id: `${schoolId}::projete`, schoolId, nomEtab: d.school.nom, region: d.school.region, iaeb: d.school.iaeb,
      departement: d.school.departement, commune: d.school.commune, zone: d.school.zone, typeEtab: d.school.typeEtab,
      sousSysteme: d.school.sousSysteme, estStructure: false, classesMultigrades: d.school.classesMultigrades,
      prioriteLocale: d.school.prioriteLocale, deficitEcole: 0, elevesParEnseignantEtat: d.elevesParEnseignantEtat,
      priorite: d.priorite, rang: 0, pourvu: true,
    }
  }
  if (m.classementCandidats === 'score_appariement') {
    for (const c of recevables) {
      const bareme = calculerBaremeIndividuel(c.teacher, settings, niveauDe(c.teacher.idEtabAttache))
      for (const v of c.voeux) {
        const poste = v.schoolId ? posteDe(v.schoolId) : null
        if (poste) v.score = scoreAppariement(c.teacher, bareme, poste, settings, ecoleVisee(c.teacher)).total
      }
    }
  }
  const detailVoeu = (c: Candidature, v: VoeuExamine): ScoreBreakdown => {
    if (m.classementCandidats !== 'score_appariement' || !v.schoolId) return detaillerScore(c, v.bonification)
    const poste = posteDe(v.schoolId)
    const bareme = calculerBaremeIndividuel(c.teacher, settings, niveauDe(c.teacher.idEtabAttache))
    return poste ? scoreAppariement(c.teacher, bareme, poste, settings, ecoleVisee(c.teacher)) : detaillerScore(c, v.bonification)
  }

  const voeuxPossibles = (c: Candidature, interregional: boolean) =>
    c.voeux.filter(
      v => v.statut === 'examine' && v.schoolId != null && (interregional || !v.interregional) && !interdits.has(cle(c.teacher.id, v.schoolId)),
    )

  // 3 et 4 — Acceptation différée, niveau régional puis niveau central.
  const tours: TourAppariement[] = []
  let toursTronques = false
  const niveaux: { nom: string; interregional: boolean }[] = m.phaseVoeux ? [{ nom: 'Niveau régional — vœux intrarégionaux', interregional: false }] : []
  if (m.phaseVoeux && scope === 'etendu') niveaux.push({ nom: 'Niveau central — vœux interrégionaux', interregional: true })
  if (!m.phaseVoeux) logs.push({ etape: 'Vœux', message: 'Phase des vœux désactivée dans les paramètres.', valeur: null })

  for (const niveau of niveaux) {
    const libres = recevables.filter(c => !affectes.has(c.teacher.id) && c.issue !== 'depart_non_valide')
    if (libres.length === 0) continue
    const res = apparierAvecPlafond(
      libres,
      c => voeuxPossibles(c, niveau.interregional),
      postes.capacites(),
      id => departs.restant(id),
      niveau.nom,
      m.ordreExamen,
    )
    tours.push(...res.tours)
    toursTronques ||= res.tronque
    for (const id of res.exclus) {
      const c = libres.find(x => x.teacher.id === id)
      if (c) {
        c.issue = 'depart_non_valide'
        c.detailIssue = "Départ non validé : l'excédent de l'école d'attache est atteint par des candidats mieux classés."
      }
    }
    let ajoutes = 0
    for (const c of libres) {
      const voeu = res.matches.get(c.teacher.id)
      if (!voeu || !voeu.schoolId) continue
      const poste = postes.prendre(voeu.schoolId)
      if (!poste) continue
      affecter(c.teacher, poste, {
        phase: niveau.nom,
        nature: 'voeu',
        rangVoeu: voeu.rang,
        statut: 'propose',
        bareme: voeu.score,
        breakdown: detailVoeu(c, voeu),
      })
      c.issue = 'affecte_voeu'
      c.detailIssue = `Vœu ${voeu.rang} satisfait : ${voeu.nomEtab}.`
      ajoutes++
    }
    logs.push({ etape: niveau.nom, message: 'Affectations sur vœux par acceptation différée.', valeur: ajoutes })
  }

  // 5 — Solution la plus proche, hors vœux, pour les demandes non satisfaites.
  if (m.solutionProche) {
    let ajoutes = 0
    const restants = recevables
      .filter(c => !affectes.has(c.teacher.id) && c.issue === 'sans_solution')
      .sort((a, b) => a.rangClassement - b.rangClassement)
    for (const c of restants) {
      if (c.protege) {
        c.detailIssue = `Aucun vœu satisfait ; protégé des propositions hors vœux (à moins de ${m.anneesAvantRetraite} ans de la retraite).`
        continue
      }
      const t = c.teacher
      if (departs.restant(t.idEtabAttache) <= 0) continue
      const souhaits = c.voeux.filter(v => v.schoolId).map(v => unites.parId.get(v.schoolId as string)).filter((u): u is School => !!u)
      const communes = new Set(souhaits.map(u => lower(u.commune)))
      const iaebs = new Set(souhaits.map(u => lower(u.iaeb)).filter(Boolean))
      const departements = new Set(souhaits.map(u => lower(u.departement)))
      let meilleur: { poste: TeachingPost; niveau: number } | null = null
      for (const poste of postes.tous) {
        if (poste.pourvu || poste.schoolId === t.idEtabAttache) continue
        if (lower(poste.region) !== lower(t.regionAttache)) continue
        if (m.regleZoneRouge && poste.priorite.zoneRouge) continue
        if (!sousSystemesCompatibles(t.sousSysteme, poste.sousSysteme)) continue
        if (!dansLePerimetre(t, poste, scope) || interdits.has(cle(t.id, poste.schoolId))) continue
        const niveau = communes.has(lower(poste.commune))
          ? 0
          : poste.iaeb && iaebs.has(lower(poste.iaeb))
            ? 1
            : departements.has(lower(poste.departement))
              ? 2
              : 3
        if (!meilleur || niveau < meilleur.niveau || (niveau === meilleur.niveau && poste.rang < meilleur.poste.rang)) {
          meilleur = { poste, niveau }
        }
      }
      if (!meilleur) continue
      const poste = postes.prendre(meilleur.poste.schoolId)
      if (!poste) continue
      affecter(t, poste, {
        phase: 'Solution la plus proche (hors vœux)',
        nature: 'hors_voeux',
        rangVoeu: null,
        statut: 'propose',
        bareme: scoreBase(c),
        breakdown: detaillerScore(c, 0),
      })
      c.issue = 'hors_voeux'
      c.detailIssue = `Proposition hors vœux : ${poste.nomEtab} (${['commune', 'IAEB', 'département', 'région'][meilleur.niveau]} des écoles demandées), soumise à l'accord de l'enseignant.`
      ajoutes++
    }
    logs.push({ etape: 'Solution la plus proche', message: 'Propositions hors vœux, hors zone rouge, dans le sous-système de l’enseignant.', valeur: ajoutes })
  }

  // 6 — Combinaisons proposées à la commission pour les écoles restées non couvertes.
  const pool = construireVivier(teachers.filter(t => !affectes.has(t.id)), diagnostics, settings)
  const combinaisons = construireCombinaisons(postes, pool, candidatures, unites, departs, diagParId, affectes, scope, m.regleZoneRouge)

  // 7 — Redéploiement obligatoire, depuis les écoles excédentaires du même sous-système.
  if (m.redeploiementObligatoire) {
    const parEcole = new Map<string, typeof pool.teachers>()
    for (const p of pool.teachers) {
      if (affectes.has(p.teacher.id)) continue
      parEcole.set(p.ecoleOrigine.id, [...(parEcole.get(p.ecoleOrigine.id) ?? []), p])
    }
    let ajoutes = 0
    // Passes successives, de la commune au hors-région (niveau central) : les mouvements
    // locaux sont pourvus avant qu'une école prioritaire éloignée n'attire un maître
    // qui aurait couvert une école de sa propre commune (référentiel §3.6).
    for (let passe = 0; passe <= RANG_PROXIMITE.hors_region; passe++)
    for (const poste of postes.tous) {
      if (poste.pourvu || poste.estStructure) continue
      if (m.regleZoneRouge && poste.priorite.zoneRouge) continue
      // Proximité d'abord (commune, IAEB, département, région), puis score d'appariement :
      // le plus proche des maîtres excédentaires, et à proximité égale le mieux apparié.
      let choix: { p: (typeof pool.teachers)[number]; proximite: number; score: ScoreBreakdown } | null = null
      for (const [ecoleId, liste] of parEcole) {
        if (ecoleId === poste.schoolId || departs.restant(ecoleId) <= 0) continue
        for (const p of liste) {
          if (
            p.affecte ||
            !sousSystemesCompatibles(p.teacher.sousSysteme ?? diagParId.get(ecoleId)?.school.sousSysteme ?? null, poste.sousSysteme) ||
            !dansLePerimetre(p.teacher, poste, scope) ||
            interdits.has(cle(p.teacher.id, poste.schoolId))
          ) {
            continue
          }
          const proximite = RANG_PROXIMITE[niveauProximite(p.teacher, poste)]
          if (proximite > passe || (choix && proximite > choix.proximite)) continue
          const score = scoreAppariement(p.teacher, p.bareme, poste, settings, ecoleVisee(p.teacher))
          if (
            !choix ||
            proximite < choix.proximite ||
            score.total > choix.score.total ||
            (score.total === choix.score.total && p.teacher.id < choix.p.teacher.id)
          ) {
            choix = { p, proximite, score }
          }
        }
      }
      if (!choix) continue
      const pris = postes.prendre(poste.schoolId)
      if (!pris) continue
      choix.p.affecte = true
      affecter(choix.p.teacher, pris, {
        phase: 'Redéploiement obligatoire',
        nature: 'obligatoire',
        rangVoeu: null,
        statut: 'propose',
        bareme: choix.p.bareme,
        breakdown: choix.score,
      })
      ajoutes++
    }
    logs.push({
      etape: 'Redéploiement obligatoire',
      message: `Écoles non couvertes servies par ordre de priorité ; maître excédentaire le plus proche, puis le mieux apparié (score d’appariement)${m.regleZoneRouge ? ', zone rouge exclue' : ''}.`,
      valeur: ajoutes,
    })
  }
  for (const p of pool.teachers) p.affecte = affectes.has(p.teacher.id)

  // 8 — Recalcul des besoins après les mouvements retenus.
  const uncoveredPosts = postes.tous.filter(p => !p.pourvu)
  const before = snapshotAvant(diagnostics, settings, besoinInitial)
  const { snapshot: after, effectifsApres } = snapshotApres(diagnostics, settings, assignments)

  // Nouveaux recrutés, sur les postes restés vacants.
  const recrutes = input.recrues && input.recrues.length > 0 ? deployerRecrues(input.recrues, uncoveredPosts, unites, settings) : null
  if (recrutes) {
    logs.push({ etape: 'Nouveaux recrutés', message: 'Postes restés vacants pourvus par note d’admission.', valeur: recrutes.affectations.length })
  }

  // Projection N+2 du vivier.
  const effectifsN1 = new Map(effectifsApres)
  for (const a of recrutes?.affectations ?? []) effectifsN1.set(a.schoolId, (effectifsN1.get(a.schoolId) ?? 0) + 1)
  const { projections, postesProjetes } = m.projectionN2
    ? projeterN2(diagnostics, teachers, assignments, effectifsN1, recevables, affectes, departs, settings, interdits)
    : { projections: [] as ProjectionN2[], postesProjetes: 0 }
  for (const p of projections) {
    const c = candidatures.find(x => x.teacher.id === p.teacherId)
    if (c && p.schoolId) {
      c.issue = 'projete_n2'
      c.detailIssue = `Possibilité en N+2 : ${p.nomEtab}, sous réserve du départ attendu et du recalcul des besoins.`
    }
  }
  if (m.projectionN2) logs.push({ etape: 'Projection N+2', message: 'Postes projetés après les départs prévisibles pendant N+1.', valeur: postesProjetes })

  // Vœux portant sur l'autre sous-système, présentés à la commission.
  const voeuxAutreSousSysteme: VoeuAutreSousSysteme[] = []
  for (const c of candidatures) {
    if (affectes.has(c.teacher.id)) continue
    for (const v of c.voeux) {
      if (v.statut !== 'autre_sous_systeme' || !v.schoolId) continue
      voeuxAutreSousSysteme.push({
        teacherId: c.teacher.id,
        nom: `${c.teacher.nom} ${c.teacher.prenom}`.trim(),
        sousSystemeEnseignant: c.teacher.sousSysteme,
        schoolId: v.schoolId,
        nomEtab: v.nomEtab,
        sousSystemePoste: unites.parId.get(v.schoolId)?.sousSysteme ?? null,
        posteVacant: postes.libres(v.schoolId) > 0,
      })
    }
  }

  const ecolesBeneficiaires = new Set(assignments.map(a => a.schoolDestinationId)).size
  const ecolesSources = new Set(assignments.map(a => a.schoolOrigineId)).size
  const compteurPerimetre = new Map<ProximityLevel, number>()
  for (const a of assignments) compteurPerimetre.set(a.niveauProximite, (compteurPerimetre.get(a.niveauProximite) ?? 0) + 1)
  const compteurNature = new Map<NatureMouvement, number>()
  for (const a of assignments) compteurNature.set(a.nature, (compteurNature.get(a.nature) ?? 0) + 1)

  const resultat: SimulationResult = {
    scenarioId: scenario.id,
    scenarioNom: scenario.nom,
    scope,

    besoinInitial,
    postesCouverts: assignments.length,
    besoinResiduel: uncoveredPosts.length,
    enseignantsDeplaces: assignments.length,
    ecolesBeneficiaires,
    ecolesSources,
    tauxCouverture: besoinInitial > 0 ? assignments.length / besoinInitial : 0,
    mouvementsParPerimetre: (['meme_commune', 'meme_iaeb', 'meme_departement', 'meme_region', 'hors_region'] as ProximityLevel[])
      .map(niveau => ({ niveau, nombre: compteurPerimetre.get(niveau) ?? 0 }))
      .filter(x => x.nombre > 0),
    mouvementsParNature: (['voeu', 'hors_voeux', 'obligatoire', 'arbitrage'] as NatureMouvement[])
      .map(nature => ({ nature, nombre: compteurNature.get(nature) ?? 0 }))
      .filter(x => x.nombre > 0),

    assignments,
    unmatchedTeachers: pool.teachers.filter(p => !p.affecte),
    uncoveredPosts,
    pool,

    postes: postes.tous,
    candidatures,
    tours,
    toursTronques,
    combinaisons,
    voeuxAutreSousSysteme,
    projectionsN2: projections,
    postesProjetesN2: postesProjetes,
    recrutes,
    arbitrages,

    syntheseAvant: syntheseTerritoriale(diagnostics, settings),
    syntheseApres: syntheseTerritoriale(diagnostics, settings, effectifsApres),
    projectionPluriannuelle: projeterPluriannuel(diagnostics, teachers, assignments, recrutes, settings),
    postesZoneRougeNonPourvus: uncoveredPosts.filter(p => p.priorite.zoneRouge).length,

    before,
    after,

    faitsPrince,

    invariants: [],
    logs,
    computedAt: new Date().toISOString(),
  }

  resultat.invariants = verifierInvariants(resultat, diagnostics, settings, effectifsApres)
  logs.push({ etape: 'Vérifications', message: 'Invariants métier contrôlés après simulation.', valeur: resultat.invariants.filter(i => i.ok).length })
  return resultat
}

/**
 * Combinaisons de redéploiement pour les écoles restées non couvertes après les
 * vœux et les solutions proches (§3.5), présentées à la commission par ordre de
 * priorité. Elles ne sont pas appliquées : la commission décide.
 */
function construireCombinaisons(
  postes: Postes,
  pool: ReturnType<typeof construireVivier>,
  candidatures: Candidature[],
  unites: IndexUnites,
  departs: Departs,
  diagParId: Map<string, SchoolDiagnostic>,
  affectes: Set<string>,
  scope: SimulationScenario['scope'],
  regleZoneRouge: boolean,
): CombinaisonArbitrage[] {
  const combinaisons: CombinaisonArbitrage[] = []
  const nomDe = (t: Teacher) => `${t.nom} ${t.prenom}`.trim()
  const ecolesNonCouvertes: TeachingPost[] = []
  const vues = new Set<string>()
  for (const p of postes.tous) {
    if (p.pourvu || p.estStructure || vues.has(p.schoolId)) continue
    vues.add(p.schoolId)
    ecolesNonCouvertes.push(p)
  }

  const disponibles = pool.teachers.filter(p => !affectes.has(p.teacher.id))

  for (const poste of ecolesNonCouvertes.slice(0, 200)) {
    // Zone rouge : pas de transfert imposé, seulement des volontaires (permutation), des primes ou le recrutement.
    if (regleZoneRouge && poste.priorite.zoneRouge) continue
    // Redéploiement direct : l'école excédentaire la plus proche, du même sous-système.
    const directs = disponibles
      .filter(
        p =>
          p.ecoleOrigine.id !== poste.schoolId &&
          departs.restant(p.ecoleOrigine.id) > 0 &&
          sousSystemesCompatibles(p.teacher.sousSysteme ?? diagParId.get(p.ecoleOrigine.id)?.school.sousSysteme ?? null, poste.sousSysteme) &&
          dansLePerimetre(p.teacher, poste, scope),
      )
      .map(p => ({ p, proximite: niveauProximite(p.teacher, poste) }))
      .sort((a, b) => RANG_PROXIMITE[a.proximite] - RANG_PROXIMITE[b.proximite] || b.p.bareme - a.p.bareme)
    const ecolesDejaCitees = new Set<string>()
    for (const { p, proximite } of directs) {
      if (ecolesDejaCitees.has(p.ecoleOrigine.id)) continue
      ecolesDejaCitees.add(p.ecoleOrigine.id)
      combinaisons.push({
        type: 'direct',
        schoolId: poste.schoolId,
        nomEtab: poste.nomEtab,
        indicePriorite: poste.priorite.indice,
        mouvements: [{ teacherId: p.teacher.id, nom: nomDe(p.teacher), deId: p.ecoleOrigine.id, deNom: p.ecoleOrigine.nom, versId: poste.schoolId, versNom: poste.nomEtab }],
        proximite,
        description: `${nomDe(p.teacher)}, de ${p.ecoleOrigine.nom} (école excédentaire), rejoint ${poste.nomEtab}.`,
      })
      if (ecolesDejaCitees.size >= 2) break
    }

    // Chaîne : un volontaire dont l'école n'a pas d'excédent rejoint l'école non couverte,
    // et son poste est repris par le maître excédentaire d'une autre école.
    for (const c of candidatures) {
      if (affectes.has(c.teacher.id) || c.recevable) continue
      if (!c.voeux.some(v => v.schoolId === poste.schoolId && v.statut === 'examine')) continue
      const autresMotifs = c.motifsIrrecevabilite.filter(mo => !mo.startsWith('école sans excédent'))
      if (autresMotifs.length > 0) continue
      const origine = unites.parId.get(c.teacher.idEtabAttache)
      if (!origine) continue
      const releve = disponibles
        .filter(
          p =>
            p.ecoleOrigine.id !== origine.id &&
            p.ecoleOrigine.id !== poste.schoolId &&
            departs.restant(p.ecoleOrigine.id) > 0 &&
            sousSystemesCompatibles(p.teacher.sousSysteme, origine.sousSysteme),
        )
        .map(p => ({ p, proximite: niveauProximite(p.teacher, origine) }))
        .sort((a, b) => RANG_PROXIMITE[a.proximite] - RANG_PROXIMITE[b.proximite] || b.p.bareme - a.p.bareme)[0]
      if (!releve) continue
      combinaisons.push({
        type: 'chaine',
        schoolId: poste.schoolId,
        nomEtab: poste.nomEtab,
        indicePriorite: poste.priorite.indice,
        mouvements: [
          { teacherId: c.teacher.id, nom: nomDe(c.teacher), deId: origine.id, deNom: origine.nom, versId: poste.schoolId, versNom: poste.nomEtab },
          { teacherId: releve.p.teacher.id, nom: nomDe(releve.p.teacher), deId: releve.p.ecoleOrigine.id, deNom: releve.p.ecoleOrigine.nom, versId: origine.id, versNom: origine.nom },
        ],
        proximite: releve.proximite,
        description: `${nomDe(c.teacher)} rejoint ${poste.nomEtab} (vœu), et ${nomDe(releve.p.teacher)}, de ${releve.p.ecoleOrigine.nom}, reprend son poste à ${origine.nom}.`,
      })
      break
    }
  }

  // Permutations : deux enseignants du même sous-système qui sollicitent chacun l'école de l'autre.
  const parEcoleDemandee = new Map<string, Candidature[]>()
  for (const c of candidatures) {
    if (affectes.has(c.teacher.id) || c.teacher.anciennetePosteAns < 0) continue
    for (const v of c.voeux) {
      if (v.schoolId && (v.statut === 'examine' || v.statut === 'hors_perimetre')) {
        parEcoleDemandee.set(v.schoolId, [...(parEcoleDemandee.get(v.schoolId) ?? []), c])
      }
    }
  }
  const dejaPermutes = new Set<string>()
  for (const a of candidatures) {
    if (affectes.has(a.teacher.id) || dejaPermutes.has(a.teacher.id)) continue
    const stable = (c: Candidature) => !c.motifsIrrecevabilite.some(mo => mo.startsWith('stabilité') || mo.startsWith('départ à la retraite') || mo.startsWith("hors de l'effectif"))
    if (!stable(a)) continue
    const partenaire = (parEcoleDemandee.get(a.teacher.idEtabAttache) ?? []).find(
      b =>
        b.teacher.id !== a.teacher.id &&
        !dejaPermutes.has(b.teacher.id) &&
        stable(b) &&
        sousSystemesCompatibles(a.teacher.sousSysteme, b.teacher.sousSysteme) &&
        a.voeux.some(v => v.schoolId === b.teacher.idEtabAttache),
    )
    if (!partenaire) continue
    dejaPermutes.add(a.teacher.id)
    dejaPermutes.add(partenaire.teacher.id)
    const ua = unites.parId.get(a.teacher.idEtabAttache)
    const ub = unites.parId.get(partenaire.teacher.idEtabAttache)
    if (!ua || !ub) continue
    combinaisons.push({
      type: 'permutation',
      schoolId: ub.id,
      nomEtab: ub.nom,
      indicePriorite: diagParId.get(ub.id)?.priorite.indice ?? 0,
      mouvements: [
        { teacherId: a.teacher.id, nom: nomDe(a.teacher), deId: ua.id, deNom: ua.nom, versId: ub.id, versNom: ub.nom },
        { teacherId: partenaire.teacher.id, nom: nomDe(partenaire.teacher), deId: ub.id, deNom: ub.nom, versId: ua.id, versNom: ua.nom },
      ],
      proximite: niveauProximite(a.teacher, ub),
      description: `${nomDe(a.teacher)} et ${nomDe(partenaire.teacher)} échangent leurs postes, sans créer de déficit.`,
    })
  }

  const nombre = { direct: 1, permutation: 2, chaine: 2 }
  return combinaisons.sort(
    (a, b) =>
      b.indicePriorite - a.indicePriorite ||
      nombre[a.type] - nombre[b.type] ||
      RANG_PROXIMITE[a.proximite] - RANG_PROXIMITE[b.proximite],
  )
}

/**
 * Projection sur l'année N+2 (§3.9) :
 *   b(N+2) = max(0 ; K − (E(N+1) − Q(N+1)))
 * où E(N+1) est l'effectif après le plan, recrutements compris, et Q(N+1) les
 * départs à la retraite prévisibles pendant l'année N+1. Les enseignants restés
 * dans le vivier sont rapprochés de ces postes selon les mêmes règles.
 */
function projeterN2(
  diagnostics: SchoolDiagnostic[],
  teachers: Teacher[],
  assignments: ProposedAssignment[],
  effectifsN1: Map<string, number>,
  recevables: Candidature[],
  affectes: Set<string>,
  departs: Departs,
  settings: SimulationScenario['settings'],
  interdits: Set<string>,
): { projections: ProjectionN2[]; postesProjetes: number } {
  const destination = new Map(assignments.map(a => [a.teacherId, a.schoolDestinationId]))
  const rentreeN1 = dateRentree(settings.anneeScolaire)
  const rentreeN2 = dateRentree(settings.anneeScolaire, 1)
  const Q = new Map<string, number>()
  for (const t of teachers) {
    if (!t.payeParEtat || !t.idEtabAttache) continue
    const a1 = ageA(t, rentreeN1)
    const a2 = ageA(t, rentreeN2)
    if (a1 == null || a2 == null) continue
    if (a1 < settings.besoin.ageRetraite && a2 >= settings.besoin.ageRetraite) {
      const ecole = destination.get(t.id) ?? t.idEtabAttache
      Q.set(ecole, (Q.get(ecole) ?? 0) + 1)
    }
  }

  const capacites = new Map<string, number>()
  let postesProjetes = 0
  for (const d of diagnostics) {
    const E1 = effectifsN1.get(d.school.id) ?? d.enseignantsEtat
    const b = Math.max(0, d.calcul.cible - (E1 - (Q.get(d.school.id) ?? 0)))
    if (b > 0) capacites.set(d.school.id, b)
    postesProjetes += b
  }

  const vivier = recevables.filter(c => !affectes.has(c.teacher.id))
  if (vivier.length === 0) return { projections: [], postesProjetes }

  const res = apparierAvecPlafond(
    vivier,
    c => c.voeux.filter(v => v.statut === 'examine' && v.schoolId != null && !interdits.has(cle(c.teacher.id, v.schoolId))),
    capacites,
    id => departs.restant(id),
    'Projection N+2',
    settings.mobilite.ordreExamen,
  )
  const projections: ProjectionN2[] = vivier.map(c => {
    const voeu = res.matches.get(c.teacher.id)
    return {
      teacherId: c.teacher.id,
      nom: `${c.teacher.nom} ${c.teacher.prenom}`.trim(),
      schoolOrigineId: c.ecoleOrigine.id,
      nomEtabOrigine: c.ecoleOrigine.nom,
      schoolId: voeu?.schoolId ?? null,
      nomEtab: voeu?.nomEtab ?? null,
      rangVoeu: voeu?.rang ?? null,
    }
  })
  return { projections, postesProjetes }
}

