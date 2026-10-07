/**
 * Scénarios de simulation.
 *
 * Trois scénarios géographiques forment le socle — commune, département,
 * étendu (niveau régional puis niveau central). Les autres font varier un
 * paramètre que le référentiel demande de pouvoir simuler (§6.3) : ordre
 * d'examen des vœux, redéploiement obligatoire, double flux. Un scénario dont la
 * règle ne peut pas être évaluée avec les données chargées n'est pas proposé.
 */

import type { SchoolDiagnostic } from '../../types/education'
import type { EngineSettings, GeographicScope, SimulationScenario } from '../../types/simulation'
import { cloneSettings } from '../config/settings'

export const LIBELLE_SCOPE: Record<GeographicScope, string> = {
  commune: 'Commune',
  departement: 'Département',
  etendu: 'Étendu',
}

export const DESCRIPTION_SCOPE: Record<GeographicScope, string> = {
  commune: "Les mouvements restent dans la commune de l'enseignant : vœux, solutions proches et redéploiement obligatoire.",
  departement: "Les mouvements restent à l'intérieur du département de rattachement.",
  etendu: "Niveau régional, puis niveau central : les vœux interrégionaux et les besoins qu'aucune école de la région ne peut couvrir sont traités entre régions.",
}

/** Message obligatoire accompagnant le scénario sans contrainte géographique (§29). */
export const AVERTISSEMENT_SCENARIO_ETENDU =
  "Au niveau central, des mouvements entre régions sont proposés : ils supposent l’accord des deux régions et peuvent impliquer des déplacements longs."

export interface ScenarioPreset {
  cle: string
  nom: string
  description: string
  scope: GeographicScope
  /** Transformation appliquée aux paramètres courants pour obtenir ce scénario. */
  ajusterParametres: (settings: EngineSettings) => EngineSettings
  /** Conditions de données nécessaires pour que la règle du scénario ait un sens. */
  verifierDisponibilite: (diagnostics: SchoolDiagnostic[]) => { disponible: boolean; motif: string }
}

const toujoursDisponible = () => ({ disponible: true, motif: '' })

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    cle: 'local',
    nom: 'Scénario A — Redéploiement dans la commune',
    description: DESCRIPTION_SCOPE.commune,
    scope: 'commune',
    ajusterParametres: s => cloneSettings(s),
    verifierDisponibilite: diagnostics =>
      diagnostics.some(d => !!d.school.commune)
        ? { disponible: true, motif: '' }
        : { disponible: false, motif: "Aucune commune n'est renseignée dans le fichier établissements." },
  },
  {
    cle: 'departemental',
    nom: 'Scénario B — Redéploiement dans le département',
    description: DESCRIPTION_SCOPE.departement,
    scope: 'departement',
    ajusterParametres: s => cloneSettings(s),
    verifierDisponibilite: diagnostics =>
      diagnostics.some(d => !!d.school.departement)
        ? { disponible: true, motif: '' }
        : { disponible: false, motif: "Aucun département n'est renseigné dans le fichier établissements." },
  },
  {
    cle: 'etendu',
    nom: 'Scénario C — Réduction maximale du déficit',
    description: `${DESCRIPTION_SCOPE.etendu} ${AVERTISSEMENT_SCENARIO_ETENDU}`,
    scope: 'etendu',
    ajusterParametres: s => cloneSettings(s),
    verifierDisponibilite: toujoursDisponible,
  },
  {
    cle: 'poids',
    nom: 'Scénario D — Vœux examinés par poids des écoles',
    description:
      "Variante du référentiel (§3.4) : les vœux de chaque enseignant sont examinés de l'école la plus difficile à la plus facile, bonification comprise, au lieu de l'ordre choisi par l'enseignant. Mêmes règles que le scénario départemental par ailleurs.",
    scope: 'departement',
    ajusterParametres: s => {
      const ajuste = cloneSettings(s)
      ajuste.mobilite.ordreExamen = 'poids'
      return ajuste
    },
    verifierDisponibilite: diagnostics =>
      diagnostics.some(d => d.priorite.poids !== diagnostics[0]?.priorite.poids)
        ? { disponible: true, motif: '' }
        : { disponible: false, motif: "Toutes les écoles ont le même poids de vulnérabilité : l'ordre par poids n'aurait aucun effet." },
  },
  {
    cle: 'volontaire',
    nom: 'Scénario E — Mobilité volontaire seulement',
    description:
      "Vœux et solutions proches uniquement, sans redéploiement obligatoire : mesure ce que la seule mobilité volontaire permet de couvrir. Mêmes règles que le scénario départemental par ailleurs.",
    scope: 'departement',
    ajusterParametres: s => {
      const ajuste = cloneSettings(s)
      ajuste.mobilite.redeploiementObligatoire = false
      return ajuste
    },
    verifierDisponibilite: toujoursDisponible,
  },
  {
    cle: 'simple-flux',
    nom: 'Scénario F — Sans double flux',
    description:
      "Le double flux n'est pas autorisé : chaque salle compte pour un seul maître dans BMAX. Mesure l'effet du double flux sur le besoin reconnu et les salles manquantes (§2.4).",
    scope: 'departement',
    ajusterParametres: s => {
      const ajuste = cloneSettings(s)
      ajuste.besoin.doubleFluxAutorise = false
      return ajuste
    },
    verifierDisponibilite: diagnostics =>
      diagnostics.some(d => (d.school.sallesDoubleFlux ?? 0) > 0)
        ? { disponible: true, motif: '' }
        : { disponible: false, motif: "Aucune salle en double flux n'est déclarée : ce scénario n'aurait aucun effet." },
  },
]

let compteurScenario = 0

/** Identifiant local, sans dépendance à une API externe ni à un générateur aléatoire. */
export function nouvelIdScenario(prefixe = 'scenario'): string {
  compteurScenario++
  return `${prefixe}-${compteurScenario}-${Date.now().toString(36)}`
}

/** Instancie un scénario à partir d'un modèle et des paramètres courants. */
export function creerScenarioDepuisPreset(preset: ScenarioPreset, settings: EngineSettings): SimulationScenario {
  return {
    id: nouvelIdScenario(preset.cle),
    nom: preset.nom,
    description: preset.description,
    scope: preset.scope,
    settings: preset.ajusterParametres(settings),
    createdAt: new Date().toISOString(),
    predefini: true,
  }
}

/** Crée un scénario libre, entièrement paramétré par l'utilisateur. */
export function creerScenarioPersonnalise(
  nom: string,
  description: string,
  scope: GeographicScope,
  settings: EngineSettings,
): SimulationScenario {
  return {
    id: nouvelIdScenario('perso'),
    nom: nom.trim() || 'Scénario personnalisé',
    description: description.trim(),
    scope,
    settings: cloneSettings(settings),
    createdAt: new Date().toISOString(),
    predefini: false,
  }
}

/** Les trois scénarios géographiques de base, toujours comparés ensemble (§5). */
export const SCENARIOS_GEOGRAPHIQUES: GeographicScope[] = ['commune', 'departement', 'etendu']

/** Scénario minimal correspondant à un périmètre géographique. */
export function scenarioGeographique(scope: GeographicScope, settings: EngineSettings): SimulationScenario {
  return {
    id: `geo-${scope}`,
    nom: `Redéploiement — ${LIBELLE_SCOPE[scope].toLowerCase()}`,
    description: DESCRIPTION_SCOPE[scope],
    scope,
    settings: cloneSettings(settings),
    createdAt: new Date().toISOString(),
    predefini: true,
  }
}
