'use client'

/**
 * Pages de diagnostic : situation nationale, exploration territoriale et
 * établissements prioritaires. Ces pages ne présentent que des constats — les
 * propositions d'affectation relèvent de la section Simulations.
 */

import { useMemo, useState } from 'react'
import { ArrowRight, Lightbulb } from 'lucide-react'
import type { SchoolDiagnostic, TerritorialSummary } from '@/types/education'
import { trierParPriorite } from '@/lib/analytics/diagnostic'
import { diagnosticTerritorial, pointsAttention } from '@/lib/analytics/narrative'
import { libelleNiveauEnfants, territoiresMixtes } from '@/lib/analytics/territory'
import { calculerFlux } from '@/lib/simulation/filter'
import { Colonnes, Histogramme, construireClasses } from '../charts'
import { CameroonMap, type IndicateurCarte, type StatsTerritoire } from '../maps/CameroonMap'
import { FluxPanel } from '../simulations/FluxPanel'
import { DataTable, EmptyState, Notice, Panel, SearchField, fmt, fmtDec, type Colonne } from '../common'
import { SeveritePill } from '../dashboard/OverviewPage'
import type { PlanningStore } from '../usePlanningState'

export function NationalDiagnosticPage({ store }: { store: PlanningStore }) {
  const { diagnostic, diagnosticsFiltres, arbreFiltre, noeudCourant, enfantsTerritoriaux, qualite, dataset, resultatAffiche, perimetre, settings, setPage, explorerTerritoire } = store
  const niveauEnfants = libelleNiveauEnfants(noeudCourant)

  const enonces = useMemo(
    () =>
      diagnosticTerritorial(
        arbreFiltre.totals,
        dataset?.teachers.length ?? 0,
        resultatAffiche,
        perimetre === 'Cameroun' ? 'le Cameroun' : perimetre,
      ),
    [arbreFiltre.totals, dataset, resultatAffiche, perimetre],
  )

  const attention = useMemo(() => pointsAttention(diagnosticsFiltres, noeudCourant, qualite), [diagnosticsFiltres, noeudCourant, qualite])
  const mixtes = useMemo(() => territoiresMixtes(enfantsTerritoriaux), [enfantsTerritoriaux])

  /**
   * Distribution du taux d'encadrement réel. Elle se lit directement contre la
   * norme configurée : la barre rouge sépare les écoles en déficit de celles
   * qui atteignent ou dépassent la norme.
   */
  const distribution = useMemo(
    () => construireClasses(diagnosticsFiltres.filter(d => d.nbClasses > 0).map(d => d.enseignantsEtat / d.nbClasses), 9),
    [diagnosticsFiltres],
  )

  if (!diagnostic) {
    return (
      <EmptyState titre="Aucun diagnostic disponible" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Le diagnostic est calculé automatiquement dès que les fichiers sont importés.
      </EmptyState>
    )
  }

  const totals = arbreFiltre.totals

  return (
    <div className="stack">
      <Panel kicker="Diagnostic automatique" title={`Situation — ${perimetre}`}>
        <div className="stack-tight">
          {enonces.map((e, i) => (
            <p key={i} style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>
              {e.texte}
            </p>
          ))}
        </div>
      </Panel>

      <div className="grid-2">
        <Panel kicker="Volumes" title="Ressources observées">
          <dl className="def-grid">
            <div>
              <dt>Établissements analysés</dt>
              <dd>{fmt(totals.ecolesAnalysees)}</dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd>{fmt(totals.classes)}</dd>
            </div>
            <div>
              <dt>Enseignants payés par l’État</dt>
              <dd>{fmt(totals.enseignantsEtat)}</dd>
            </div>
            <div>
              <dt>Autres enseignants</dt>
              <dd>{totals.autresEnseignants == null ? 'Non renseigné' : fmt(totals.autresEnseignants)}</dd>
            </div>
            <div>
              <dt>Élèves</dt>
              <dd>{totals.effectifTotalEleves == null ? 'Non renseigné' : fmt(totals.effectifTotalEleves)}</dd>
            </div>
            <div>
              <dt>Classes multigrades</dt>
              <dd>{fmt(totals.classesMultigrades)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel kicker="Écarts" title="Besoins et excédents">
          <dl className="def-grid">
            <div>
              <dt>Postes nécessaires (calculés)</dt>
              <dd>{fmt(totals.postesNecessaires)}</dd>
            </div>
            <div>
              <dt>Postes officiellement déclarés</dt>
              <dd>{totals.postesDeclares == null ? 'Non renseigné' : fmt(totals.postesDeclares)}</dd>
            </div>
            <div>
              <dt>Écart déclaré / calculé</dt>
              <dd>{totals.postesDeclares == null ? '—' : fmt(totals.postesDeclares - totals.postesNecessaires)}</dd>
            </div>
            <div>
              <dt>Enseignants redéployables</dt>
              <dd>{fmt(totals.excedentMobilisable)}</dd>
            </div>
            <div>
              <dt>Élèves par enseignant État</dt>
              <dd>{fmtDec(totals.elevesParEnseignantEtat, 1)}</dd>
            </div>
            <div>
              <dt>Élèves par classe</dt>
              <dd>{fmtDec(totals.elevesParClasse, 1)}</dd>
            </div>
          </dl>
          {totals.effectifTotalEleves == null && (
            <p className="hint" style={{ marginTop: 10 }}>
              Données élèves indisponibles — certains indicateurs pédagogiques ne peuvent pas être calculés.
            </p>
          )}
        </Panel>
      </div>

      <Panel
        kicker="Territoires"
        title="Répartition des besoins et des excédents"
        hint="Un territoire où les deux coexistent peut réduire son déficit sans mouvement longue distance."
      >
        <Colonnes
          titre={`Postes nécessaires et excédents mobilisables par ${niveauEnfants}`}
          series={[
            { cle: 'besoin', label: 'Postes nécessaires', couleur: 'var(--serie-4)', motif: 'hachures' },
            { cle: 'excedent', label: 'Enseignants redéployables', couleur: 'var(--serie-1)' },
          ]}
          donnees={enfantsTerritoriaux.map(r => ({
            cle: r.territory.code,
            label: r.territory.nom,
            valeurs: { besoin: r.totals.postesNecessaires, excedent: r.totals.excedentMobilisable },
            onSelect: () => explorerTerritoire(r.territory.nom),
          }))}
          unite="postes"
        />
        {mixtes.length > 0 && (
          <p className="hint" style={{ marginTop: 12 }}>
            Territoires où excédents et déficits coexistent : {mixtes.slice(0, 5).map(t => t.territory.nom).join(', ')}.
          </p>
        )}
      </Panel>

      <Panel
        kicker="Encadrement"
        title="Comment se répartit le taux d’encadrement"
        hint="Nombre d’établissements par tranche d’enseignants payés par l’État rapportés au nombre de classes. Les établissements situés à gauche du repère n’atteignent pas la norme configurée."
      >
        <Histogramme
          titre="Répartition des établissements par nombre d’enseignants par classe"
          classes={distribution}
          repere={{ valeur: settings.normeEncadrement.enseignantsParClasse, label: 'Norme' }}
          vide="Aucun établissement exploitable pour construire cette distribution."
        />
      </Panel>

      {attention.length > 0 && (
        <Panel kicker="Diagnostic automatique" title="Points d’attention">
          <ul className="reason-list">
            {attention.map(p => (
              <li key={p.code}>
                <Lightbulb size={16} aria-hidden="true" />
                <span>
                  <strong style={{ color: 'var(--ink)' }}>{p.titre}</strong> — {p.texte}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

export function TerritoriesPage({ store }: { store: PlanningStore }) {
  const {
    diagnostic,
    arbreComplet,
    enfantsTerritoriaux,
    filtres,
    setFiltres,
    resultatComplet,
    fluxTerritorial,
    comparaison,
    scenarios,
    scenarioActif,
    perimetre,
    setPage,
    ouvrirEcole,
  } = store
  const [indicateur, setIndicateur] = useState<IndicateurCarte>('postesNecessaires')

  const niveauCourant = filtres.territoire.commune
    ? 'commune'
    : filtres.territoire.departement
      ? 'departement'
      : filtres.territoire.region
        ? 'region'
        : 'national'

  const enfants: TerritorialSummary[] = enfantsTerritoriaux

  /**
   * Statistiques de simulation par territoire enfant. Elles sont lues sur le
   * résultat national — jamais recalculées — et comptent séparément ce que
   * chaque territoire reçoit et ce qu'il cède.
   */
  const statsParTerritoire = useMemo(() => {
    const carte = new Map<string, StatsTerritoire>()
    const source = resultatComplet ?? comparaison[1] ?? comparaison[0]
    if (!source) return carte
    for (const enfant of enfants) {
      const flux = calculerFlux(source, new Set(enfant.schoolIds))
      carte.set(enfant.territory.nom, {
        besoin: flux.besoinInitial,
        couverts: flux.postesCouverts,
        residuel: flux.besoinResiduel,
        recus: flux.enseignantsRecus,
        sortants: flux.enseignantsSortants,
        solde: flux.solde,
      })
    }
    return carte
  }, [enfants, resultatComplet, comparaison])

  if (!diagnostic || !arbreComplet) {
    return (
      <EmptyState titre="Aucune donnée territoriale" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        L’exploration territoriale devient disponible dès que les fichiers sont importés.
      </EmptyState>
    )
  }

  const descendre = (nom: string) => {
    if (niveauCourant === 'national') setFiltres({ ...filtres, territoire: { region: nom, departement: null, commune: null } })
    else if (niveauCourant === 'region') setFiltres({ ...filtres, territoire: { ...filtres.territoire, departement: nom, commune: null } })
    else if (niveauCourant === 'departement') setFiltres({ ...filtres, territoire: { ...filtres.territoire, commune: nom } })
  }

  const colonnes: Colonne<TerritorialSummary>[] = [
    {
      cle: 'nom',
      entete: niveauCourant === 'national' ? 'Région' : niveauCourant === 'region' ? 'Département' : 'Commune',
      rendu: t => (
        <button type="button" className="row-action" onClick={() => descendre(t.territory.nom)}>
          <strong>{t.territory.nom}</strong>
        </button>
      ),
      tri: t => t.territory.nom,
    },
    { cle: 'ecoles', entete: 'Écoles', numerique: true, rendu: t => fmt(t.totals.ecolesAnalysees), tri: t => t.totals.ecolesAnalysees },
    { cle: 'deficit', entete: 'En déficit', numerique: true, rendu: t => fmt(t.totals.ecolesEnDeficit), tri: t => t.totals.ecolesEnDeficit },
    { cle: 'postes', entete: 'Postes nécessaires', numerique: true, rendu: t => <strong>{fmt(t.totals.postesNecessaires)}</strong>, tri: t => t.totals.postesNecessaires },
    { cle: 'excedent', entete: 'Redéployables', numerique: true, rendu: t => fmt(t.totals.excedentMobilisable), tri: t => t.totals.excedentMobilisable },
    {
      cle: 'ratio',
      entete: 'Élèves / ens. État',
      numerique: true,
      rendu: t => fmtDec(t.totals.elevesParEnseignantEtat, 1),
      tri: t => t.totals.elevesParEnseignantEtat ?? -1,
    },
  ]

  // Les colonnes de mouvements n'ont de sens qu'une fois une simulation calculée.
  if (statsParTerritoire.size > 0) {
    colonnes.push(
      {
        cle: 'recus',
        entete: 'Reçus',
        numerique: true,
        rendu: t => fmt(statsParTerritoire.get(t.territory.nom)?.recus ?? 0),
        tri: t => statsParTerritoire.get(t.territory.nom)?.recus ?? 0,
      },
      {
        cle: 'cedes',
        entete: 'Cédés',
        numerique: true,
        rendu: t => fmt(statsParTerritoire.get(t.territory.nom)?.sortants ?? 0),
        tri: t => statsParTerritoire.get(t.territory.nom)?.sortants ?? 0,
      },
      {
        cle: 'solde',
        entete: 'Solde',
        numerique: true,
        rendu: t => {
          const solde = statsParTerritoire.get(t.territory.nom)?.solde ?? 0
          return (
            <span style={{ color: solde > 0 ? 'var(--ok)' : solde < 0 ? 'var(--alert)' : undefined, fontWeight: 650 }}>
              <span aria-hidden="true">{solde > 0 ? '▲ ' : solde < 0 ? '▼ ' : ''}</span>
              {solde > 0 ? '+' : ''}
              {fmt(solde)}
            </span>
          )
        },
        tri: t => statsParTerritoire.get(t.territory.nom)?.solde ?? 0,
      },
    )
  }

  const nomScenario = scenarios.find(s => s.id === scenarioActif)?.nom ?? 'Situation actuelle'
  const ecolesDuNiveau = niveauCourant === 'commune' ? store.diagnosticsFiltres : []

  return (
    <div className="stack">
      <Notice tone="info" title="Comment lire cette page.">
        Les simulations sont calculées sur l’ensemble des données. Les filtres territoriaux vous permettent ensuite
        d’observer les résultats pour une région, un département ou une commune.
      </Notice>

      {niveauCourant !== 'commune' && (
        <Panel
          kicker="Carte"
          title={
            niveauCourant === 'national'
              ? 'Répartition géographique par région'
              : niveauCourant === 'region'
                ? `Départements — ${filtres.territoire.region}`
                : `Communes — ${filtres.territoire.departement}`
          }
          hint="Choisissez l’indicateur représenté, puis cliquez sur un territoire pour l’explorer."
        >
          <CameroonMap
            niveau={niveauCourant === 'national' ? 'region' : niveauCourant === 'region' ? 'departement' : 'commune'}
            territoires={enfants}
            indicateur={indicateur}
            onIndicateurChange={setIndicateur}
            stats={statsParTerritoire}
            onExplorer={descendre}
            selection={niveauCourant === 'national' ? filtres.territoire.region : niveauCourant === 'region' ? filtres.territoire.departement : filtres.territoire.commune}
          />
        </Panel>
      )}

      {fluxTerritorial && resultatComplet && (
        <FluxPanel flux={fluxTerritorial} perimetre={perimetre} scenarioNom={nomScenario} onOuvrirEcole={ouvrirEcole} />
      )}

      {niveauCourant !== 'commune' ? (
        <Panel
          kicker="Exploration"
          title={niveauCourant === 'national' ? 'Régions' : niveauCourant === 'region' ? 'Départements' : 'Communes'}
          hint="Cliquez sur un territoire pour descendre d’un niveau."
          flush
        >
          <DataTable
            lignes={enfants}
            colonnes={colonnes}
            cle={t => t.territory.code}
            taillePage={25}
            legende="Indicateurs par territoire"
            messageVide="Aucun territoire ne correspond aux filtres."
          />
        </Panel>
      ) : (
        <Panel kicker="Exploration" title="Établissements de la commune" flush>
          <DataTable
            lignes={ecolesDuNiveau}
            colonnes={[
              {
                cle: 'nom',
                entete: 'Établissement',
                rendu: d => (
                  <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
                    <strong>{d.school.nom || d.school.id}</strong>
                    <small>{d.school.id}</small>
                  </button>
                ),
                tri: d => d.school.nom,
              },
              { cle: 'classes', entete: 'Classes', numerique: true, rendu: d => fmt(d.nbClasses), tri: d => d.nbClasses },
              { cle: 'ens', entete: 'Enseignants État', numerique: true, rendu: d => fmt(d.enseignantsEtat), tri: d => d.enseignantsEtat },
              { cle: 'besoin', entete: 'Déficit', numerique: true, rendu: d => fmt(d.besoinTheorique), tri: d => d.besoinTheorique },
              { cle: 'excedent', entete: 'Excédent', numerique: true, rendu: d => fmt(d.excedentTheorique), tri: d => d.excedentTheorique },
              { cle: 'situation', entete: 'Situation', rendu: d => <SeveritePill severite={d.severite} /> },
            ]}
            cle={d => d.school.id}
            legende="Établissements de la commune sélectionnée"
          />
        </Panel>
      )}
    </div>
  )
}

export function PrioritySchoolsPage({ store }: { store: PlanningStore }) {
  const { diagnostic, diagnosticsFiltres, setPage, ouvrirEcole } = store
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const base = trierParPriorite(diagnosticsFiltres.filter(d => d.besoinTheorique > 0))
    if (!q) return base
    return base.filter(d => `${d.school.id} ${d.school.nom} ${d.school.commune} ${d.school.departement}`.toLowerCase().includes(q))
  }, [diagnosticsFiltres, recherche])

  if (!diagnostic) {
    return (
      <EmptyState titre="Aucun diagnostic disponible" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Les priorités sont déduites du diagnostic, qui se calcule dès l’import des fichiers.
      </EmptyState>
    )
  }

  const colonnes: Colonne<SchoolDiagnostic>[] = [
    {
      cle: 'nom',
      entete: 'Établissement',
      rendu: d => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
          <strong>{d.school.nom || d.school.id}</strong>
          <small>
            {d.school.commune} · {d.school.departement} · {d.school.region}
          </small>
        </button>
      ),
      tri: d => d.school.nom,
    },
    { cle: 'classes', entete: 'Classes', numerique: true, rendu: d => fmt(d.nbClasses), tri: d => d.nbClasses },
    { cle: 'ens', entete: 'Enseignants État', numerique: true, rendu: d => fmt(d.enseignantsEtat), tri: d => d.enseignantsEtat },
    { cle: 'besoin', entete: 'Postes manquants', numerique: true, rendu: d => <strong>{fmt(d.besoinTheorique)}</strong>, tri: d => d.besoinTheorique },
    { cle: 'eleves', entete: 'Élèves', numerique: true, rendu: d => fmt(d.school.effectifTotalEleves), tri: d => d.school.effectifTotalEleves ?? -1 },
    { cle: 'pression', entete: 'Élèves / ens. État', numerique: true, rendu: d => fmtDec(d.elevesParEnseignantEtat, 1), tri: d => d.elevesParEnseignantEtat ?? -1 },
    { cle: 'multigrade', entete: 'Multigrades', numerique: true, rendu: d => fmt(d.school.classesMultigrades), tri: d => d.school.classesMultigrades },
    {
      cle: 'raison',
      entete: 'Pourquoi cette école ?',
      rendu: d => (
        <span style={{ display: 'block', maxWidth: 420 }}>
          {d.raisons.length === 0 ? '—' : d.raisons[0].texte}
          {d.raisons.length > 1 && <small>+ {d.raisons.length - 1} autre(s) raison(s)</small>}
        </span>
      ),
    },
  ]

  return (
    <div className="stack">
      <Notice tone="neutral" title="Classement descriptif.">
        Les établissements sont ordonnés par nombre de postes manquants, puis par pression élèves par enseignant. Ce
        classement décrit les données : il ne constitue pas un ordre de traitement administratif.
      </Notice>

      <div className="filter-bar">
        <SearchField value={recherche} onChange={setRecherche} label="Rechercher un établissement" placeholder="Nom, code, commune…" />
      </div>

      <Panel kicker="Priorités" title={`${fmt(lignes.length)} établissements en déficit`} flush>
        <DataTable
          lignes={lignes}
          colonnes={colonnes}
          cle={d => d.school.id}
          legende="Établissements en déficit, classés par priorité"
          messageVide="Aucun établissement en déficit sur ce périmètre."
        />
      </Panel>
    </div>
  )
}

export function BoutonFiche({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-sm" onClick={onClick}>
      Ouvrir la fiche <ArrowRight size={12} aria-hidden="true" />
    </button>
  )
}
