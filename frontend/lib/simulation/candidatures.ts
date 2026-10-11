/**
 * Synthèse des vœux et score de priorité (référentiel §3.2 et §3.3).
 *
 * Une candidature est la demande de mutation d'un enseignant : ses écoles
 * sollicitées, par ordre de préférence. Elle est recevable si l'enseignant
 * compte la stabilité minimale au poste et si son école d'attache est
 * excédentaire (son départ ne crée pas de déficit).
 *
 * Score de priorité, pour un enseignant t et une école e qu'il sollicite :
 *
 *   S(t,e) = A(t) + Z(t) + B(t,e)
 *   A = min(20 ; 10 + (p − 6)) − 5 × r      p : ans au poste (A = 0 avant 6 ans)
 *                                            r = 1 à moins de 5 ans de la retraite
 *   Z = min(10 ; 2 × n1 + n2)               années en école de niveau 1 et 2
 *   B = 10 pour l'école visée par un motif justifié (santé, regroupement familial)
 *
 * Départage à score égal : ancienneté générale de service, puis âge, puis rang
 * de tirage au sort. Ni le rang du vœu ni l'ordre de saisie ne sont utilisés.
 */

import type { School, SchoolDiagnostic, SousSysteme, Teacher } from '../../types/education'
import type { Candidature, EngineSettings, GeographicScope, ScoreBreakdown, VoeuExamine } from '../../types/simulation'
import { ageA, partALaRetraite } from '../analytics/diagnostic'
import { dateRentree } from '../config/settings'
import { lower } from '../data/normalize'
import { STATUTS_EXCLUS } from '../data/parse'

/** Deux sous-systèmes sont compatibles s'ils sont égaux, ou si l'un d'eux n'est pas renseigné. */
export function sousSystemesCompatibles(a: SousSysteme | null, b: SousSysteme | null): boolean {
  return a == null || b == null || a === b
}

/** Vrai si l'enseignant sera à moins de N années de la retraite à la rentrée. */
export function procheDeLaRetraite(t: Teacher, settings: EngineSettings): boolean {
  const age = ageA(t, dateRentree(settings.anneeScolaire))
  if (age == null) return false
  return settings.besoin.ageRetraite - age < settings.mobilite.anneesAvantRetraite
}

/** A : points d'ancienneté au poste. */
export function pointsAnciennete(anneesAuPoste: number, procheRetraite: boolean, settings: EngineSettings): number {
  const m = settings.mobilite
  const p = Math.floor(Math.max(0, anneesAuPoste))
  if (p < m.ancienneteDebutPointsAns) return 0
  const brut = Math.min(m.plafondAnciennete, m.pointsAncienneteBase + (p - m.ancienneteDebutPointsAns) * m.pointsParAnSupplementaire)
  return Math.max(0, brut - (procheRetraite ? m.malusRetraite : 0))
}

/** Z : points de service en zone difficile. */
export function pointsZoneDifficile(anneesNiveau1: number, anneesNiveau2: number, settings: EngineSettings): number {
  const m = settings.mobilite
  return Math.min(m.plafondZoneDifficile, m.pointsAnneeNiveau1 * Math.max(0, anneesNiveau1) + m.pointsAnneeNiveau2 * Math.max(0, anneesNiveau2))
}

/**
 * Années de service en zone difficile retenues : celles du dossier de carrière, et
 * au moins les années passées au poste actuel quand l'école d'attache est de
 * niveau de difficulté 1 ou 2 — le service en cours compte, même s'il n'est pas
 * encore reporté au dossier.
 */
export function anneesZoneEffectives(t: Teacher, niveauEcole: 1 | 2 | 3 | null): { n1: number; n2: number } {
  const auPoste = Math.max(0, Math.floor(t.anciennetePosteAns))
  return {
    n1: Math.max(t.anneesZoneNiveau1, niveauEcole === 1 ? auPoste : 0),
    n2: Math.max(t.anneesZoneNiveau2, niveauEcole === 2 ? auPoste : 0),
  }
}

/** Motifs ouvrant droit à la bonification sur l'école visée. */
export function motifJustifie(t: Teacher): boolean {
  return t.motifDemande === 'sante' || t.motifDemande === 'regroupement_familial'
}

