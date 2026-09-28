'use client'

/**
 * Point d'entrée de l'application.
 *
 * L'application est volontairement une page unique à navigation interne : les
 * données importées ne vivent qu'en mémoire, et cette forme garantit qu'elles
 * survivent à la navigation aussi bien dans le navigateur que dans la version
 * de bureau, qui sert un export statique sans serveur.
 */

import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { FILTRES_VIDES } from '@/lib/analytics/territory'
import { LIBELLE_SCOPE } from '@/lib/simulation/scenarios'
import { Notice, Pill } from '@/components/common'
import { FilterBar, PageHeader, Sidebar, TerritoryBreadcrumb, Topbar } from '@/components/layout'
import { BandeauMiseAJour, useMiseAJour } from '@/components/layout/MiseAJour'
import { ImportWizard } from '@/components/import/ImportWizard'
import { OverviewPage } from '@/components/dashboard/OverviewPage'
import { NationalDiagnosticPage, PrioritySchoolsPage, TerritoriesPage } from '@/components/diagnostic'
import { SchoolsPage } from '@/components/schools'
import { TeachersPage } from '@/components/teachers'
import { PrincePage } from '@/components/prince'
import { ComparisonPage, SimulationsPage } from '@/components/simulations'
import { ReportPage } from '@/components/reports/ReportPage'
import { MethodologyPage } from '@/components/methodology/MethodologyPage'
import { ReferentialPage } from '@/components/settings/ReferentialPage'
import { EnginePage } from '@/components/settings/EnginePage'
import { AssignmentsPage, DataPage, LogsPage, PoolPage, PostsPage, UnassignedPage } from '@/components/analyst'
import { usePlanningState } from '@/components/usePlanningState'

/** Pages sur lesquelles la barre de filtres territoriaux n'a pas de sens. */
const SANS_FILTRES = new Set(['import', 'methodology', 'settings', 'engine', 'data', 'logs', 'prince'])

export default function Page() {
  const store = usePlanningState()
  const {
    page,
    setPage,
    mode,
    changerMode,
    menuOuvert,
    setMenuOuvert,
    donneesChargees,
    simulationPrete,
    filtres,
    setFiltres,
    optionsFiltres,
    perimetre,
    settings,
    scenarios,
    scenarioActif,
    setScenarioActif,
    calculEnCours,
    erreur,
    effacerSession,
    dataset,
    resultatAffiche,
  } = store

  const miseAJour = useMiseAJour()
  const nomScenario = scenarios.find(s => s.id === scenarioActif)?.nom ?? 'Situation actuelle'

  const etat = calculEnCours ? (
    <Pill tone="info">
      <RefreshCw size={12} className="spin" aria-hidden="true" /> Calcul en cours
    </Pill>
  ) : erreur ? (
    <Pill tone="alert">
      <AlertTriangle size={12} aria-hidden="true" /> Erreur de calcul
    </Pill>
  ) : simulationPrete ? (
    <Pill tone="ok">
      <Check size={12} aria-hidden="true" /> Scénarios calculés
    </Pill>
  ) : donneesChargees ? (
    <Pill tone="info">Diagnostic calculé</Pill>
  ) : (
    <Pill tone="warn">Aucune donnée</Pill>
  )

  function confirmerEffacement() {
    const confirme =
      typeof window === 'undefined' ||
      window.confirm(
        "Effacer les données de cette session ?\n\nLes fichiers importés, les résultats calculés et les préférences enregistrées seront supprimés de cette session. Cette action est immédiate et irréversible.",
      )
    if (confirme) effacerSession()
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu principal
      </a>

      {menuOuvert && <div className="backdrop" onClick={() => setMenuOuvert(false)} aria-hidden="true" />}

      <Topbar
        mode={mode}
        onModeChange={changerMode}
        onOuvrirMenu={() => setMenuOuvert(true)}
        etat={etat}
        territoire={perimetre}
        anneeScolaire={settings.anneeScolaire}
        scenario={resultatAffiche ? `${nomScenario} (${LIBELLE_SCOPE[resultatAffiche.scope].toLowerCase()})` : nomScenario}
        onEffacer={confirmerEffacement}
      />

      <div className="app-body">
        <div className="sidebar-slot" />
        <Sidebar
          page={page}
          onNavigate={setPage}
          mode={mode}
          ouverte={menuOuvert}
          onFermer={() => setMenuOuvert(false)}
          donneesChargees={donneesChargees}
          simulationPrete={simulationPrete}
          version={miseAJour?.versionActuelle}
        />

        <div className="main-col">
          <main className="content" id="contenu">
            <PageHeader page={page} onAccueil={() => setPage(donneesChargees ? 'overview' : 'import')} />

            <div className="stack">
              <BandeauMiseAJour etat={miseAJour} donneesChargees={donneesChargees} />

              {erreur && (
                <Notice tone="alert" title="Le calcul a échoué.">
                  {erreur}
                </Notice>
              )}

              {dataset?.demonstration && page !== 'import' && (
                <Notice tone="warn" title="Données de démonstration.">
                  Les valeurs affichées sont fictives et ne constituent pas des statistiques officielles.
                </Notice>
              )}

              {donneesChargees && !SANS_FILTRES.has(page) && (
                <>
                  <TerritoryBreadcrumb selection={filtres.territoire} onSelect={t => setFiltres({ ...filtres, territoire: t })} />
                  <FilterBar
                    filtres={filtres}
                    options={optionsFiltres}
                    onChange={setFiltres}
                    onReset={() => setFiltres(FILTRES_VIDES)}
                    scenarioActif={scenarioActif}
                    scenarios={scenarios.filter(s => !!store.resultats[s.id]).map(s => ({ id: s.id, nom: s.nom }))}
                    onScenarioChange={setScenarioActif}
                  />
                </>
              )}

              {page === 'import' && <ImportWizard store={store} />}
              {page === 'overview' && <OverviewPage store={store} />}
              {page === 'diagnostic' && <NationalDiagnosticPage store={store} />}
              {page === 'territoires' && <TerritoriesPage store={store} />}
              {page === 'priorites' && <PrioritySchoolsPage store={store} />}
              {page === 'schools' && <SchoolsPage store={store} />}
              {page === 'teachers' && <TeachersPage store={store} />}
              {page === 'prince' && <PrincePage store={store} />}
              {page === 'simulations' && <SimulationsPage store={store} />}
              {page === 'comparison' && <ComparisonPage store={store} />}
              {page === 'reports' && <ReportPage store={store} />}
              {page === 'methodology' && <MethodologyPage store={store} />}
              {page === 'settings' && <ReferentialPage store={store} />}
              {page === 'engine' && <EnginePage store={store} />}
              {page === 'data' && <DataPage store={store} />}
              {page === 'pool' && <PoolPage store={store} />}
              {page === 'posts' && <PostsPage store={store} />}
              {page === 'assignments' && <AssignmentsPage store={store} />}
              {page === 'unassigned' && <UnassignedPage store={store} />}
              {page === 'logs' && <LogsPage store={store} />}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
