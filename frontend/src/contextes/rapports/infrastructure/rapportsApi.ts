/**
 * Accès à l'API du contexte « Rapports » : rapport de décision assemblé par le
 * serveur. Les fichiers (DOCX, XLSX, CSV) sont produits par le frontend à
 * partir de ce JSON.
 *
 * Route : GET jeux/{jeu}/rapport/
 */

import {
  appeler,
  querySelection,
  route,
  type DecisionReport,
  type IdJeu,
  type TerritorySelection,
} from '../../../shared/api'

const ROUTES = {
  rapport: route<DecisionReport>()('GET', 'jeux/{jeu}/rapport/'),
}

/**
 * Rapport de décision du périmètre.
 *
 * @param scenario scénario présenté dans le rapport ; le scénario retenu par défaut.
 */
export function lireRapport(
  jeu: IdJeu,
  selection: TerritorySelection,
  scenario: string | null,
  signal?: AbortSignal,
): Promise<DecisionReport> {
  return appeler(ROUTES.rapport, {
    params: { jeu },
    query: { ...querySelection(selection), scenario: scenario ?? undefined },
    signal,
  })
}
