/**
 * Barème individuel (étage 1), score d'appariement (étage 2) et proximité.
 *
 * Repris du moteur de référence MINEDUB, avec trois corrections :
 *   — C1 additionne l'ancienneté générale et les points de zone difficile Z,
 *     plafonnés à 10 comme au §3.3 du référentiel (le moteur de référence
 *     multipliait l'ancienneté par max(10 ; 2 n1 + n2), ce qui inversait le plafond
 *     et écrasait les quatre autres critères) ;
 *   — C2 reprend les points d'ancienneté au poste A du référentiel, au lieu d'une
 *     seconde formule voisine ;
 *   — les années de zone difficile, quand le dossier de carrière ne les donne pas,
 *     comptent au moins les années passées au poste actuel si l'école d'attache est
 *     de niveau de difficulté 1 ou 2 (et non toute la carrière).
 *
 * Le barème ordonne les départs d'une école excédentaire ; le score d'appariement
 * choisit, à proximité égale, l'enseignant proposé sur un poste, et peut en
 * variante classer les candidats à une même école.
 */

import type { Teacher } from '../../types/education'
import type {
  EngineSettings,
  ProximityLevel,
  ScoreBreakdown,
  ScoreComponent,
  ScoringConfig,
  TeachingPost,
} from '../../types/simulation'
import { lower, round4 } from '../data/normalize'
import { normaliserSituation } from '../data/situation-familiale'
import { anneesZoneEffectives, pointsAnciennete, pointsZoneDifficile, procheDeLaRetraite } from './candidatures'

export { anneesZoneEffectives }

/**
 * Points attribués à une situation matrimoniale déclarée. « Marié », « Mariée »
 * et « MARIE(E) » donnent le même résultat ; une valeur non reconnue vaut 0.
 */
export function pointsSituation(situation: string, cfg: ScoringConfig): number {
  const cle = normaliserSituation(situation)
  if (cle) return cfg.pointsSituationFamiliale[cle] ?? 0
  return cfg.pointsSituationFamiliale[lower(situation)] ?? 0
}

/** Cohorte d'âge (C5) : jeune, médiane ou senior. */
export function cohorte(t: Teacher, cfg: ScoringConfig): 'jeune' | 'median' | 'senior' {
  if (t.age == null) return 'median'
  if (t.age < cfg.seuils.ageJeuneAns) return 'jeune'
  if (t.age < cfg.seuils.ageSeniorAns) return 'median'
  return 'senior'
}

function composantesBareme(t: Teacher, settings: EngineSettings, niveauEcole: 1 | 2 | 3 | null): ScoreComponent[] {
  const cfg = settings.scoring
  const w = cfg.poidsBaremeIndividuel
  const { n1, n2 } = anneesZoneEffectives(t, niveauEcole)
  const Z = pointsZoneDifficile(n1, n2, settings)
  const A = pointsAnciennete(t.anciennetePosteAns, procheDeLaRetraite(t, settings), settings)
  const charges = pointsSituation(t.situationFamiliale, cfg) - cfg.pointsParEnfant * Math.max(0, t.nbEnfants)
  const formation = Math.min(cfg.plafondFormation, cfg.pointsParFormation * Math.max(0, t.formationContinue))
  const c = cohorte(t, cfg)
  return [
    { label: `C1 — carrière (${round4(t.ancienneteCarriereAns)} ans) et zone difficile (Z = ${Z})`, valeur: round4(t.ancienneteCarriereAns + Z), poids: w.carriereZone, contribution: 0 },
    { label: 'C2 — ancienneté au poste (points A)', valeur: A, poids: w.anciennetePoste, contribution: 0 },
    { label: `C3 — charges familiales (situation − ${cfg.pointsParEnfant} par enfant)`, valeur: charges, poids: w.chargesFamiliales, contribution: 0 },
    { label: 'C4 — formation continue', valeur: formation, poids: w.formationContinue, contribution: 0 },
    { label: `C5 — cohorte d'âge (${c === 'jeune' ? 'jeune' : c === 'senior' ? 'senior' : 'médiane'})`, valeur: cfg.pointsCohorte[c], poids: w.cohorteAge, contribution: 0 },
  ].map(x => ({ ...x, contribution: round4(x.valeur * x.poids) }))
}

/** Barème individuel (étage 1). `niveauEcole` : niveau de difficulté de l'école d'attache. */
export function calculerBaremeIndividuel(t: Teacher, settings: EngineSettings, niveauEcole: 1 | 2 | 3 | null = null): number {
  return round4(composantesBareme(t, settings, niveauEcole).reduce((a, c) => a + c.contribution, 0))
}

/** Détail du barème individuel, pour l'explication et la Vue analyste. */
export function detaillerBareme(t: Teacher, settings: EngineSettings, niveauEcole: 1 | 2 | 3 | null = null): ScoreBreakdown {
  const components = composantesBareme(t, settings, niveauEcole)
  return { total: round4(components.reduce((a, c) => a + c.contribution, 0)), components }
}

// --- Proximité ----------------------------------------------------------------------

