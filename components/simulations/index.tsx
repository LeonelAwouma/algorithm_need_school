'use client'

/**
 * Section Simulations : création et exécution de scénarios, comparaison des
 * conséquences, et explication de chaque proposition.
 *
 * L'application ne désigne jamais un « meilleur scénario ». Elle montre ce que
 * chaque jeu de règles produirait ; l'arbitrage reste humain.
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Play, RefreshCw, X } from 'lucide-react'
import type { GeographicScope, ProposedAssignment, ProximityLevel, SimulationResult } from '@/types/simulation'
import { cloneSettings } from '@/lib/config/settings'
import { reductionDuDeficit } from '@/lib/analytics/narrative'
import { LIBELLE_PROXIMITE } from '@/lib/simulation/scoring'
import {
  AVERTISSEMENT_SCENARIO_ETENDU,
  DESCRIPTION_SCOPE,
  LIBELLE_SCOPE,
  SCENARIO_PRESETS,
  creerScenarioDepuisPreset,
  creerScenarioPersonnalise,
} from '@/lib/simulation/scenarios'
import { AvantApres, CouvertureParScenario } from '../charts'
import { FluxPanel } from './FluxPanel'
import { DataTable, Delta, EmptyState, Notice, Panel, Pill, fmt, fmtPct, type Colonne } from '../common'
import type { PlanningStore } from '../usePlanningState'

const NIVEAUX_PROXIMITE: ProximityLevel[] = ['meme_commune', 'meme_departement', 'meme_region', 'hors_region']

/** Nombre de propositions de chaque périmètre : « Même commune », « Même département », etc. */
function repartitionProximite(assignments: ProposedAssignment[]): Record<ProximityLevel, number> {
  const compte: Record<ProximityLevel, number> = { meme_commune: 0, meme_departement: 0, meme_region: 0, hors_region: 0 }
  for (const a of assignments) compte[a.niveauProximite]++
  return compte
}

/** Explication de l'ordre des mouvements, selon le périmètre du scénario. */
const EXPLICATION_PERIMETRE: Record<GeographicScope, string> = {
  commune: 'Chaque enseignant reste dans sa commune : toutes les propositions sont des mouvements internes à la commune.',
  departement:
    'Les mouvements dans la même commune sont traités en premier, puis ceux qui traversent les communes du département. Utilisez le filtre pour isoler ces derniers.',
  etendu:
    'Les mouvements dans la même commune sont traités en premier, puis dans le département, puis au-delà. Utilisez le filtre pour isoler chaque périmètre.',
}