/**
 * Comparaison de deux candidats pour une même école : score décroissant, puis
 * ancienneté générale de service, âge et rang de tirage. Résultat négatif si
 * `a` passe avant `b`.
 */
export function departager(a: { score: number; teacher: Teacher }, b: { score: number; teacher: Teacher }): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.teacher.ancienneteCarriereAns !== a.teacher.ancienneteCarriereAns) {
    return b.teacher.ancienneteCarriereAns - a.teacher.ancienneteCarriereAns
  }
  const ageA_ = a.teacher.age ?? -1
  const ageB = b.teacher.age ?? -1
  if (ageB !== ageA_) return ageB - ageA_
  const ra = a.teacher.rangTirage ?? Number.MAX_SAFE_INTEGER
  const rb = b.teacher.rangTirage ?? Number.MAX_SAFE_INTEGER
  if (ra !== rb) return ra - rb
  return a.teacher.id.localeCompare(b.teacher.id)
}

/**
 * Index des unités de calcul par code d'établissement : une école bilingue a deux
 * unités (une par section), une école monolingue ou une structure une seule.
 */
export class IndexUnites {
  private readonly parCode = new Map<string, School[]>()
  readonly parId = new Map<string, School>()

  constructor(unites: School[]) {
    for (const u of unites) {
      this.parId.set(u.id, u)
      for (const cle of new Set([lower(u.codeEcole || u.id), lower(u.id)])) {
        const liste = this.parCode.get(cle) ?? []
        if (!liste.includes(u)) liste.push(u)
        this.parCode.set(cle, liste)
      }
    }
  }

  /** Unité désignée par un code, de préférence celle du sous-système demandé. */
  resoudre(code: string, sousSysteme: SousSysteme | null): School | null {
    const liste = this.parCode.get(lower(code))
    if (!liste || liste.length === 0) return null
    if (liste.length === 1) return liste[0]
    return liste.find(u => u.sousSysteme === sousSysteme) ?? liste[0]
  }
}

/** Le mouvement de `t` vers `u` respecte-t-il le périmètre du scénario ? */
export function dansLePerimetre(
  t: Pick<Teacher, 'communeAttache' | 'departementAttache'>,
  u: Pick<School, 'commune' | 'departement'>,
  scope: GeographicScope,
): boolean {
  if (scope === 'commune') return lower(t.communeAttache) === lower(u.commune)
  if (scope === 'departement') return lower(t.departementAttache) === lower(u.departement)
  return true
}

export interface ContexteCandidatures {
  diagnostics: Map<string, SchoolDiagnostic>
  unites: IndexUnites
  settings: EngineSettings
  scope: GeographicScope
}

