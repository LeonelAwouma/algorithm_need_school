'use client'

/**
 * Vue d'ensemble — page de pilotage (§6 et §7).
 *
 * Objectif : qu'une personne qui ne connaît ni l'algorithme ni les statistiques
 * comprenne en moins d'une minute combien d'écoles ont un problème de personnel,
 * où elles se trouvent, ce qui peut être couvert par redéploiement, et ce qui
 * resterait à couvrir.
 */

import { useMemo } from 'react'
import { ArrowRight, BarChart3, FileText, FlaskConical, Lightbulb, RefreshCw, Upload } from 'lucide-react'
import { trierParPriorite } from '@/lib/analytics/diagnostic'
import { MENTION_SIMULATION, pointsAttention, reductionDuDeficit, syntheseTableauDeBord } from '@/lib/analytics/narrative'
import { libelleNiveauEnfants } from '@/lib/analytics/territory'
import { AVERTISSEMENT_SCENARIO_ETENDU, LIBELLE_SCOPE } from '@/lib/simulation/scenarios'
import { AvantApres, Combo, CouvertureParScenario, Nuage, Repartition, type PointNuage } from '../charts'
import { DataTable, EmptyState, KpiCard, Notice, Panel, Pill, fmt, fmtDec, fmtPct, type Colonne } from '../common'
import { LIBELLE_SEVERITE } from '../layout'
import type { PlanningStore } from '../usePlanningState'
import type { SchoolDiagnostic } from '@/types/education'
import type { PageKey } from '../layout/navigation'

/** Raccourcis vers les quatre étapes du travail, sur le modèle des cartes de modules d'OpenEMIS. */
const ETAPES: { page: PageKey; titre: string; texte: string; Icone: typeof Upload }[] = [
  { page: 'import', titre: 'Collecter', texte: 'Importer et contrôler les fichiers', Icone: Upload },
  { page: 'territoires', titre: 'Analyser', texte: 'Déficits, excédents et territoires', Icone: BarChart3 },
  { page: 'simulations', titre: 'Simuler', texte: 'Tester des scénarios de redéploiement', Icone: FlaskConical },
  { page: 'reports', titre: 'Restituer', texte: 'Rapports et méthodologie', Icone: FileText },
]

