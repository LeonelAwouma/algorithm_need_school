/**
 * Barème individuel et score enseignant ↔ poste.
 *
 * Le calcul est repris tel quel de la version validée du moteur : mêmes
 * critères, mêmes poids par défaut, même arrondi. Deux choses changent :
 *   — le score est renvoyé décomposé, pour que chaque proposition puisse être
 *     expliquée avec ses composantes réelles (§15) ;
 *   — la proximité distingue désormais « même région », niveau intermédiaire
 *     utile au scénario étendu.
 */

import type { Teacher, Zone } from '../../types/education'
import type {
  PhaseRules,
  ProximityLevel,
  ScoreBreakdown,
  ScoreComponent,
  ScoringConfig,
  TeachingPost,
} from '../../types/simulation'
import { lower, round4 } from '../data/normalize'
import { normaliserSituation } from '../data/situation-familiale'

/**
 * Points attribués à une situation matrimoniale déclarée.
 *
 * Le libellé du fichier est d'abord rattaché à une situation connue : « Marié »,
 * « Mariée », « MARIE(E) » et « marie » donnent donc le même résultat. Une valeur
 * non reconnue vaut 0 point — l'application la signale dans la page des
 * paramètres plutôt que de la laisser passer en silence.
 */
export function pointsSituation(situation: string, cfg: ScoringConfig): number {
  const cle = normaliserSituation(situation)
  if (cle) return cfg.pointsSituationFamiliale[cle] ?? 0
  // Compatibilité : une clé ajoutée à la main dans la configuration reste utilisable.
  return cfg.pointsSituationFamiliale[lower(situation)] ?? 0
}

/**
 * Barème individuel : il ordonne les enseignants d'une même école source pour
 * déterminer lesquels sont prioritaires en cas de redéploiement.
 */
export function calculerBaremeIndividuel(ens: Teacher, cfg: ScoringConfig): number {
  const w = cfg.poidsBaremeIndividuel
  const bonusPoste = ens.anciennetePosteAns >= cfg.seuils.anciennetePosteBonusAns ? 10 : ens.anciennetePosteAns
  const ageScore = ens.age != null ? Math.min(ens.age, 60) / 6 : 5

  return round4(
    w.ancienneteCarriere * ens.ancienneteCarriereAns +
      w.anciennetePoste * bonusPoste +
      w.situationFamiliale * pointsSituation(ens.situationFamiliale, cfg) +
      w.nbEnfants * ens.nbEnfants +
      w.formationContinue * ens.formationContinue +
      w.ageAjuste * ageScore,
  )
}

/** Détail du barème individuel, pour la Vue analyste. */
export function detaillerBareme(ens: Teacher, cfg: ScoringConfig): ScoreBreakdown {
  const w = cfg.poidsBaremeIndividuel
  const bonusPoste = ens.anciennetePosteAns >= cfg.seuils.anciennetePosteBonusAns ? 10 : ens.anciennetePosteAns
  const ageScore = ens.age != null ? Math.min(ens.age, 60) / 6 : 5
  const components: ScoreComponent[] = [
    { label: 'Ancienneté de carrière (ans)', valeur: ens.ancienneteCarriereAns, poids: w.ancienneteCarriere, contribution: 0 },
    { label: 'Ancienneté au poste (points)', valeur: bonusPoste, poids: w.anciennetePoste, contribution: 0 },
    { label: 'Situation familiale (points)', valeur: pointsSituation(ens.situationFamiliale, cfg), poids: w.situationFamiliale, contribution: 0 },
    { label: "Nombre d'enfants", valeur: ens.nbEnfants, poids: w.nbEnfants, contribution: 0 },
    { label: 'Formation continue', valeur: ens.formationContinue, poids: w.formationContinue, contribution: 0 },
    { label: 'Âge ajusté', valeur: round4(ageScore), poids: w.ageAjuste, contribution: 0 },
  ].map(c => ({ ...c, contribution: round4(c.valeur * c.poids) }))

  return { total: round4(components.reduce((a, c) => a + c.contribution, 0)), components }
}

/** Niveau de proximité entre le rattachement de l'enseignant et le poste. */
export function niveauProximite(ens: Teacher, poste: TeachingPost): ProximityLevel {
  if (ens.communeAttache && lower(ens.communeAttache) === lower(poste.commune)) return 'meme_commune'
  if (ens.departementAttache && lower(ens.departementAttache) === lower(poste.departement)) return 'meme_departement'
  if (ens.regionAttache && lower(ens.regionAttache) === lower(poste.region)) return 'meme_region'
  return 'hors_region'
}

