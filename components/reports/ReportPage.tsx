'use client'

/**
 * Rapport décisionnel (§19).
 *
 * Le rapport est composé à partir des seuls résultats calculés. Il possède sa
 * propre mise en page — page de garde, indicateurs, graphiques, méthodologie
 * courte et mention de statut — pensée pour être lue à l'écran comme imprimée :
 * `window.print()` ne masque que la navigation, le document reste identique.
 */

import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, Printer, RefreshCw, Table } from 'lucide-react'
import { construireRapport } from '@/lib/reporting/report'
import { exporterCSV, telechargerFichier } from '@/lib/reporting/export-csv'
import { exporterClasseurComplet } from '@/lib/reporting/export-excel'
import { construireRapportDocx } from '@/lib/reporting/export-docx'
import { reductionDuDeficit } from '@/lib/analytics/narrative'
import { LIBELLE_SCOPE } from '@/lib/simulation/scenarios'
import { AvantApres, BarresHorizontales } from '../charts'
import { EmptyState, Notice, Panel, fmt, fmtDec, fmtPct } from '../common'
import { DataQualityPanel } from '../data-quality/DataQualityPanel'
import type { PlanningStore } from '../usePlanningState'

export function ReportPage({ store }: { store: PlanningStore }) {
  const {
    diagnostic,
    diagnosticsFiltres,
    noeudCourant,
    enfantsTerritoriaux,
    qualite,
    resultatAffiche,
    fluxTerritorial,
    comparaison,
    perimetre,
    settings,
    dataset,
    faitsPrinceAppliques,
    setPage,
  } = store

  const [exportEnCours, setExportEnCours] = useState<string | null>(null)
  const [erreurExport, setErreurExport] = useState<string | null>(null)

  const rapport = useMemo(() => {
    if (!diagnostic) return null
    return construireRapport({
      diagnostic,
      diagnosticsFiltres,
      arbre: noeudCourant,
      qualite,
      resultat: resultatAffiche,
      comparaison,
      perimetre,
      settings,
      nbEnseignantsLus: dataset?.teachers.length ?? 0,
      donneesDemonstration: dataset?.demonstration ?? false,
      faitsPrince: faitsPrinceAppliques,
    })
  }, [diagnostic, diagnosticsFiltres, noeudCourant, qualite, resultatAffiche, comparaison, perimetre, settings, dataset, faitsPrinceAppliques])

  /** Besoins par région, limités aux territoires qui en ont, pour le graphique du rapport. */
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
        return {
          cle: r.territory.code,
          label: r.territory.nom,
          valeurs: { couverts, restant: r.totals.postesNecessaires - couverts },
        }
      })
  }, [enfantsTerritoriaux, resultatAffiche])

  if (!diagnostic || !rapport) {
    return (
      <EmptyState titre="Aucun rapport disponible" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Le rapport est construit à partir du diagnostic et, quand elle existe, de la simulation sélectionnée.
      </EmptyState>
    )
  }

  const totals = noeudCourant.totals
  const scenarioNom = resultatAffiche ? resultatAffiche.scenarioNom : 'Situation actuelle (aucune simulation)'

  async function exporterExcel() {
    if (!diagnostic) return
    setExportEnCours('excel')
    setErreurExport(null)
    try {
      const octets = await exporterClasseurComplet({
        diagnostic,
        arbre: noeudCourant,
        qualite,
        resultat: resultatAffiche,
        comparaison,
        rapport,
      })
      telechargerFichier(
        octets,
        `rapport-affectation-${settings.anneeScolaire}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
    } catch (err) {
      setErreurExport(err instanceof Error ? err.message : String(err))
    } finally {
      setExportEnCours(null)
    }
  }

  async function exporterWord() {
    if (!rapport) return
    setExportEnCours('word')
    setErreurExport(null)
    try {
      const blob = await construireRapportDocx({
        rapport,
        scenarioNom,
        donneesDemonstration: dataset?.demonstration ?? false,
      })
      telechargerFichier(
        blob,
        `rapport-affectation-${settings.anneeScolaire}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    } catch (err) {
      setErreurExport(err instanceof Error ? err.message : String(err))
    } finally {
      setExportEnCours(null)
    }
  }

  function exporterEcolesCSV() {
    exporterCSV(
      `diagnostic-ecoles-${settings.anneeScolaire}.csv`,
      ['Code', 'Établissement', 'Région', 'Département', 'Commune', 'Classes', "Enseignants État", 'Dotation D', 'Besoin calculé', 'Postes déclarés', 'Excédent mobilisable', 'Élèves', 'Élèves par enseignant État'],
      diagnosticsFiltres.map(d => [
        d.school.id, d.school.nom, d.school.region, d.school.departement, d.school.commune,
        d.nbClasses, d.enseignantsEtat, d.enseignantsMinimumAConserver, d.besoinTheorique,
        d.postesDeclares, d.excedentTheorique, d.school.effectifTotalEleves, d.elevesParEnseignantEtat,
      ]),
    )
  }

  const indicateurs: { label: string; valeur: string }[] = [
    { label: 'Établissements analysés', valeur: fmt(totals.ecolesAnalysees) },
    { label: 'Établissements en déficit', valeur: fmt(totals.ecolesEnDeficit) },
    { label: 'Postes nécessaires', valeur: fmt(totals.postesNecessaires) },
    { label: 'Enseignants redéployables', valeur: fmt(totals.excedentMobilisable) },
    { label: 'Postes couverts par simulation', valeur: resultatAffiche ? fmt(resultatAffiche.postesCouverts) : '—' },
    { label: 'Besoin résiduel', valeur: resultatAffiche ? fmt(resultatAffiche.besoinResiduel) : '—' },
    { label: 'Taux de couverture', valeur: resultatAffiche ? fmtPct(resultatAffiche.tauxCouverture) : '—' },
    { label: 'Élèves par enseignant État', valeur: fmtDec(totals.elevesParEnseignantEtat, 1) },
  ]

  return (
    <div className="stack">
      <div className="no-print stack">
        <Panel
          kicker="Rapport décisionnel"
          title="Générer et exporter"
          hint="Le rapport reprend le périmètre, les filtres et le scénario actuellement sélectionnés."
          actions={
            <>
              <button type="button" className="btn" onClick={() => window.print()}>
                <Printer size={14} aria-hidden="true" /> Imprimer / PDF
              </button>
              <button type="button" className="btn" onClick={exporterEcolesCSV}>
                <Table size={14} aria-hidden="true" /> Écoles (CSV)
              </button>
              <button type="button" className="btn btn-primary" onClick={exporterWord} disabled={exportEnCours === 'word'}>
                {exportEnCours === 'word' ? (
                  <RefreshCw size={14} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={14} aria-hidden="true" />
                )}
                Rapport Word
              </button>
              <button type="button" className="btn" onClick={exporterExcel} disabled={exportEnCours === 'excel'}>
                {exportEnCours === 'excel' ? (
                  <RefreshCw size={14} className="spin" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet size={14} aria-hidden="true" />
                )}
                Classeur Excel complet
              </button>
            </>
          }
        >
          <p className="hint">
            Le rapport Word reprend le document ci-dessous, section par section, avec ses tableaux : il est modifiable avant
            transmission. L’impression produit la même mise en page sans navigation ni filtres, et le navigateur permet de
            l’enregistrer en PDF. Le classeur Excel contient en plus le diagnostic école par école, les agrégats territoriaux,
            les propositions avec leur justification et les contrôles.
          </p>
          {erreurExport && (
            <Notice tone="alert" title="Export impossible.">
              {erreurExport}
            </Notice>
          )}
        </Panel>

        {qualite && (
          <Panel kicker="Contrôle" title="Qualité des données du rapport">
            <DataQualityPanel rapport={qualite} compact />
          </Panel>
        )}
      </div>

      <article className="report">
        {/* Page de garde : identifie sans ambiguïté ce qui a été calculé, sur quel
            périmètre et sous quelles hypothèses de scénario. */}
        <header className="report-cover">
          <div className="report-logos">
            <img className="report-logo" src="/logo-full.png" alt="Logo AlgoPlanR" width={640} height={424} />
            <img
              className="report-logo-partner"
              src="/logo-parec.png"
              alt="Logo du PAREC — Programme d’appui à la réforme de l’éducation au Cameroun"
              width={360}
              height={360}
            />
          </div>
          <p className="report-eyebrow">Rapport d’affectation des enseignants</p>
          <h1 className="report-title">{rapport.perimetre}</h1>
          <p className="report-subtitle">
            Analyse des besoins, répartition territoriale et simulation de scénarios d’affectation
          </p>

          <dl className="report-meta">
            <div>
              <dt>Territoire</dt>
              <dd>{rapport.perimetre}</dd>
            </div>
            <div>
              <dt>Année scolaire</dt>
              <dd>{rapport.anneeScolaire}</dd>
            </div>
            <div>
              <dt>Scénario</dt>
              <dd>
                {scenarioNom}
                {resultatAffiche && ` — périmètre ${LIBELLE_SCOPE[resultatAffiche.scope].toLowerCase()}`}
              </dd>
            </div>
            <div>
              <dt>Établi le</dt>
              <dd>{new Date(rapport.genereLe).toLocaleString('fr-FR')}</dd>
            </div>
          </dl>

          <p className="report-mention">
            Les résultats présentés sont issus d’une simulation d’aide à la décision. Ils ne constituent pas des décisions
            administratives de mutation, d’affectation ou de recrutement.
          </p>
        </header>

        <section className="report-kpi-section">
          <h2>Indicateurs clés</h2>
          <dl className="report-kpi">
            {indicateurs.map(i => (
              <div key={i.label}>
                <dt>{i.label}</dt>
                <dd>{i.valeur}</dd>
              </div>
            ))}
          </dl>
        </section>

        {besoinsParRegion.length > 0 && (
          <section className="report-figure">
            <h2>Besoins par région</h2>
            <BarresHorizontales
              titre="Postes nécessaires par région, part couverte et part restante"
              series={[
                { cle: 'couverts', label: 'Couverts par redéploiement', couleur: 'var(--serie-1)' },
                { cle: 'restant', label: 'Restant à pourvoir', couleur: 'var(--serie-4)', motif: 'hachures' },
              ]}
              donnees={besoinsParRegion}
              uniteValeur="postes"
            />
          </section>
        )}

        {resultatAffiche && (
          <section className="report-figure">
            <h2>Avant / Après simulation</h2>
            <AvantApres
              lignes={[
                {
                  label: 'Établissements en déficit',
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
              <p className="report-highlight">{reductionDuDeficit(resultatAffiche)?.texte}</p>
            )}
            {fluxTerritorial && !fluxTerritorial.autonome && (
              <p>
                Sur ce périmètre, {fmt(fluxTerritorial.enseignantsRecus)} enseignant(s) seraient reçus et{' '}
                {fmt(fluxTerritorial.enseignantsSortants)} cédé(s) à d’autres territoires, soit un solde de{' '}
                {fluxTerritorial.solde > 0 ? '+' : ''}
                {fmt(fluxTerritorial.solde)}.
              </p>
            )}
          </section>
        )}

        {rapport.sections.map(section => (
          <section key={section.titre}>
            <h2>{section.titre}</h2>
            {section.paragraphes.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {section.points && (
              <ul>
                {section.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            {section.tableau && (
              <table>
                <thead>
                  <tr>
                    {section.tableau.entetes.map(e => (
                      <th key={e} scope="col">
                        {e}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.tableau.lignes.map((ligne, i) => (
                    <tr key={i}>
                      {ligne.map((cellule, j) => (
                        <td key={j}>{typeof cellule === 'number' ? cellule.toLocaleString('fr-FR') : cellule}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}

        <footer className="report-footer">
          <p>
            <FileText size={14} aria-hidden="true" /> Document produit localement par ALGOPLANR, à partir des fichiers
            importés sur ce poste. Aucune donnée n’a été transmise à un service externe pour l’établir.
          </p>
        </footer>
      </article>
    </div>
  )
}
