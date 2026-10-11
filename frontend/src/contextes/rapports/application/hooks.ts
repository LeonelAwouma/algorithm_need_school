'use client'

/** Cas d'usage du contexte « Rapports » : rapport de décision du périmètre. */

import type { IdJeu, TerritorySelection } from '../../../shared/api'
import { useLectureJeu } from '../../../shared/requetes'
import { lireRapport } from '../infrastructure/rapportsApi'

/** Rapport de décision ; le scénario retenu par défaut. */
export function useRapport(jeu: IdJeu | null, selection: TerritorySelection, scenario: string | null) {
  return useLectureJeu(jeu, 'rapport', [selection, scenario], (id, signal) =>
    lireRapport(id, selection, scenario, signal),
  )
}
