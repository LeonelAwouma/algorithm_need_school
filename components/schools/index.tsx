'use client'

/**
 * Liste des établissements et fiche détaillée (§9).
 *
 * La fiche explique la situation de l'école avec les seules valeurs calculées :
 * aucune justification n'est produite quand la donnée qui la fonderait est
 * absente du fichier.
 */

import { useMemo, useState } from 'react'
import { ArrowLeft, Download, Info } from 'lucide-react'
import type { SchoolDiagnostic } from '@/types/education'
import { NIVEAUX_PRIMAIRE } from '@/types/education'
import { exporterCSV } from '@/lib/reporting/export-csv'
import { LIBELLE_PROXIMITE } from '@/lib/simulation/scoring'
import { DataTable, EmptyState, Notice, Panel, Pill, SearchField, fmt, fmtDec, fmtPct, type Colonne } from '../common'
import { LIBELLE_SEVERITE, LIBELLE_ZONE } from '../layout'
import { SeveritePill } from '../dashboard/OverviewPage'
import type { PlanningStore } from '../usePlanningState'

export function SchoolsPage({ store }: { store: PlanningStore }) {
  const { diagnostic, diagnosticsFiltres, ecoleSelectionnee, setEcoleSelectionnee, ouvrirEcole, setPage } = store
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return diagnosticsFiltres
    return diagnosticsFiltres.filter(d =>
      `${d.school.id} ${d.school.nom} ${d.school.commune} ${d.school.departement} ${d.school.region}`.toLowerCase().includes(q),
    )
  }, [diagnosticsFiltres, recherche])

  if (!diagnostic) {
    return (
      <EmptyState titre="Aucun établissement chargé" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        La liste des établissements provient du fichier importé.
      </EmptyState>
    )
  }

  const selection = ecoleSelectionnee ? diagnostic.bySchoolId[ecoleSelectionnee] : undefined
  if (selection) {
    return <SchoolDetail diagnostic={selection} store={store} onRetour={() => setEcoleSelectionnee(null)} />
  }

  const colonnes: Colonne<SchoolDiagnostic>[] = [
    {
      cle: 'nom',
      entete: 'Établissement',
      rendu: d => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(d.school.id)}>
          <strong>{d.school.nom || d.school.id}</strong>
          <small>
            {d.school.id} · {d.school.commune}
          </small>
        </button>
      ),
      tri: d => d.school.nom,
    },
    { cle: 'territoire', entete: 'Territoire', rendu: d => (<span>{d.school.departement}<small>{d.school.region}</small></span>), tri: d => d.school.region },
    { cle: 'zone', entete: 'Zone', rendu: d => LIBELLE_ZONE[d.school.zone], tri: d => d.school.zone },
    { cle: 'classes', entete: 'Classes', numerique: true, rendu: d => fmt(d.nbClasses), tri: d => d.nbClasses },
    { cle: 'eleves', entete: 'Élèves', numerique: true, rendu: d => fmt(d.school.effectifTotalEleves), tri: d => d.school.effectifTotalEleves ?? -1 },
    { cle: 'ens', entete: 'Enseignants État', numerique: true, rendu: d => fmt(d.enseignantsEtat), tri: d => d.enseignantsEtat },
    { cle: 'besoin', entete: 'Déficit', numerique: true, rendu: d => fmt(d.besoinTheorique), tri: d => d.besoinTheorique },
    { cle: 'excedent', entete: 'Excédent', numerique: true, rendu: d => fmt(d.excedentTheorique), tri: d => d.excedentTheorique },
    { cle: 'pression', entete: 'Élèves / ens. État', numerique: true, rendu: d => fmtDec(d.elevesParEnseignantEtat, 1), tri: d => d.elevesParEnseignantEtat ?? -1 },
    { cle: 'situation', entete: 'Situation', rendu: d => <SeveritePill severite={d.severite} /> },
  ]

  return (
    <div className="stack">
      <div className="filter-bar">
        <SearchField value={recherche} onChange={setRecherche} label="Rechercher un établissement" placeholder="Nom, code, commune, département…" />
        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              exporterCSV(
                'etablissements.csv',
                ['Code', 'Établissement', 'Région', 'Département', 'Commune', 'Zone', 'Classes', 'Élèves', "Enseignants État", 'Minimum à conserver', 'Déficit', 'Excédent', 'Postes déclarés', 'Élèves par enseignant État', 'Situation'],
                lignes.map(d => [
                  d.school.id, d.school.nom, d.school.region, d.school.departement, d.school.commune, LIBELLE_ZONE[d.school.zone],
                  d.nbClasses, d.school.effectifTotalEleves, d.enseignantsEtat, d.enseignantsMinimumAConserver,
                  d.besoinTheorique, d.excedentTheorique, d.postesDeclares, d.elevesParEnseignantEtat, LIBELLE_SEVERITE[d.severite],
                ]),
              )
            }
          >
            <Download size={13} aria-hidden="true" /> Exporter la liste (CSV)
          </button>
        </div>
      </div>

      <Panel kicker="Établissements" title={`${fmt(lignes.length)} établissements`} flush>
        <DataTable
          lignes={lignes}
          colonnes={colonnes}
          cle={d => d.school.id}
          legende="Liste des établissements du périmètre"
          messageVide="Aucun établissement ne correspond à cette recherche."
        />
      </Panel>
    </div>
  )
}