export function OverviewPage({ store }: { store: PlanningStore }) {
  const {
    diagnostic,
    diagnosticsFiltres,
    arbreFiltre,
    noeudCourant,
    enfantsTerritoriaux,
    dataset,
    qualite,
    resultatAffiche,
    comparaison,
    scenarioActif,
    scenarios,
    perimetre,
    settings,
    setPage,
    ouvrirEcole,
    explorerTerritoire,
    setFiltres,
    filtres,
    calculerScenariosDeBase,
    calculEnCours,
    resultatsObsoletes,
  } = store

  const totals = arbreFiltre.totals
  const scenarioNom = scenarios.find(s => s.id === scenarioActif)?.nom ?? 'Situation actuelle'

  const synthese = useMemo(
    () => syntheseTableauDeBord(totals, resultatAffiche, perimetre === 'Cameroun' ? 'le Cameroun' : perimetre),
    [totals, resultatAffiche, perimetre],
  )

  const attention = useMemo(
    () => pointsAttention(diagnosticsFiltres, noeudCourant, qualite),
    [diagnosticsFiltres, noeudCourant, qualite],
  )

  const niveauEnfants = libelleNiveauEnfants(noeudCourant)

  /**
   * Chaque établissement placé selon ses classes et ses enseignants. La droite
   * de référence matérialise la norme configurée : tout point situé en dessous
   * correspond à une école en déficit, tout point au-dessus à un excédent.
   * Au-delà de 1 200 établissements, un échantillon régulier est représenté
   * pour que le graphique reste lisible et léger.
   */
  const nuage = useMemo(() => {
    const total = diagnosticsFiltres.length
    const pas = total > 1200 ? Math.ceil(total / 1200) : 1
    const points: PointNuage[] = []
    for (let i = 0; i < total; i += pas) {
      const d = diagnosticsFiltres[i]
      points.push({
        cle: d.school.id,
        label: d.school.nom || d.school.id,
        x: d.nbClasses,
        y: d.enseignantsEtat,
        categorie: d.besoinTheorique > 0 ? 'deficit' : d.excedentTheorique > 0 ? 'excedent' : 'equilibre',
        onSelect: () => ouvrirEcole(d.school.id),
      })
    }
    return { points, echantillonne: pas > 1, total }
  }, [diagnosticsFiltres, ouvrirEcole])

  const besoinsParRegion = useMemo(() => {
    const couvertsParRegion = new Map<string, number>()
    if (resultatAffiche) {
      for (const a of resultatAffiche.assignments) {
        const region = a.regionDestination || 'Région non renseignée'
        couvertsParRegion.set(region, (couvertsParRegion.get(region) ?? 0) + 1)
      }
    }
    return enfantsTerritoriaux
      .filter(r => r.totals.postesNecessaires > 0)
      .slice(0, 12)
      .map(r => {
        const couverts = Math.min(couvertsParRegion.get(r.territory.nom) ?? 0, r.totals.postesNecessaires)
        const necessaires = r.totals.postesNecessaires
        return {
          cle: r.territory.code,
          label: r.territory.nom,
          valeurs: {
            necessaires,
            couverts,
            restant: necessaires - couverts,
            taux: necessaires > 0 ? Math.round((couverts / necessaires) * 100) : 0,
          },
          onSelect: () => explorerTerritoire(r.territory.nom),
        }
      })
  }, [enfantsTerritoriaux, resultatAffiche, explorerTerritoire])

  const repartition = useMemo(() => {
    const compte = (severite: SchoolDiagnostic['severite']) => diagnosticsFiltres.filter(d => d.severite === severite).length
    const seuilFaible = fmtPct(settings.seuilsSeverite.faible)
    const seuilImportant = fmtPct(settings.seuilsSeverite.important)
    return [
      {
        cle: 'satisfaisant',
        label: LIBELLE_SEVERITE.satisfaisant,
        valeur: compte('satisfaisant'),
        couleur: 'var(--serie-3)',
        definition: 'aucun poste manquant',
        onSelect: () => setFiltres({ ...filtres, severites: ['satisfaisant'] }),
      },
      {
        cle: 'excedent',
        label: LIBELLE_SEVERITE.excedent,
        valeur: compte('excedent'),
        couleur: 'var(--serie-2)',
        motif: 'points' as const,
        definition: 'plus d’enseignants que le minimum à conserver',
        onSelect: () => setFiltres({ ...filtres, severites: ['excedent'] }),
      },
      {
        cle: 'deficit_faible',
        label: LIBELLE_SEVERITE.deficit_faible,
        valeur: compte('deficit_faible'),
        couleur: 'var(--serie-4)',
        definition: `jusqu’à ${seuilFaible} du besoin`,
        onSelect: () => setFiltres({ ...filtres, severites: ['deficit_faible'] }),
      },
      {
        cle: 'deficit_important',
        label: LIBELLE_SEVERITE.deficit_important,
        valeur: compte('deficit_important'),
        couleur: '#b06a30',
        motif: 'hachures' as const,
        definition: `jusqu’à ${seuilImportant} du besoin`,
        onSelect: () => setFiltres({ ...filtres, severites: ['deficit_important'] }),
      },
      {
        cle: 'deficit_critique',
        label: LIBELLE_SEVERITE.deficit_critique,
        valeur: compte('deficit_critique'),
        couleur: '#8d3535',
        definition: `au-delà de ${seuilImportant} du besoin`,
        onSelect: () => setFiltres({ ...filtres, severites: ['deficit_critique'] }),
      },
    ]
  }, [diagnosticsFiltres, settings.seuilsSeverite, setFiltres, filtres])

  const prioritaires = useMemo(
    () => trierParPriorite(diagnosticsFiltres.filter(d => d.besoinTheorique > 0)).slice(0, 8),
    [diagnosticsFiltres],
  )

  if (!diagnostic || !dataset) {
    return (
      <EmptyState titre="Aucune donnée chargée" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Importez le fichier des établissements et celui des enseignants pour obtenir le diagnostic, ou explorez
        l’application avec le jeu de démonstration.
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
            {d.school.commune} · {d.school.departement}
          </small>
        </button>
      ),
    },
    { cle: 'classes', entete: 'Classes', numerique: true, rendu: d => fmt(d.nbClasses) },
    { cle: 'ens', entete: "Enseignants État", numerique: true, rendu: d => fmt(d.enseignantsEtat) },
    { cle: 'deficit', entete: 'Postes manquants', numerique: true, rendu: d => <strong>{fmt(d.besoinTheorique)}</strong> },
    {
      cle: 'pression',
      entete: 'Élèves / enseignant',
      numerique: true,
      rendu: d => fmtDec(d.elevesParEnseignantEtat, 1),
    },
    { cle: 'severite', entete: 'Situation', rendu: d => <SeveritePill severite={d.severite} /> },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Simulation d’aide à la décision.">
        {MENTION_SIMULATION}
      </Notice>

      {resultatsObsoletes && (
        <Notice tone="warn" title="Les règles de l’analyse ont changé.">
          Les résultats affichés ont été calculés avec les anciennes règles.{' '}
          <button type="button" className="btn-link" onClick={calculerScenariosDeBase}>
            Mettre à jour les simulations
          </button>
        </Notice>
      )}

      <nav className="module-tiles" aria-label="Étapes de travail">
        {ETAPES.map(({ page, titre, texte, Icone }) => (
          <button type="button" className="module-tile" key={page} onClick={() => setPage(page)}>
            <span className="module-tile-icon" aria-hidden="true">
              <Icone size={20} />
            </span>
            <span>
              <strong>{titre}</strong>
              <small>{texte}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="action-bar">
        <p className="hint">
          Scénario affiché : <strong>{scenarioNom}</strong>
        </p>
        {calculEnCours ? (
          <span className="busy">
            <RefreshCw size={15} className="spin" aria-hidden="true" /> Calcul des scénarios…
          </span>
        ) : comparaison.length === 0 ? (
          <button type="button" className="btn btn-primary" onClick={calculerScenariosDeBase}>
            Calculer les scénarios de redéploiement
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setPage('comparison')}>
            Comparer les scénarios <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="kpi-row">
        <KpiCard
          label="Écoles analysées"
          value={fmt(totals.ecolesAnalysees)}
          hint="Établissements exploitables du périmètre sélectionné."
          lien="Voir la liste"
          onClick={() => setPage('schools')}
        />
        <KpiCard
          label="Écoles en déficit"
          value={fmt(totals.ecolesEnDeficit)}
          hint="Il y manque au moins un enseignant au regard de la norme paramétrée."
          lien="Voir les priorités"
          tone={totals.ecolesEnDeficit > 0 ? 'alert' : 'ok'}
          onClick={() => setPage('priorites')}
        />
        <KpiCard
          label="Écoles avec excédent"
          value={fmt(totals.ecolesAvecExcedent)}
          hint="Elles peuvent libérer des enseignants sans descendre sous leur minimum."
          lien="Voir les écoles"
          tone="info"
          onClick={() => {
            setFiltres({ ...filtres, severites: ['excedent'] })
            setPage('schools')
          }}
        />
        <KpiCard
          label="Enseignants payés par l’État"
          value={fmt(totals.enseignantsEtat)}
          hint="Effectif déclaré dans les établissements du périmètre."
          lien="Voir les enseignants"
          onClick={() => setPage('teachers')}
        />
      </div>

      <div className="kpi-row">
        <KpiCard
          label="Postes nécessaires"
          value={fmt(totals.postesNecessaires)}
          hint="Nombre d’enseignants manquants, calculé école par école."
          lien="Comprendre le calcul"
          tone="warn"
          onClick={() => setPage('methodology')}
        />
        <KpiCard
          label="Enseignants potentiellement redéployables"
          value={fmt(totals.excedentMobilisable)}
          hint="Ils peuvent quitter leur école sans la mettre en déficit."
          lien="Voir les écoles sources"
          tone="info"
          onClick={() => setPage(store.mode === 'analyste' ? 'pool' : 'schools')}
        />
        <KpiCard
          label="Postes couverts par simulation"
          value={resultatAffiche ? fmt(resultatAffiche.postesCouverts) : '—'}
          hint={resultatAffiche ? `Scénario : ${LIBELLE_SCOPE[resultatAffiche.scope].toLowerCase()}.` : "Aucun scénario n’est encore sélectionné."}
          lien={resultatAffiche ? 'Voir les propositions' : undefined}
          tone="ok"
          onClick={resultatAffiche ? () => setPage('simulations') : undefined}
        />
        <KpiCard
          label="Besoin résiduel"
          value={resultatAffiche ? fmt(resultatAffiche.besoinResiduel) : '—'}
          hint="Postes qui resteraient à pourvoir après redéploiement."
          lien={resultatAffiche ? 'Voir le détail' : undefined}
          tone="alert"
          onClick={resultatAffiche ? () => setPage('comparison') : undefined}
        />
      </div>

      <Panel kicker="Synthèse" title="Ce que disent les données" id="synthese">
        <div className="stack-tight">
          {synthese.map((e, i) => (
            <p key={i} style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>
              {e.texte}
            </p>
          ))}
          {store.mode === 'analyste' && (
            <details className="advanced">
              <summary>Règles ayant déclenché ces phrases</summary>
              <ul className="hint" style={{ paddingLeft: 18 }}>
                {synthese.map((e, i) => (
                  <li key={i} className="mono">
                    {e.regle}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Panel>

      <div className="grid-main">
        <Panel
          kicker="Territoires"
          title={`Besoins par ${niveauEnfants}`}
          hint={`Postes nécessaires, part couverte par le scénario sélectionné et part restante. Cliquez sur ${niveauEnfants === 'commune' ? 'une commune' : `un ${niveauEnfants}`} pour l’explorer.`}
        >
          <Combo
            titre={`Postes nécessaires par ${niveauEnfants}`}
            series={[
              { cle: 'couverts', label: 'Couverts par redéploiement', couleur: 'var(--serie-1)' },
              { cle: 'restant', label: 'Restant à pourvoir', couleur: 'var(--serie-4)', motif: 'hachures' },
            ]}
            courbe={{ cle: 'taux', label: 'Taux de couverture', couleur: '#5b3f8c', format: v => `${Math.round(v)} %`, max: 100 }}
            donnees={besoinsParRegion}
            vide="Aucun poste nécessaire à détailler sur ce périmètre."
          />
        </Panel>

        <Panel kicker="Diagnostic" title="Situation des écoles" hint="Répartition des établissements selon l’ampleur de leur déficit.">
          <Repartition titre="Répartition des établissements par situation" segments={repartition} />
        </Panel>
      </div>

      <div className="grid-main">
        <Panel
          kicker="Scénarios"
          title="Couverture par scénario"
          hint="Ce que chaque périmètre géographique permettrait de couvrir. Aucun scénario n’est présenté comme préférable."
          actions={
            comparaison.length > 0 ? (
              <button type="button" className="btn btn-sm" onClick={() => setPage('comparison')}>
                Tableau comparatif
              </button>
            ) : undefined
          }
        >
          <CouvertureParScenario
            scenarios={comparaison.map(r => ({
              cle: r.scenarioId,
              label: LIBELLE_SCOPE[r.scope],
              couverts: r.postesCouverts,
              residuel: r.besoinResiduel,
              taux: r.tauxCouverture,
            }))}
          />
          {comparaison.some(r => r.scope === 'etendu') && (
            <p className="hint" style={{ marginTop: 10 }}>
              {AVERTISSEMENT_SCENARIO_ETENDU}
            </p>
          )}
        </Panel>

        <Panel kicker="Simulation" title="Avant / Après" hint="Effet du scénario sélectionné sur le périmètre affiché.">
          {resultatAffiche ? (
            <>
              <AvantApres
                lignes={[
                  {
                    label: 'Écoles en déficit',
                    avant: resultatAffiche.before.ecolesEnDeficit,
                    apres: resultatAffiche.after.ecolesEnDeficit,
                  },
                  {
                    label: 'Postes restant à pourvoir',
                    avant: resultatAffiche.before.postesVacants,
                    apres: resultatAffiche.after.postesVacants,
                  },
                ]}
              />
              {reductionDuDeficit(resultatAffiche) && (
                <p style={{ marginTop: 12, fontWeight: 650 }}>{reductionDuDeficit(resultatAffiche)?.texte}</p>
              )}
            </>
          ) : (
            <p className="hint">Sélectionnez un scénario dans la barre de filtres pour comparer la situation avant et après.</p>
          )}
        </Panel>
      </div>

      <Panel
        kicker="Établissements"
        title="Chaque école face à la norme"
        hint={`Un point par établissement : son nombre de classes en abscisse, ses enseignants payés par l’État en ordonnée. La droite représente la norme configurée (${settings.normeEncadrement.enseignantsParClasse} enseignant par classe). Cliquez un point pour ouvrir la fiche.${nuage.echantillonne ? ` Échantillon régulier de ${fmt(nuage.points.length)} établissements sur ${fmt(nuage.total)}, pour préserver la lisibilité.` : ''}`}
      >
        <Nuage
          titre="Classes et enseignants par établissement"
          points={nuage.points}
          categories={[
            { cle: 'deficit', label: 'En déficit', couleur: '#a8453f', forme: 'triangle' },
            { cle: 'equilibre', label: 'À l’équilibre', couleur: 'var(--serie-3)', forme: 'cercle' },
            { cle: 'excedent', label: 'Avec excédent mobilisable', couleur: 'var(--serie-1)', forme: 'carre' },
          ]}
          axeX={{ label: 'Nombre de classes' }}
          axeY={{ label: 'Enseignants payés par l’État' }}
          reference={{ pente: settings.normeEncadrement.enseignantsParClasse, label: 'Norme d’encadrement' }}
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

      <Panel
        kicker="Priorités"
        title="Établissements nécessitant une attention particulière"
        hint="Classement par nombre de postes manquants, puis par pression élèves par enseignant."
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setPage('priorites')}>
            Voir toutes les écoles prioritaires <ArrowRight size={13} aria-hidden="true" />
          </button>
        }
        flush
      >
        <DataTable
          lignes={prioritaires}
          colonnes={colonnes}
          cle={d => d.school.id}
          taillePage={8}
          legende="Établissements présentant les déficits les plus élevés"
          messageVide="Aucun établissement en déficit sur ce périmètre."
        />
      </Panel>
    </div>
  )
}

export function SeveritePill({ severite }: { severite: SchoolDiagnostic['severite'] }) {
  const tone =
    severite === 'deficit_critique'
      ? 'alert'
      : severite === 'deficit_important'
        ? 'warn'
        : severite === 'deficit_faible'
          ? 'warn'
          : severite === 'excedent'
            ? 'info'
            : 'ok'
  const symbole =
    severite === 'deficit_critique' ? '▲▲' : severite === 'deficit_important' ? '▲' : severite === 'deficit_faible' ? '△' : severite === 'excedent' ? '▼' : '●'
  return (
    <Pill tone={tone}>
      <span aria-hidden="true">{symbole}</span> {LIBELLE_SEVERITE[severite]}
    </Pill>
  )
}
