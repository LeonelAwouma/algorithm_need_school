/**
 * Paramètres par défaut du produit et fusion d'une configuration partielle.
 *
 * Toutes les valeurs sont des choix de paramétrage, pas des normes officielles.
 * Le référentiel « élèves par enseignant » est volontairement laissé vide
 * (`cible: null`) : tant qu'un utilisateur ne l'a pas renseigné avec sa source,
 * l'application n'affiche aucun indicateur de pression pédagogique plutôt que
 * d'inventer une norme (§3 du cahier des charges).
 */

import type { EngineSettings, ScoringConfig, PhaseRules } from '../../types/simulation'

/** Barème individuel et score de poste, repris de la logique validée en Python. */
export const DEFAULT_SCORING: ScoringConfig = {
  seuils: { anciennetePosteBonusAns: 5, ageAgeAns: 50, ageJeuneAns: 35 },
  poidsBaremeIndividuel: {
    ancienneteCarriere: 0.3,
    anciennetePoste: 0.25,
    situationFamiliale: 0.15,
    nbEnfants: 0.1,
    formationContinue: 0.1,
    ageAjuste: 0.1,
  },
  // Points par situation matrimoniale : plus l'enseignant est mobile, plus le score est élevé.
  // « Séparé » et « union libre » sont alignés sur les situations les plus proches ;
  // ces valeurs se règlent dans « Configuration du moteur ».
  pointsSituationFamiliale: { celibataire: 10, marie: 6, divorce: 5, veuf: 5, separe: 5, concubinage: 6 },
  poidsScorePoste: {
    baremeEnseignant: 0.35,
    proximite: 0.35,
    anciennetePoste: 0.1,
    situationFamiliale: 0.08,
    ageRegle: 0.07,
    zoneRegle: 0.05,
  },
  pointsProximite: { memeCommune: 100, memeDepartement: 60, memeRegion: 30, autre: 0 },
}

export const DEFAULT_PHASES: PhaseRules = {
  phaseEffetPrince: false,
  phase1Commune: true,
  phase2Departement: true,
  phase3JeunesVersMultigrades: true,
  phase3AnciensRuralVersUrbain: true,
  phase4Reste: true,
  prioriteZonesRurales: false,
  prioriteClassesMultigrades: false,
  anciennetePosteMinimaleAns: 0,
  ageMaximalMobilisableAns: 0,
}

/** Année scolaire par défaut, déduite de la date courante (bascule en août). */
export function anneeScolaireCourante(reference: Date = new Date()): string {
  const annee = reference.getFullYear()
  const debut = reference.getMonth() >= 7 ? annee : annee - 1
  return `${debut}-${debut + 1}`
}

export const DEFAULT_SETTINGS: EngineSettings = {
  anneeScolaire: anneeScolaireCourante(),
  normeEncadrement: { enseignantsParClasse: 1 },
  minimumAConserver: { mode: 'nbClasses', ratio: 1, valeurFixe: 1 },
  sourceDesPostes: 'besoinCalcule',
  referentielEleves: {
    cible: null,
    annee: '',
    source: '',
    commentaire: '',
  },
  seuilsSeverite: { faible: 0.15, important: 0.34 },
  scoring: DEFAULT_SCORING,
  phases: DEFAULT_PHASES,
}

/** Clone profond des paramètres, pour figer la configuration d'un scénario. */
export function cloneSettings(settings: EngineSettings): EngineSettings {
  return {
    ...settings,
    normeEncadrement: { ...settings.normeEncadrement },
    minimumAConserver: { ...settings.minimumAConserver },
    referentielEleves: { ...settings.referentielEleves },
    seuilsSeverite: { ...settings.seuilsSeverite },
    scoring: {
      seuils: { ...settings.scoring.seuils },
      poidsBaremeIndividuel: { ...settings.scoring.poidsBaremeIndividuel },
      pointsSituationFamiliale: { ...settings.scoring.pointsSituationFamiliale },
      poidsScorePoste: { ...settings.scoring.poidsScorePoste },
      pointsProximite: { ...settings.scoring.pointsProximite },
    },
    phases: { ...settings.phases },
  }
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/**
 * Fusionne une configuration partielle (fichier JSON chargé par l'utilisateur)
 * dans les paramètres courants, section par section. Les sections absentes du
 * fichier restent inchangées ; aucune valeur n'est devinée.
 */
export function mergeSettings(base: EngineSettings, patch: DeepPartial<EngineSettings>): EngineSettings {
  const merged = cloneSettings(base)
  if (typeof patch.anneeScolaire === 'string') merged.anneeScolaire = patch.anneeScolaire
  if (patch.sourceDesPostes) merged.sourceDesPostes = patch.sourceDesPostes
  if (patch.normeEncadrement) Object.assign(merged.normeEncadrement, patch.normeEncadrement)
  if (patch.minimumAConserver) Object.assign(merged.minimumAConserver, patch.minimumAConserver)
  if (patch.referentielEleves) Object.assign(merged.referentielEleves, patch.referentielEleves)
  if (patch.seuilsSeverite) Object.assign(merged.seuilsSeverite, patch.seuilsSeverite)
  if (patch.phases) Object.assign(merged.phases, patch.phases)
  if (patch.scoring) {
    const s = patch.scoring
    if (s.seuils) Object.assign(merged.scoring.seuils, s.seuils)
    if (s.poidsBaremeIndividuel) Object.assign(merged.scoring.poidsBaremeIndividuel, s.poidsBaremeIndividuel)
    if (s.pointsSituationFamiliale) Object.assign(merged.scoring.pointsSituationFamiliale, s.pointsSituationFamiliale)
    if (s.poidsScorePoste) Object.assign(merged.scoring.poidsScorePoste, s.poidsScorePoste)
    if (s.pointsProximite) Object.assign(merged.scoring.pointsProximite, s.pointsProximite)
  }
  return merged
}