/** Niveau de proximité entre le rattachement de l'enseignant et le poste : commune, IAEB, département, région. */
export function niveauProximite(
  ens: Pick<Teacher, 'communeAttache' | 'departementAttache' | 'regionAttache'> & { iaebAttache?: string },
  poste: Pick<TeachingPost, 'commune' | 'departement' | 'region'> & { iaeb?: string },
): ProximityLevel {
  if (ens.communeAttache && lower(ens.communeAttache) === lower(poste.commune)) return 'meme_commune'
  if (ens.iaebAttache && poste.iaeb && lower(ens.iaebAttache) === lower(poste.iaeb)) return 'meme_iaeb'
  if (ens.departementAttache && lower(ens.departementAttache) === lower(poste.departement)) return 'meme_departement'
  if (ens.regionAttache && lower(ens.regionAttache) === lower(poste.region)) return 'meme_region'
  return 'hors_region'
}

export const RANG_PROXIMITE: Record<ProximityLevel, number> = {
  meme_commune: 0,
  meme_iaeb: 1,
  meme_departement: 2,
  meme_region: 3,
  hors_region: 4,
}

export const LIBELLE_PROXIMITE: Record<ProximityLevel, string> = {
  meme_commune: 'Même commune',
  meme_iaeb: 'Même IAEB',
  meme_departement: 'Même département',
  meme_region: 'Même région',
  hors_region: 'Hors région',
}

export function pointsProximite(niveau: ProximityLevel, cfg: ScoringConfig): number {
  const p = cfg.pointsProximite
  switch (niveau) {
    case 'meme_commune':
      return p.memeCommune
    case 'meme_iaeb':
      return p.memeIaeb
    case 'meme_departement':
      return p.memeDepartement
    case 'meme_region':
      return p.memeRegion
    default:
      return p.autre
  }
}

// --- Score d'appariement (étage 2) -------------------------------------------------------

/**
 * Ajustements contextuels, chacun justifié par une règle explicite. La bonification
 * ciblée ne vaut que pour l'école visée par un motif justifié (et non pour tous les
 * vœux, ce qui la rendait sans effet sur le choix entre eux).
 */
export function ajustementsContextuels(t: Teacher, poste: TeachingPost, cfg: ScoringConfig, ecoleVisee: string | null): ScoreComponent[] {
  const a = cfg.ajustements
  const age = t.age
  const jeune = age != null && age <= cfg.seuils.ageJeuneAns
  const senior = age != null && age >= cfg.seuils.ageSeniorAns
  const lignes: { label: string; valeur: number }[] = []
  if (jeune && poste.classesMultigrades > 0) lignes.push({ label: 'Jeune enseignant vers une école à classes multigrades', valeur: a.jeuneVersMultigrades })
  if (senior && poste.estStructure) lignes.push({ label: "Senior vers une structure d'encadrement", valeur: a.seniorVersEncadrement })
  if (senior && !poste.estStructure && poste.classesMultigrades === 0) lignes.push({ label: 'Senior vers une école sans classe multigrade', valeur: a.allegementSenior })
  if (t.zoneAttache === 'rurale' && (poste.zone === 'urbaine' || poste.zone === 'semi_urbaine') && t.anciennetePosteAns >= 5) {
    lignes.push({ label: 'Transition du rural vers l’urbain après 5 ans au poste', valeur: a.transitionRuralUrbain })
  }
  if (ecoleVisee && ecoleVisee === poste.schoolId) lignes.push({ label: 'Bonification ciblée : école visée par un motif justifié', valeur: a.bonificationCiblee })
  return lignes.filter(l => l.valeur !== 0).map(l => ({ ...l, poids: 1, contribution: l.valeur }))
}

/**
 * Score d'appariement enseignant ↔ poste :
 *   Z1 × barème + Z2 × poids du poste u + Z3 × points de proximité + Z4 × ajustements.
 * Toutes les composantes affichées sont celles réellement additionnées.
 */
export function scoreAppariement(
  t: Teacher,
  bareme: number,
  poste: TeachingPost,
  settings: EngineSettings,
  ecoleVisee: string | null,
): ScoreBreakdown {
  const cfg = settings.scoring
  const w = cfg.poidsScoreAppariement
  const proximite = niveauProximite(t, poste)
  const ajustements = ajustementsContextuels(t, poste, cfg, ecoleVisee)
  const totalAjustements = ajustements.reduce((s, x) => s + x.valeur, 0)
  const components: ScoreComponent[] = [
    { label: 'Z1 — barème individuel', valeur: bareme, poids: w.bareme, contribution: 0 },
    { label: 'Z2 — poids du poste (indice u)', valeur: poste.priorite.indice, poids: w.poidsPoste, contribution: 0 },
    { label: `Z3 — proximité (${LIBELLE_PROXIMITE[proximite].toLowerCase()})`, valeur: pointsProximite(proximite, cfg), poids: w.proximite, contribution: 0 },
    { label: `Z4 — ajustements${ajustements.length ? ` : ${ajustements.map(x => x.label.toLowerCase()).join(' ; ')}` : ' (aucun)'}`, valeur: totalAjustements, poids: w.ajustements, contribution: 0 },
  ].map(x => ({ ...x, contribution: round4(x.valeur * x.poids) }))
  return { total: round4(components.reduce((s, x) => s + x.contribution, 0)), components }
}