export function SimulationsPage({ store }: { store: PlanningStore }) {
  const {
    diagnostic,
    settings,
    scenarios,
    resultats,
    scenarioActif,
    setScenarioActif,
    executerScenario,
    calculerScenariosDeBase,
    calculEnCours,
    resultatAffiche,
    setPage,
    mode,
  } = store

  const [nom, setNom] = useState('')
  const [scope, setScope] = useState<GeographicScope>('departement')
  const [ancienneteMin, setAncienneteMin] = useState(settings.phases.anciennetePosteMinimaleAns)
  const [ageMax, setAgeMax] = useState(settings.phases.ageMaximalMobilisableAns)
  const [poidsProximite, setPoidsProximite] = useState(settings.scoring.poidsScorePoste.proximite)
  const [prioriteRurale, setPrioriteRurale] = useState(settings.phases.prioriteZonesRurales)
  const [prioriteMultigrade, setPrioriteMultigrade] = useState(settings.phases.prioriteClassesMultigrades)
  const [minimumMode, setMinimumMode] = useState(settings.minimumAConserver.mode)
  const [minimumRatio, setMinimumRatio] = useState(settings.minimumAConserver.ratio)

  if (!diagnostic) {
    return (
      <EmptyState titre="Aucune donnée à simuler" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Les simulations s’appuient sur le diagnostic, qui se calcule dès l’import des fichiers.
      </EmptyState>
    )
  }

  function lancerPersonnalise() {
    const parametres = cloneSettings(settings)
    parametres.phases.anciennetePosteMinimaleAns = ancienneteMin
    parametres.phases.ageMaximalMobilisableAns = ageMax
    parametres.phases.prioriteZonesRurales = prioriteRurale
    parametres.phases.prioriteClassesMultigrades = prioriteMultigrade
    parametres.scoring.poidsScorePoste.proximite = poidsProximite
    parametres.minimumAConserver = { ...parametres.minimumAConserver, mode: minimumMode, ratio: minimumRatio }

    const scenario = creerScenarioPersonnalise(
      nom,
      `Périmètre ${LIBELLE_SCOPE[scope].toLowerCase()}, ancienneté minimale ${ancienneteMin} an(s), poids de proximité ${poidsProximite}.`,
      scope,
      parametres,
    )
    const resultat = executerScenario(scenario)
    if (resultat) setScenarioActif(scenario.id)
  }

  const calcules = scenarios.filter(s => resultats[s.id])

  return (
    <div className="stack">
      <Notice tone="info" title="Ce que fait une simulation.">
        Elle propose, poste par poste, quel enseignant du vivier mobilisable pourrait le couvrir. Elle ne modifie aucune
        donnée et ne constitue pas une décision d’affectation.
      </Notice>

      <Panel
        kicker="Scénarios prédéfinis"
        title="Modèles disponibles"
        hint="Un scénario n’est proposé que si les données permettent d’appliquer réellement sa règle."
        actions={
          <button type="button" className="btn btn-primary" onClick={calculerScenariosDeBase} disabled={calculEnCours}>
            <RefreshCw size={14} className={calculEnCours ? 'spin' : undefined} aria-hidden="true" /> Recalculer les trois scénarios
            géographiques
          </button>
        }
      >
        <div className="upload-cards">
          {SCENARIO_PRESETS.map(preset => {
            const disponibilite = preset.verifierDisponibilite(diagnostic.schools)
            return (
              <div className="upload-card" key={preset.cle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <h3>{preset.nom}</h3>
                  <Pill tone={disponibilite.disponible ? 'ok' : 'neutral'}>
                    {disponibilite.disponible ? 'Disponible' : 'Indisponible'}
                  </Pill>
                </div>
                <p className="hint">{preset.description}</p>
                {!disponibilite.disponible && (
                  <p className="hint" style={{ color: 'var(--warn)' }}>
                    <AlertTriangle size={13} aria-hidden="true" /> {disponibilite.motif}
                  </p>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={!disponibilite.disponible || calculEnCours}
                  onClick={() => {
                    const scenario = creerScenarioDepuisPreset(preset, settings)
                    const resultat = executerScenario(scenario)
                    if (resultat) setScenarioActif(scenario.id)
                  }}
                >
                  <Play size={14} aria-hidden="true" /> Exécuter ce scénario
                </button>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel
        kicker="Nouveau scénario"
        title="Construire un scénario personnalisé"
        hint="Modifiez le périmètre et les règles, puis exécutez. Les paramètres retenus sont figés dans le scénario : son résultat reste reproductible."
      >
        <div className="param-grid">
          <div className="field">
            <label htmlFor="sc-nom">Nom du scénario</label>
            <input id="sc-nom" type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex. : priorité rurale, département" />
          </div>
          <div className="field">
            <label htmlFor="sc-scope">Rayon territorial</label>
            <select id="sc-scope" value={scope} onChange={e => setScope(e.target.value as GeographicScope)}>
              <option value="commune">Commune — mouvements internes à la commune</option>
              <option value="departement">Département — mouvements internes au département</option>
              <option value="etendu">Étendu — aucune contrainte géographique</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sc-anc">Ancienneté minimale au poste (ans)</label>
            <input id="sc-anc" type="number" min={0} max={40} value={ancienneteMin} onChange={e => setAncienneteMin(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="sc-age">Âge maximal mobilisable (0 = sans limite)</label>
            <input id="sc-age" type="number" min={0} max={70} value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="sc-prox">Poids de la proximité dans le score</label>
            <input id="sc-prox" type="number" min={0} max={1} step={0.05} value={poidsProximite} onChange={e => setPoidsProximite(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="sc-min">Minimum d’enseignants à conserver</label>
            <select id="sc-min" value={minimumMode} onChange={e => setMinimumMode(e.target.value as typeof minimumMode)}>
              <option value="nbClasses">Un enseignant par classe</option>
              <option value="ratioClasses">Proportion du nombre de classes</option>
              <option value="valeurFixe">Valeur fixe par établissement</option>
            </select>
          </div>
          {minimumMode === 'ratioClasses' && (
            <div className="field">
              <label htmlFor="sc-ratio">Proportion appliquée</label>
              <input id="sc-ratio" type="number" min={0.1} max={2} step={0.05} value={minimumRatio} onChange={e => setMinimumRatio(Number(e.target.value))} />
            </div>
          )}
        </div>

        <div className="switch-list" style={{ marginTop: 14 }}>
          <label className="switch-row">
            <input type="checkbox" checked={prioriteRurale} onChange={e => setPrioriteRurale(e.target.checked)} />
            <span>
              <b>Priorité aux zones rurales</b>
              <span>Les postes situés en zone rurale reçoivent un bonus explicite dans le score de compatibilité.</span>
            </span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={prioriteMultigrade} onChange={e => setPrioriteMultigrade(e.target.checked)} />
            <span>
              <b>Priorité aux classes multigrades</b>
              <span>Les établissements déclarant des classes multigrades reçoivent un bonus explicite.</span>
            </span>
          </label>
        </div>

        {scope === 'etendu' && (
          <Notice tone="warn" title="Scénario sans contrainte géographique.">
            {AVERTISSEMENT_SCENARIO_ETENDU}
          </Notice>
        )}

        <div className="topbar-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={lancerPersonnalise} disabled={calculEnCours}>
            <Play size={14} aria-hidden="true" /> Exécuter ce scénario
          </button>
        </div>
      </Panel>

      <Panel kicker="Résultats" title={`${fmt(calcules.length)} scénario(s) calculé(s)`} hint="Sélectionnez le scénario à afficher dans tout le reste de l’application.">
        {calcules.length === 0 ? (
          <p className="hint">Aucun scénario n’a encore été exécuté.</p>
        ) : (
          <table className="compare-table">
            <thead>
              <tr>
                <th>Scénario</th>
                <th>Périmètre</th>
                <th className="num">Postes nécessaires</th>
                <th className="num">Couverts</th>
                <th className="num">Résiduel</th>
                <th className="num">Couverture</th>
                <th>Mouvements proposés</th>
                <th>Contrôles</th>
                <th>Affiché</th>
              </tr>
            </thead>
            <tbody>
              {calcules.map(s => {
                const r = resultats[s.id]
                const controles = r.invariants.filter(i => !i.ok).length
                const parNiveau = repartitionProximite(r.assignments)
                return (
                  <tr key={s.id} className={scenarioActif === s.id ? 'ligne-active' : undefined}>
                    <th scope="row">{s.nom}</th>
                    <td>{LIBELLE_SCOPE[s.scope]}</td>
                    <td className="num">{fmt(r.besoinInitial)}</td>
                    <td className="num">{fmt(r.postesCouverts)}</td>
                    <td className="num">{fmt(r.besoinResiduel)}</td>
                    <td className="num">{fmtPct(r.tauxCouverture)}</td>
                    <td>
                      {r.assignments.length === 0
                        ? '—'
                        : NIVEAUX_PROXIMITE.filter(n => parNiveau[n] > 0)
                            .map(n => `${fmt(parNiveau[n])} ${LIBELLE_PROXIMITE[n].toLowerCase()}`)
                            .join(' · ')}
                    </td>
                    <td>
                      {controles === 0 ? (
                        <Pill tone="ok">
                          <Check size={11} aria-hidden="true" /> Conformes
                        </Pill>
                      ) : (
                        <Pill tone="alert">
                          <X size={11} aria-hidden="true" /> {controles} écart(s)
                        </Pill>
                      )}
                    </td>
                    <td>
                      {scenarioActif === s.id ? (
                        <Pill tone="info">Affiché</Pill>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => setScenarioActif(s.id)}>
                          Afficher
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {resultatAffiche && <PropositionsPanel key={resultatAffiche.scenarioId} resultat={resultatAffiche} analyste={mode === 'analyste'} />}
    </div>
  )
}

/** Liste des propositions avec leur justification détaillée (§15). */
export function PropositionsPanel({ resultat, analyste }: { resultat: SimulationResult; analyste: boolean }) {
  const [selection, setSelection] = useState<ProposedAssignment | null>(null)
  const [filtre, setFiltre] = useState<ProximityLevel | 'toutes'>('toutes')

  const parNiveau = useMemo(() => repartitionProximite(resultat.assignments), [resultat.assignments])
  const niveauxPresents = NIVEAUX_PROXIMITE.filter(n => parNiveau[n] > 0)
  const lignes = useMemo(
    () => (filtre === 'toutes' ? resultat.assignments : resultat.assignments.filter(a => a.niveauProximite === filtre)),
    [resultat.assignments, filtre],
  )

  const colonnes: Colonne<ProposedAssignment>[] = [
    {
      cle: 'ens',
      entete: 'Enseignant',
      rendu: a => (
        <span>
          <strong>
            {a.nomEns} {a.prenomEns}
          </strong>
          <small>{a.teacherId}</small>
        </span>
      ),
      tri: a => a.nomEns,
    },
    { cle: 'origine', entete: 'Origine', rendu: a => (<span>{a.nomEtabOrigine}<small>{a.communeOrigine}</small></span>), tri: a => a.nomEtabOrigine },
    { cle: 'destination', entete: 'Destination', rendu: a => (<span><strong>{a.nomEtabDestination}</strong><small>{a.communeDestination} · {a.departementDestination}</small></span>), tri: a => a.nomEtabDestination },
    { cle: 'perimetre', entete: 'Périmètre', rendu: a => <Pill tone={a.niveauProximite === 'meme_commune' ? 'ok' : a.niveauProximite === 'meme_departement' ? 'info' : 'warn'}>{LIBELLE_PROXIMITE[a.niveauProximite]}</Pill>, tri: a => a.niveauProximite },
    { cle: 'score', entete: 'Compatibilité', numerique: true, rendu: a => fmt(a.score), tri: a => a.score },
    {
      cle: 'explication',
      entete: '',
      rendu: a => (
        <button type="button" className="row-action" onClick={() => setSelection(a)}>
          Pourquoi ?
        </button>
      ),
    },
  ]

  if (analyste) {
    colonnes.splice(4, 0, { cle: 'phase', entete: 'Phase', rendu: a => a.phase, tri: a => a.phase })
    colonnes.splice(5, 0, { cle: 'bareme', entete: 'Barème', numerique: true, rendu: a => fmt(a.bareme), tri: a => a.bareme })
  }

  return (
    <>
      <Panel
        kicker="Propositions"
        title={`${fmt(resultat.assignments.length)} propositions d’affectation — ${resultat.scenarioNom}`}
        hint={`Périmètre du scénario : ${LIBELLE_SCOPE[resultat.scope].toLowerCase()}. ${EXPLICATION_PERIMETRE[resultat.scope]} Ces propositions proviennent d’une simulation et nécessitent une validation administrative.`}
        flush
      >
        {niveauxPresents.length > 1 && (
          <div className="filtre-proximite no-print">
            <span id="filtre-proximite-label">Afficher</span>
            <div className="mode-switch" role="group" aria-labelledby="filtre-proximite-label">
              <button type="button" aria-pressed={filtre === 'toutes'} onClick={() => setFiltre('toutes')}>
                Toutes ({fmt(resultat.assignments.length)})
              </button>
              {niveauxPresents.map(n => (
                <button key={n} type="button" aria-pressed={filtre === n} onClick={() => setFiltre(n)}>
                  {LIBELLE_PROXIMITE[n]} ({fmt(parNiveau[n])})
                </button>
              ))}
            </div>
          </div>
        )}
        <DataTable
          key={filtre}
          lignes={lignes}
          colonnes={colonnes}
          cle={a => a.postId}
          legende="Propositions d’affectation issues de la simulation"
          messageVide="Aucune proposition n’a pu être formulée dans ce scénario."
        />
      </Panel>

      {selection && (
        <Panel
          kicker="Explication"
          title="Pourquoi cette proposition ?"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setSelection(null)}>
              <X size={13} aria-hidden="true" /> Fermer
            </button>
          }
        >
          <p style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>
            {selection.nomEns} {selection.prenomEns}
          </p>
          <p className="hint" style={{ marginBottom: 14 }}>
            {selection.nomEtabOrigine} ({selection.communeOrigine}) → {selection.nomEtabDestination} ({selection.communeDestination})
            · {LIBELLE_PROXIMITE[selection.niveauProximite]}
          </p>

          <table className="compare-table">
            <thead>
              <tr>
                <th>Composante réellement utilisée dans le calcul</th>
                <th className="num">Valeur</th>
                <th className="num">Poids</th>
                <th className="num">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {selection.breakdown.components.map((c, i) => (
                <tr key={`${c.label}-${i}`}>
                  <th scope="row" style={{ fontWeight: 500 }}>
                    {c.label}
                  </th>
                  <td className="num">{c.valeur.toLocaleString('fr-FR')}</td>
                  <td className="num">{c.poids}</td>
                  <td className="num">{c.contribution.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Score de compatibilité</th>
                <td className="num" colSpan={3}>
                  <strong>{selection.breakdown.total.toLocaleString('fr-FR')}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <Notice tone="warn" title="Statut de cette proposition.">
            Cette proposition provient d’une simulation et nécessite une validation administrative.
          </Notice>
        </Panel>
      )}
    </>
  )
}

export function ComparisonPage({ store }: { store: PlanningStore }) {
  const { comparaison, resultatAffiche, arbreFiltre, scenarios, resultats, scenarioActif, setPage, diagnostic, fluxTerritorial, perimetre, ouvrirEcole } = store

  const tousResultats = useMemo(() => {
    const geo = comparaison
    const autres = scenarios
      .filter(s => !s.id.startsWith('geo-') && resultats[s.id])
      .map(s => resultats[s.id])
    return [...geo, ...autres]
  }, [comparaison, scenarios, resultats])

  if (!diagnostic) {
    return (
      <EmptyState titre="Aucune donnée à comparer" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        La comparaison de scénarios nécessite un diagnostic calculé.
      </EmptyState>
    )
  }

  if (tousResultats.length === 0) {
    return (
      <EmptyState titre="Aucun scénario calculé" action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}>
        Exécutez au moins un scénario pour comparer les conséquences de chaque jeu de règles.
      </EmptyState>
    )
  }

  const besoinActuel = arbreFiltre.totals.postesNecessaires
  const lignesComparaison: { label: string; actuel: string; valeur: (r: SimulationResult) => string }[] = [
    { label: 'Postes nécessaires', actuel: fmt(besoinActuel), valeur: r => fmt(r.besoinInitial) },
    { label: 'Postes couverts', actuel: '0', valeur: r => fmt(r.postesCouverts) },
    { label: 'Enseignants déplacés', actuel: '0', valeur: r => fmt(r.enseignantsDeplaces) },
    { label: 'Écoles améliorées', actuel: '0', valeur: r => fmt(r.ecolesBeneficiaires) },
    { label: 'Écoles sources', actuel: '0', valeur: r => fmt(r.ecolesSources) },
    { label: 'Besoin résiduel', actuel: fmt(besoinActuel), valeur: r => fmt(r.besoinResiduel) },
    { label: 'Taux de couverture', actuel: '0 %', valeur: r => fmtPct(r.tauxCouverture) },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Comparer n’est pas classer.">
        Ce tableau présente les conséquences de chaque scénario. L’application ne désigne aucun scénario comme préférable :
        l’arbitrage relève d’une décision humaine.
      </Notice>

      <Panel kicker="Comparaison" title="Conséquences par scénario">
        <div className="table-scroll" style={{ maxHeight: 'none' }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Indicateur</th>
                <th className="num">Situation actuelle</th>
                {tousResultats.map(r => (
                  <th key={r.scenarioId} className="num">
                    {r.scenarioNom}
                    {scenarioActif === r.scenarioId && (
                      <>
                        {' '}
                        <Pill tone="info">Affiché</Pill>
                      </>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignesComparaison.map(l => (
                <tr key={l.label}>
                  <th scope="row">{l.label}</th>
                  <td className="num">{l.actuel}</td>
                  {tousResultats.map(r => (
                    <td key={r.scenarioId} className="num">
                      {l.valeur(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {fluxTerritorial && resultatAffiche && (
        <FluxPanel
          flux={fluxTerritorial}
          perimetre={perimetre}
          scenarioNom={resultatAffiche.scenarioNom}
          onOuvrirEcole={ouvrirEcole}
        />
      )}

      <Panel kicker="Couverture" title="Part des besoins couverte par scénario">
        <CouvertureParScenario
          scenarios={tousResultats.map(r => ({
            cle: r.scenarioId,
            label: r.scenarioNom,
            couverts: r.postesCouverts,
            residuel: r.besoinResiduel,
            taux: r.tauxCouverture,
          }))}
        />
      </Panel>

      {resultatAffiche && (
        <>
          <Panel kicker="Avant / Après" title={`Effet du scénario « ${resultatAffiche.scenarioNom} »`}>
            <AvantApres
              lignes={[
                {
                  label: 'Écoles en déficit',
                  avant: resultatAffiche.before.ecolesEnDeficit,
                  apres: resultatAffiche.after.ecolesEnDeficit,
                  rendu: <Delta avant={resultatAffiche.before.ecolesEnDeficit} apres={resultatAffiche.after.ecolesEnDeficit} />,
                },
                {
                  label: 'Postes vacants',
                  avant: resultatAffiche.before.postesVacants,
                  apres: resultatAffiche.after.postesVacants,
                  rendu: <Delta avant={resultatAffiche.before.postesVacants} apres={resultatAffiche.after.postesVacants} />,
                },
                {
                  label: 'Déficit total',
                  avant: resultatAffiche.before.deficitTotal,
                  apres: resultatAffiche.after.deficitTotal,
                  rendu: <Delta avant={resultatAffiche.before.deficitTotal} apres={resultatAffiche.after.deficitTotal} />,
                },
              ]}
            />
            {reductionDuDeficit(resultatAffiche) && (
              <p style={{ marginTop: 14, fontSize: 15, fontWeight: 650 }}>{reductionDuDeficit(resultatAffiche)?.texte}</p>
            )}
            {resultatAffiche.before.pressionMoyenne != null && (
              <p className="hint" style={{ marginTop: 8 }}>
                Pression moyenne élèves par enseignant État : {resultatAffiche.before.pressionMoyenne.toLocaleString('fr-FR')} avant,{' '}
                {resultatAffiche.after.pressionMoyenne?.toLocaleString('fr-FR') ?? '—'} après.
              </p>
            )}
          </Panel>

          <div className="grid-2">
            <Panel kicker="Répartition" title="Déficit par région après simulation">
              {resultatAffiche.after.parRegion.length === 0 ? (
                <p className="hint">Aucun déficit résiduel sur ce périmètre.</p>
              ) : (
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Région</th>
                      <th className="num">Avant</th>
                      <th className="num">Après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultatAffiche.before.parRegion.map(avant => {
                      const apres = resultatAffiche.after.parRegion.find(r => r.region === avant.region)?.deficit ?? 0
                      return (
                        <tr key={avant.region}>
                          <th scope="row">{avant.region}</th>
                          <td className="num">{fmt(avant.deficit)}</td>
                          <td className="num">{fmt(apres)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel kicker="Contrôles" title="Vérifications métier">
              <ul className="check-list">
                {resultatAffiche.invariants.map(i => (
                  <li key={i.code} className={i.ok ? 'check-ok' : 'check-alert'}>
                    {i.ok ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                    <span>
                      <strong style={{ color: 'var(--ink)' }}>{i.label}</strong>
                      <span className="hint" style={{ display: 'block' }}>
                        {i.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

/** Petit bandeau réutilisable rappelant le périmètre d'un scénario. */
export function RappelScope({ scope }: { scope: GeographicScope }) {
  return (
    <p className="hint">
      <strong>{LIBELLE_SCOPE[scope]}</strong> — {DESCRIPTION_SCOPE[scope]}
    </p>
  )
}

