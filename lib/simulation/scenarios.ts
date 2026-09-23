/**
 * Scénarios de simulation (§5 et §12).
 *
 * Trois scénarios géographiques forment le socle — local, départemental,
 * étendu. Deux scénarios de règles viennent ensuite, et ne sont proposés que
 * lorsque les données permettent réellement de les appliquer : un scénario dont
 * la règle ne peut pas être évaluée n'est pas affiché comme disponible.
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
  commune: "Les enseignants ne peuvent être proposés que sur des postes de leur propre commune.",
  departement: "Les mouvements restent à l'intérieur du département de rattachement.",
  etendu: "Aucune contrainte géographique : ce scénario mesure un plafond théorique de redistribution.",
}

/** Message obligatoire accompagnant le scénario sans contrainte géographique (§29). */
export const AVERTISSEMENT_SCENARIO_ETENDU =
  "Ce scénario représente un potentiel théorique maximal et peut impliquer des déplacements géographiquement peu réalistes."

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
    ajusterParametres: s => {
      const ajuste = cloneSettings(s)
      // La règle de ce scénario est explicite : aucune restriction géographique
      // et toutes les phases actives, pour mesurer le plafond de redistribution.
      ajuste.phases.phase1Commune = true
      ajuste.phases.phase2Departement = true
      ajuste.phases.phase4Reste = true
      return ajuste
    },
    verifierDisponibilite: toujoursDisponible,
  },
  {
    cle: 'rural',
    nom: 'Scénario D — Priorité aux zones rurales',
    description:
      "Mêmes règles que le scénario départemental, mais les postes situés en zone rurale reçoivent un bonus de score explicite.",
    scope: 'departement',
    ajusterParametres: s => {
      const ajuste = cloneSettings(s)
      ajuste.phases.prioriteZonesRurales = true
      return ajuste
    },
    verifierDisponibilite: diagnostics => {
      const rurales = diagnostics.filter(d => d.school.zone === 'rurale').length
      return rurales > 0
        ? { disponible: true, motif: '' }
        : {
            disponible: false,
            motif: "Aucun établissement n'est identifié comme rural : la règle de ce scénario n'aurait aucun effet.",
          }
    },
  },
  {
    cle: 'multigrade',
    nom: 'Scénario E — Priorité aux classes multigrades',
    description:
      "Mêmes règles que le scénario départemental, mais les écoles déclarant des classes multigrades reçoivent un bonus de score explicite.",
    scope: 'departement',
    ajusterParametres: s => {
      const ajuste = cloneSettings(s)
      ajuste.phases.prioriteClassesMultigrades = true
      return ajuste
    },
    verifierDisponibilite: diagnostics => {
      const multigrades = diagnostics.filter(d => d.school.classesMultigrades > 0).length
      return multigrades > 0
        ? { disponible: true, motif: '' }
        : {
            disponible: false,
            motif: "Aucune classe multigrade n'est déclarée : la règle de ce scénario n'aurait aucun effet.",
          }
    },
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