export const LIBELLE_PROXIMITE: Record<ProximityLevel, string> = {
  meme_commune: 'Même commune',
  meme_departement: 'Même département',
  meme_region: 'Même région',
  hors_region: 'Hors région',
}

function pointsProximite(niveau: ProximityLevel, cfg: ScoringConfig): number {
  switch (niveau) {
    case 'meme_commune':
      return cfg.pointsProximite.memeCommune
    case 'meme_departement':
      return cfg.pointsProximite.memeDepartement
    case 'meme_region':
      return cfg.pointsProximite.memeRegion
    default:
      return cfg.pointsProximite.autre
  }
}

/** Règle d'âge : jeunes vers les classes multigrades, plus âgés vers IAEB ou postes non multigrades. */
export function scoreAgeRegle(ens: Teacher, poste: TeachingPost, cfg: ScoringConfig): number {
  if (ens.age == null) return 0
  const { ageJeuneAns, ageAgeAns } = cfg.seuils
  if (ens.age <= ageJeuneAns && poste.classesMultigrades > 0) return 15
  if (ens.age >= ageAgeAns) {
    if (poste.typeEtab.toUpperCase() === 'IAEB') return 15
    if (poste.classesMultigrades === 0) return 8
  }
  return 0
}

/** Règle de zone : ancienneté en zone rurale ouvrant vers une zone urbaine. */
export function scoreZoneRegle(ens: Teacher, poste: TeachingPost): number {
  const versUrbain: Zone[] = ['urbaine', 'semi_urbaine']
  if (ens.zoneAttache === 'rurale' && versUrbain.includes(poste.zone) && ens.anciennetePosteAns >= 5) return 12
  return 0
}

/**
 * Score complet enseignant ↔ poste, décomposé. Toutes les composantes
 * renvoyées participent réellement au total utilisé pour le choix du poste :
 * l'explication affichée correspond donc exactement au calcul.
 */
export function scoreEnseignantPoste(
  ens: Teacher,
  bareme: number,
  poste: TeachingPost,
  cfg: ScoringConfig,
  phases: PhaseRules,
): ScoreBreakdown {
  const w = cfg.poidsScorePoste
  const proximite = niveauProximite(ens, poste)

  const components: ScoreComponent[] = [
    { label: 'Barème individuel', valeur: bareme, poids: w.baremeEnseignant, contribution: 0 },
    { label: `Proximité — ${LIBELLE_PROXIMITE[proximite].toLowerCase()}`, valeur: pointsProximite(proximite, cfg), poids: w.proximite, contribution: 0 },
    { label: 'Ancienneté au poste (ans)', valeur: ens.anciennetePosteAns, poids: w.anciennetePoste, contribution: 0 },
    { label: 'Situation familiale (points)', valeur: pointsSituation(ens.situationFamiliale, cfg), poids: w.situationFamiliale, contribution: 0 },
    { label: "Règle d'âge", valeur: scoreAgeRegle(ens, poste, cfg), poids: w.ageRegle, contribution: 0 },
    { label: 'Règle de zone', valeur: scoreZoneRegle(ens, poste), poids: w.zoneRegle, contribution: 0 },
  ]

  // Priorité déclarée par l'établissement : reprise de la règle historique
  // (bonus décroissant du rang 1 au rang 20, nul au-delà ou si non déclarée).
  const rang = poste.prioriteLocale > 0 ? poste.prioriteLocale : 99
  const bonusPriorite = Math.max(0, 20 - rang)
  if (bonusPriorite > 0) {
    components.push({ label: `Priorité locale de l'établissement (rang ${rang})`, valeur: bonusPriorite, poids: 1, contribution: 0 })
  }

  if (phases.prioriteZonesRurales && poste.zone === 'rurale') {
    components.push({ label: 'Priorité aux zones rurales (paramètre actif)', valeur: 10, poids: 1, contribution: 0 })
  }
  if (phases.prioriteClassesMultigrades && poste.classesMultigrades > 0) {
    components.push({ label: 'Priorité aux classes multigrades (paramètre actif)', valeur: 10, poids: 1, contribution: 0 })
  }

  const detaillees = components.map(c => ({ ...c, contribution: round4(c.valeur * c.poids) }))
  return { total: round4(detaillees.reduce((a, c) => a + c.contribution, 0)), components: detaillees }
}
