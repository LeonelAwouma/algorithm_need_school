'use client'

/**
 * Aiguillage des pages : associe chaque entrée de navigation à l'écran du
 * contexte qui la porte. C'est le seul endroit qui importe les `pages.ts` des
 * contextes.
 */

import { ArbitragePage } from '@contextes/arbitrage/pages'
import { JournalAuditPage } from '@contextes/audit/pages'
import { PrioritesPage, SituationNationalePage, TerritoiresPage, VueEnsemblePage } from '@contextes/diagnostic/pages'
import { EcolesPage, EnseignantsPage, ImportPage, QualiteDonneesPage, ValidationPage } from '@contextes/donnees/pages'
import { MethodologiePage } from '@contextes/methodologie/pages'
import { MouvementsPage, NominationsPage, VivierPage } from '@contextes/nominations/pages'
import { MoteurPage, ReferentielPage } from '@contextes/parametrage/pages'
import { HypothesesPage, IndicateursPage, PlanificationPage, QuotasPage } from '@contextes/planification/pages'
import { PrincePage } from '@contextes/prince/pages'
import { RapportPage } from '@contextes/rapports/pages'
import { RecrutesPage } from '@contextes/recrutement/pages'
import {
  AffectationsPage,
  ComparaisonPage,
  JournalSimulationPage,
  NonAffectesPage,
  PostesPage,
  ScenariosPage,
  VivierScenarioPage,
  VoeuxPage,
} from '@contextes/simulation/pages'
import type { PageKey } from '@shared/ui/coquille/navigation'

/**
 * Écran correspondant à une entrée de navigation.
 *
 * Le `switch` est exhaustif : ajouter une `PageKey` sans écran fait échouer la
 * compilation.
 */
export function RenduPage({ page }: { page: PageKey }) {
  switch (page) {
    // Collecter
    case 'import':
      return <ImportPage />
    case 'validation':
      return <ValidationPage />

    // Analyser
    case 'overview':
      return <VueEnsemblePage />
    case 'diagnostic':
      return <SituationNationalePage />
    case 'territoires':
      return <TerritoiresPage />
    case 'priorites':
      return <PrioritesPage />
    case 'schools':
      return <EcolesPage />
    case 'teachers':
      return <EnseignantsPage />

    // Simuler
    case 'prince':
      return <PrincePage />
    case 'simulations':
      return <ScenariosPage />
    case 'voeux':
      return <VoeuxPage />
    case 'arbitrage':
      return <ArbitragePage />
    case 'recrutes':
      return <RecrutesPage />
    case 'comparison':
      return <ComparaisonPage />

    // Planifier
    case 'planification':
      return <PlanificationPage />
    case 'hypotheses':
      return <HypothesesPage />
    case 'quotas':
      return <QuotasPage />
    case 'vivier':
      return <VivierPage />
    case 'nominations':
      return <NominationsPage />
    case 'mouvements':
      return <MouvementsPage />
    case 'indicateurs':
      return <IndicateursPage />

    // Restituer
    case 'reports':
      return <RapportPage />
    case 'audit':
      return <JournalAuditPage />
    case 'methodology':
      return <MethodologiePage />

    // Configuration
    case 'settings':
      return <ReferentielPage />
    case 'engine':
      return <MoteurPage />

    // Vue analyste
    case 'data':
      return <QualiteDonneesPage />
    case 'pool':
      return <VivierScenarioPage />
    case 'posts':
      return <PostesPage />
    case 'assignments':
      return <AffectationsPage />
    case 'unassigned':
      return <NonAffectesPage />
    case 'logs':
      return <JournalSimulationPage />

    // ACCÈS DÉSACTIVÉ : la page de gestion des accès n'est plus proposée (voir app/page.tsx).
    case 'acces':
      return null

    default: {
      const inconnue: never = page
      return inconnue
    }
  }
}