/** Construit la candidature d'un enseignant qui a formulé au moins un vœu. */
export function construireCandidature(t: Teacher, ctx: ContexteCandidatures): Candidature {
  const { settings, diagnostics, unites, scope } = ctx
  const m = settings.mobilite
  const origine = diagnostics.get(t.idEtabAttache) ?? null
  const origineUnite = unites.parId.get(t.idEtabAttache) ?? null
  const procheRetraite = procheDeLaRetraite(t, settings)
  const A = pointsAnciennete(t.anciennetePosteAns, procheRetraite, settings)
  const niveauOrigine = origine?.priorite.niveauDifficulte ?? null
  const { n1, n2 } = anneesZoneEffectives(t, niveauOrigine)
  const Z = pointsZoneDifficile(n1, n2, settings)

  const motifs: string[] = []
  if (STATUTS_EXCLUS.has(t.statut) || !t.payeParEtat) motifs.push("hors de l'effectif mobilisable (statut ou rémunération)")
  if (partALaRetraite(t, settings)) motifs.push('départ à la retraite à la rentrée')
  if (t.anciennetePosteAns < m.stabiliteMinimaleAns) {
    motifs.push(`stabilité au poste inférieure à ${m.stabiliteMinimaleAns} ans`)
  }
  if (!origine) {
    motifs.push(origineUnite?.estStructure ? "rattaché à une structure : départ décidé par la hiérarchie" : "école d'attache absente des données")
  } else if (origine.excedentTheorique <= 0) {
    motifs.push('école sans excédent : le départ créerait un déficit')
  }

  const voeux: VoeuExamine[] = t.voeux.map((code, i) => {
    const unite = unites.resoudre(code, t.sousSysteme)
    const motifCible = t.ecoleMotif ? unites.resoudre(t.ecoleMotif, t.sousSysteme)?.id ?? null : null
    const bonification =
      unite && motifJustifie(t) && (motifCible ? motifCible === unite.id : i === 0) ? m.bonificationMotif : 0
    const poids = unite ? (diagnostics.get(unite.id)?.priorite.poids ?? 0) : 0
    let statut: VoeuExamine['statut'] = 'examine'
    if (i >= m.nombreMaxVoeux) statut = 'au_dela_du_maximum'
    else if (!unite) statut = 'hors_referentiel'
    else if (unite.id === t.idEtabAttache) statut = 'meme_ecole'
    else if (!sousSystemesCompatibles(t.sousSysteme, unite.sousSysteme)) statut = 'autre_sous_systeme'
    else if (!dansLePerimetre(t, unite, scope)) statut = 'hors_perimetre'
    return {
      rang: i + 1,
      code,
      schoolId: unite?.id ?? null,
      nomEtab: unite?.nom ?? code,
      statut,
      bonification,
      score: A + Z + bonification,
      poidsExamen: poids + bonification,
      interregional: !!unite && lower(unite.region) !== lower(t.regionAttache),
    }
  })

  if (!voeux.some(v => v.statut === 'examine')) motifs.push('aucun vœu examinable par l’algorithme')

  return {
    teacher: t,
    ecoleOrigine: {
      id: t.idEtabAttache,
      nom: origine?.school.nom ?? origineUnite?.nom ?? t.idEtabAttache,
      excedent: origine?.excedentTheorique ?? 0,
      classement: origine?.classement ?? null,
    },
    recevable: motifs.length === 0,
    motifsIrrecevabilite: motifs,
    voeux,
    pointsAnciennete: A,
    pointsZoneDifficile: Z,
    procheRetraite,
    protege: procheRetraite && m.protegerProchesRetraite,
    rangClassement: 0,
    issue: motifs.length === 0 ? 'sans_solution' : 'irrecevable',
    detailIssue: motifs.length === 0 ? 'Aucun vœu satisfait.' : `Non recevable : ${motifs.join(' ; ')}.`,
  }
}

/** Score de base A + Z, commun à toutes les écoles : il fonde le classement unique. */
export function scoreBase(c: Candidature): number {
  return c.pointsAnciennete + c.pointsZoneDifficile
}

/** Construit les candidatures et les numérote dans l'ordre du classement unique. */
export function construireCandidatures(teachers: Teacher[], ctx: ContexteCandidatures): Candidature[] {
  const vus = new Set<string>()
  const candidatures: Candidature[] = []
  for (const t of teachers) {
    if (t.voeux.length === 0 || !t.id || vus.has(t.id) || t.faitPrinceId) continue
    vus.add(t.id)
    candidatures.push(construireCandidature(t, ctx))
  }
  const ordonnees = [...candidatures].sort((a, b) =>
    departager({ score: scoreBase(a), teacher: a.teacher }, { score: scoreBase(b), teacher: b.teacher }),
  )
  ordonnees.forEach((c, i) => (c.rangClassement = i + 1))
  return candidatures
}

/** Détail du score S(t,e), pour « Pourquoi cette proposition ? ». */
export function detaillerScore(c: Candidature, bonification: number): ScoreBreakdown {
  const components = [
    { label: 'A — ancienneté au poste', valeur: c.pointsAnciennete, poids: 1, contribution: c.pointsAnciennete },
    { label: 'Z — service en zone difficile', valeur: c.pointsZoneDifficile, poids: 1, contribution: c.pointsZoneDifficile },
  ]
  if (bonification > 0) components.push({ label: 'B — motif justifié sur cette école', valeur: bonification, poids: 1, contribution: bonification })
  return { total: components.reduce((a, x) => a + x.contribution, 0), components }
}
