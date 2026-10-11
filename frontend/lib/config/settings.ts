/**
 * Paramètres par défaut du produit et fusion d'une configuration partielle.
 *
 * Les valeurs par défaut sont celles du Référentiel technique de modélisation :
 * un maître pour 60 élèves, minimum pédagogique de niveaux regroupés deux à deux,
 * BMAX à deux maîtres par salle en double flux, barème d'ancienneté progressif,
 * points de zone difficile, poids de vulnérabilité et points de besoin. Le
 * référentiel les désigne comme « paramètres à valider par la DRH » : ils restent
 * tous modifiables, et chaque changement relance le calcul (§6.3).
 */

import type { EngineSettings, ReglesBesoin, ReglesMobilite, ReglesPriorite, ScoringConfig } from '../../types/simulation'

/**
 * Barème individuel (étage 1) et score d'appariement (étage 2), repris du moteur
 * de référence MINEDUB : mêmes critères, mêmes poids, mêmes points.
 */
export const DEFAULT_SCORING: ScoringConfig = {
  seuils: { ageJeuneAns: 35, ageSeniorAns: 50 },
  poidsBaremeIndividuel: {
    carriereZone: 0.3,
    anciennetePoste: 0.25,
    chargesFamiliales: 0.2,
    formationContinue: 0.15,
    cohorteAge: 0.1,
  },
  pointsSituationFamiliale: { celibataire: 10, divorce: 8, veuf: 8, separe: 8, marie: 5, concubinage: 5 },
  pointsParEnfant: 2,
  pointsParFormation: 2,
  plafondFormation: 10,
  pointsCohorte: { jeune: 10, median: 8, senior: 5 },
  poidsScoreAppariement: { bareme: 0.25, poidsPoste: 0.25, proximite: 0.25, ajustements: 0.25 },
  pointsProximite: { memeCommune: 60, memeIaeb: 45, memeDepartement: 30, memeRegion: 0, autre: 0 },
  ajustements: {
    jeuneVersMultigrades: 15,
    seniorVersEncadrement: 15,
    allegementSenior: 8,
    transitionRuralUrbain: 12,
    bonificationCiblee: 20,
  },
}

export const DEFAULT_BESOIN: ReglesBesoin = {
  elevesParMaitre: 60,
  toleranceArrondi: 0,
  niveauxParMaitre: 2,
  minimumSelonMultigrades: true,
  doubleFluxAutorise: true,
  deduireDepartsConnus: true,
  ageRetraite: 60,
  enseignantsParClasseRepli: 1,
}

export const DEFAULT_PRIORITE: ReglesPriorite = {
  pointsAccessibilite: { urbain: 5, semi_urbain: 5, rural: 10, rural_enclave: 20 },
  pointsSecurite: { verte: 0, jaune: 10, rouge: 25 },
  coefAccessibilite: 1,
  coefSecurite: 1,
  seuilNiveau1: 30,
  seuilNiveau2: 15,
  tranchesBesoin: [
    { remMax: 80, points: 0 },
    { remMax: 100, points: 5 },
    { remMax: 150, points: 10 },
  ],
  pointsBesoinAuDela: 15,
}

export const DEFAULT_MOBILITE: ReglesMobilite = {
  stabiliteMinimaleAns: 5,
  ancienneteDebutPointsAns: 6,
  pointsAncienneteBase: 10,
  pointsParAnSupplementaire: 1,
  plafondAnciennete: 20,
  anneesAvantRetraite: 5,
  malusRetraite: 5,
  pointsAnneeNiveau1: 2,
  pointsAnneeNiveau2: 1,
  plafondZoneDifficile: 10,
  bonificationMotif: 10,
  nombreMaxVoeux: 3,
  ordreExamen: 'voeux',
  classementCandidats: 'score_priorite',
  phaseVoeux: true,
  stabilitePourObligatoire: true,
  protegerProchesRetraite: true,
  solutionProche: true,
  redeploiementObligatoire: true,
  regleZoneRouge: true,
  projectionN2: true,
  departageFeminin: false,
}

/** Année scolaire par défaut, déduite de la date courante (bascule en août). */
export function anneeScolaireCourante(reference: Date = new Date()): string {
  const annee = reference.getFullYear()
  const debut = reference.getMonth() >= 7 ? annee : annee - 1
  return `${debut}-${debut + 1}`
}

/** Date de la rentrée préparée par le plan : le 1er septembre de la première année scolaire. */
export function dateRentree(anneeScolaire: string, decalageAns = 0): Date {
  const debut = Number.parseInt(anneeScolaire, 10)
  const annee = Number.isFinite(debut) ? debut : new Date().getFullYear()
  return new Date(Date.UTC(annee + decalageAns, 8, 1))
}