export function SchoolDetail({
  diagnostic: d,
  store,
  onRetour,
}: {
  diagnostic: SchoolDiagnostic
  store: PlanningStore
  onRetour: () => void
}) {
  const { resultatComplet, settings } = store

  const mouvements = useMemo(() => {
    if (!resultatComplet) return { arrivees: [], departs: [] }
    return {
      arrivees: resultatComplet.assignments.filter(a => a.schoolDestinationId === d.school.id),
      departs: resultatComplet.assignments.filter(a => a.schoolOrigineId === d.school.id),
    }
  }, [resultatComplet, d.school.id])

  const niveaux = NIVEAUX_PRIMAIRE.filter(n => d.school.effectifParNiveau[n] != null)
  const postesRestants = resultatComplet ? resultatComplet.uncoveredPosts.filter(p => p.schoolId === d.school.id).length : null

  return (
    <div className="stack">
      <button type="button" className="btn btn-sm" onClick={onRetour} style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={13} aria-hidden="true" /> Retour à la liste
      </button>

      <Panel>
        <div className="detail-head">
          <div className="detail-title">
            <p className="eyebrow">{d.school.typeEtab || 'Établissement'} · {d.school.id}</p>
            <h2>{d.school.nom || d.school.id}</h2>
            <p className="detail-path">
              {d.school.region || '—'} › {d.school.departement || '—'} › {d.school.commune || '—'}
            </p>
          </div>
          <div className="topbar-actions">
            <SeveritePill severite={d.severite} />
            <Pill tone="neutral">{LIBELLE_ZONE[d.school.zone]}</Pill>
            {d.school.classesMultigrades > 0 && <Pill tone="warn">{d.school.classesMultigrades} classe(s) multigrade(s)</Pill>}
            {d.school.prioriteLocale > 0 && <Pill tone="info">Priorité locale {d.school.prioriteLocale}</Pill>}
          </div>
        </div>

        <dl className="def-grid" style={{ marginTop: 16 }}>
          <div>
            <dt>Classes</dt>
            <dd>{fmt(d.nbClasses)}</dd>
          </div>
          <div>
            <dt>Salles de classe</dt>
            <dd>{d.school.nbSallesClasse == null ? 'Non renseigné' : fmt(d.school.nbSallesClasse)}</dd>
          </div>
          <div>
            <dt>Élèves</dt>
            <dd>{d.school.effectifTotalEleves == null ? 'Non renseigné' : fmt(d.school.effectifTotalEleves)}</dd>
          </div>
          <div>
            <dt>Dont filles</dt>
            <dd>{d.school.effectifFilles == null ? 'Non renseigné' : fmt(d.school.effectifFilles)}</dd>
          </div>
          <div>
            <dt>Enseignants payés par l’État</dt>
            <dd>{fmt(d.enseignantsEtat)}</dd>
          </div>
          <div>
            <dt>Autres enseignants</dt>
            <dd>{d.school.nbAutresEnseignants == null ? 'Non renseigné' : fmt(d.school.nbAutresEnseignants)}</dd>
          </div>
          <div>
            <dt>Élèves par enseignant</dt>
            <dd>{fmtDec(d.elevesParEnseignant, 1)}</dd>
          </div>
          <div>
            <dt>Élèves par enseignant État</dt>
            <dd>{fmtDec(d.elevesParEnseignantEtat, 1)}</dd>
          </div>
          <div>
            <dt>Élèves par classe</dt>
            <dd>{fmtDec(d.elevesParClasse, 1)}</dd>
          </div>
          <div>
            <dt>Postes ouverts déclarés</dt>
            <dd>{d.postesDeclares == null ? 'Non renseigné' : fmt(d.postesDeclares)}</dd>
          </div>
          <div>
            <dt>Besoin calculé</dt>
            <dd>{fmt(d.besoinTheorique)}</dd>
          </div>
          <div>
            <dt>Excédent mobilisable</dt>
            <dd>{fmt(d.excedentTheorique)}</dd>
          </div>
        </dl>

        {niveaux.length > 0 && (
          <details className="advanced" style={{ marginTop: 14 }}>
            <summary>Effectifs par niveau</summary>
            <dl className="def-grid" style={{ marginTop: 8 }}>
              {niveaux.map(n => (
                <div key={n}>
                  <dt>{n}</dt>
                  <dd>{fmt(d.school.effectifParNiveau[n] ?? null)}</dd>
                </div>
              ))}
              <div>
                <dt>Effectif moyen par niveau</dt>
                <dd>{fmtDec(d.effectifMoyenParNiveau, 1)}</dd>
              </div>
            </dl>
          </details>
        )}
      </Panel>

      <div className="grid-2">
        <Panel kicker="Diagnostic" title="Situation">
          <div className="situation-block">
            <div className="situation-line">
              <span>Enseignants minimum nécessaires</span>
              <strong>{fmt(Math.round(d.nbClasses * settings.normeEncadrement.enseignantsParClasse))}</strong>
            </div>
            <div className="situation-line">
              <span>Enseignants présents (payés par l’État)</span>
              <strong>{fmt(d.enseignantsEtat)}</strong>
            </div>
            <div className="situation-line">
              <span>Minimum à conserver en cas de redéploiement</span>
              <strong>{fmt(d.enseignantsMinimumAConserver)}</strong>
            </div>
            <div className="situation-line">
              <span>{d.besoinTheorique > 0 ? 'Déficit' : 'Excédent mobilisable maximum'}</span>
              <strong>{fmt(d.besoinTheorique > 0 ? d.besoinTheorique : d.excedentTheorique)}</strong>
            </div>
          </div>

          {d.ecartBesoinDeclare != null && d.ecartBesoinDeclare !== 0 && (
            <Notice tone="neutral" title="Écart avec la déclaration.">
              {fmt(d.postesDeclares)} poste(s) déclaré(s) dans le fichier source pour {fmt(d.besoinTheorique)} poste(s)
              calculé(s). Les deux valeurs sont conservées telles quelles.
            </Notice>
          )}

          {d.pressionPedagogique != null && (
            <p className="hint" style={{ marginTop: 10 }}>
              Pression pédagogique : {fmtPct(d.pressionPedagogique)} de la cible configurée ({settings.referentielEleves.cible} élèves par
              enseignant).
            </p>
          )}
        </Panel>

        <Panel kicker="Explication" title="Pourquoi cette école apparaît-elle dans les priorités ?">
          {d.raisons.length === 0 ? (
            <p className="hint">
              Cette école ne présente ni déficit, ni signal particulier au regard des données disponibles. Elle n’apparaît pas
              dans les priorités.
            </p>
          ) : (
            <ul className="reason-list">
              {d.raisons.map(r => (
                <li key={r.code}>
                  <Info size={15} aria-hidden="true" />
                  <span>{r.texte}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {resultatComplet && (
        <Panel
          kicker="Simulation"
          title={`Mouvements proposés — ${resultatComplet.scenarioNom}`}
          hint="Ces propositions sont issues d’une simulation et nécessitent une validation administrative."
        >
          <div className="grid-2">
            <div>
              <h3>Arrivées proposées ({fmt(mouvements.arrivees.length)})</h3>
              {mouvements.arrivees.length === 0 ? (
                <p className="hint">Aucune arrivée proposée dans ce scénario.</p>
              ) : (
                <ul className="reason-list" style={{ marginTop: 8 }}>
                  {mouvements.arrivees.slice(0, 10).map(a => (
                    <li key={a.postId}>
                      <span>
                        <strong style={{ color: 'var(--ink)' }}>
                          {a.nomEns} {a.prenomEns}
                        </strong>{' '}
                        depuis {a.nomEtabOrigine} ({LIBELLE_PROXIMITE[a.niveauProximite].toLowerCase()}) — score {a.score}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {postesRestants != null && postesRestants > 0 && (
                <p className="hint" style={{ marginTop: 8 }}>
                  {fmt(postesRestants)} poste(s) resteraient non pourvu(s) dans ce scénario.
                </p>
              )}
            </div>
            <div>
              <h3>Départs proposés ({fmt(mouvements.departs.length)})</h3>
              {mouvements.departs.length === 0 ? (
                <p className="hint">Aucun départ proposé dans ce scénario.</p>
              ) : (
                <ul className="reason-list" style={{ marginTop: 8 }}>
                  {mouvements.departs.map(a => (
                    <li key={a.postId}>
                      <span>
                        <strong style={{ color: 'var(--ink)' }}>
                          {a.nomEns} {a.prenomEns}
                        </strong>{' '}
                        vers {a.nomEtabDestination} ({a.communeDestination}) — barème {a.bareme}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint" style={{ marginTop: 8 }}>
                Plafond de départs pour cet établissement : {fmt(d.excedentTheorique)} enseignant(s).
              </p>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