export const DEFAULT_SETTINGS: EngineSettings = {
  anneeScolaire: anneeScolaireCourante(),
  besoin: DEFAULT_BESOIN,
  sourceDesPostes: 'besoinCalcule',
  seuilsSeverite: { faible: 0.15, important: 0.34 },
  priorite: DEFAULT_PRIORITE,
  mobilite: DEFAULT_MOBILITE,
  recrutement: { tauxAttritionHorsRetraite: 2 },
  scoring: DEFAULT_SCORING,
}

/** Clone profond des paramètres, pour figer la configuration d'un scénario. */
export function cloneSettings(settings: EngineSettings): EngineSettings {
  return {
    ...settings,
    besoin: { ...settings.besoin },
    seuilsSeverite: { ...settings.seuilsSeverite },
    priorite: {
      ...settings.priorite,
      pointsAccessibilite: { ...settings.priorite.pointsAccessibilite },
      pointsSecurite: { ...settings.priorite.pointsSecurite },
      tranchesBesoin: settings.priorite.tranchesBesoin.map(t => ({ ...t })),
    },
    mobilite: { ...settings.mobilite },
    recrutement: { ...settings.recrutement },
    scoring: {
      ...settings.scoring,
      seuils: { ...settings.scoring.seuils },
      poidsBaremeIndividuel: { ...settings.scoring.poidsBaremeIndividuel },
      pointsSituationFamiliale: { ...settings.scoring.pointsSituationFamiliale },
      pointsCohorte: { ...settings.scoring.pointsCohorte },
      poidsScoreAppariement: { ...settings.scoring.poidsScoreAppariement },
      pointsProximite: { ...settings.scoring.pointsProximite },
      ajustements: { ...settings.scoring.ajustements },
    },
  }
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] }

/** Ne recopie que les clés connues de la cible, avec une valeur du même type. */
function fusionner<T extends object>(cible: T, patch: unknown): void {
  if (typeof patch !== 'object' || patch === null) return
  for (const [cle, valeur] of Object.entries(patch)) {
    if (!(cle in cible)) continue
    const courant = (cible as Record<string, unknown>)[cle]
    if (typeof courant === typeof valeur && !Array.isArray(courant) && (typeof valeur !== 'object' || valeur === null)) {
      ;(cible as Record<string, unknown>)[cle] = valeur
    }
  }
}

/**
 * Fusionne une configuration partielle (fichier de règles, préférences d'une
 * version précédente) dans les paramètres courants, section par section. Les
 * clés inconnues — notamment celles des versions antérieures du moteur — sont
 * ignorées ; aucune valeur n'est devinée.
 */
export function mergeSettings(base: EngineSettings, patch: DeepPartial<EngineSettings>): EngineSettings {
  const merged = cloneSettings(base)
  if (typeof patch.anneeScolaire === 'string') merged.anneeScolaire = patch.anneeScolaire
  if (patch.sourceDesPostes === 'besoinCalcule' || patch.sourceDesPostes === 'postesDeclares' || patch.sourceDesPostes === 'maximum') {
    merged.sourceDesPostes = patch.sourceDesPostes
  }
  fusionner(merged.besoin, patch.besoin)
  fusionner(merged.seuilsSeverite, patch.seuilsSeverite)
  fusionner(merged.mobilite, patch.mobilite)
  fusionner(merged.recrutement, patch.recrutement)
  if (patch.priorite) {
    const p = patch.priorite
    fusionner(merged.priorite, p)
    fusionner(merged.priorite.pointsAccessibilite, p.pointsAccessibilite)
    fusionner(merged.priorite.pointsSecurite, p.pointsSecurite)
    if (Array.isArray(p.tranchesBesoin)) {
      const tranches = p.tranchesBesoin.filter(
        (t): t is { remMax: number; points: number } => typeof t?.remMax === 'number' && typeof t?.points === 'number',
      )
      if (tranches.length > 0) merged.priorite.tranchesBesoin = [...tranches].sort((a, b) => a.remMax - b.remMax)
    }
  }
  if (patch.scoring) {
    const s = patch.scoring
    fusionner(merged.scoring, s)
    fusionner(merged.scoring.seuils, s.seuils)
    fusionner(merged.scoring.poidsBaremeIndividuel, s.poidsBaremeIndividuel)
    fusionner(merged.scoring.pointsCohorte, s.pointsCohorte)
    fusionner(merged.scoring.poidsScoreAppariement, s.poidsScoreAppariement)
    fusionner(merged.scoring.pointsProximite, s.pointsProximite)
    fusionner(merged.scoring.ajustements, s.ajustements)
    if (s.pointsSituationFamiliale) {
      for (const [cle, v] of Object.entries(s.pointsSituationFamiliale)) {
        if (typeof v === 'number') merged.scoring.pointsSituationFamiliale[cle] = v
      }
    }
  }
  return merged
}
