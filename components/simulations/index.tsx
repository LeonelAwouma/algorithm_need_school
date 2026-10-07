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
import type { GeographicScope, OrdreExamenVoeux, ProposedAssignment, ProximityLevel, SimulationResult } from '@/types/simulation'
import { cloneSettings } from '@/lib/config/settings'
import { reductionDuDeficit } from '@/lib/analytics/narrative'
import { LIBELLE_PROXIMITE } from '@/lib/simulation/scoring'
import { LIBELLE_NATURE, LIBELLE_STATUT_PROPOSITION } from '@/lib/simulation/libelles'
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

const NIVEAUX_PROXIMITE: ProximityLevel[] = ['meme_commune', 'meme_iaeb', 'meme_departement', 'meme_region', 'hors_region']

/** Nombre de propositions de chaque périmètre : « Même commune », « Même département », etc. */
function repartitionProximite(assignments: ProposedAssignment[]): Record<ProximityLevel, number> {
  const compte: Record<ProximityLevel, number> = { meme_commune: 0, meme_iaeb: 0, meme_departement: 0, meme_region: 0, hors_region: 0 }
  for (const a of assignments) compte[a.niveauProximite]++
  return compte
}

/** Explication de l'ordre des mouvements, selon le périmètre du scénario. */
const EXPLICATION_PERIMETRE: Record<GeographicScope, string> = {
  commune: 'Chaque enseignant reste dans sa commune : vœux, solutions proches et redéploiements obligatoires y sont limités.',
  departement:
    'Les vœux sont satisfaits par acceptation différée, puis les demandes non satisfaites reçoivent la solution la plus proche, puis les écoles restées non couvertes un redéploiement obligatoire, sans quitter le département.',
  etendu:
    'Niveau régional d’abord, puis niveau central pour les vœux interrégionaux et les besoins qu’aucune école de la région ne peut couvrir.',
}

/** Ce que signifie la proposition, selon sa nature (référentiel §3.4 à §3.10). */
const EXPLICATION_NATURE: Record<ProposedAssignment['nature'], string> = {
  voeu: "Vœu satisfait par l'acceptation différée : l'école a retenu les candidats de plus fort score S = A + Z + B, puis, à score égal, la plus grande ancienneté générale, l'âge et le rang de tirage.",
  hors_voeux: "Aucun vœu n'a pu être satisfait : poste ouvert le plus proche des écoles demandées, hors zone rouge, soumis à l'accord de l'enseignant ou à la décision de la commission.",
  obligatoire: "École restée non couverte après les vœux et les solutions proches : un maître de l'école excédentaire la plus proche du même sous-système est proposé, dans l'ordre du barème individuel de son école.",
  arbitrage: 'Affectation décidée par une commission d’arbitrage, consignée avec son motif et son instance.',
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
  const [stabilite, setStabilite] = useState(settings.mobilite.stabiliteMinimaleAns)
  const [norme, setNorme] = useState(settings.besoin.elevesParMaitre)
  const [tolerance, setTolerance] = useState(settings.besoin.toleranceArrondi)
  const [niveauxParMaitre, setNiveauxParMaitre] = useState(settings.besoin.niveauxParMaitre)
  const [ordre, setOrdre] = useState<OrdreExamenVoeux>(settings.mobilite.ordreExamen)
  const [doubleFlux, setDoubleFlux] = useState(settings.besoin.doubleFluxAutorise)
  const [solutionProche, setSolutionProche] = useState(settings.mobilite.solutionProche)
  const [obligatoire, setObligatoire] = useState(settings.mobilite.redeploiementObligatoire)
  const [zoneRouge, setZoneRouge] = useState(settings.mobilite.regleZoneRouge)

  if (!diagnostic) {
    return (
      <EmptyState titre="Aucune donnée à simuler" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Les simulations s’appuient sur le diagnostic, qui se calcule dès l’import des fichiers.
      </EmptyState>
    )
  }

  function lancerPersonnalise() {
    const parametres = cloneSettings(settings)
    parametres.mobilite.stabiliteMinimaleAns = stabilite
    parametres.mobilite.ordreExamen = ordre
    parametres.mobilite.solutionProche = solutionProche
    parametres.mobilite.redeploiementObligatoire = obligatoire
    parametres.mobilite.regleZoneRouge = zoneRouge
    parametres.besoin.elevesParMaitre = norme
    parametres.besoin.toleranceArrondi = tolerance
    parametres.besoin.niveauxParMaitre = niveauxParMaitre
    parametres.besoin.doubleFluxAutorise = doubleFlux

    const scenario = creerScenarioPersonnalise(
      nom,
      `Périmètre ${LIBELLE_SCOPE[scope].toLowerCase()}, un maître pour ${norme} élèves${tolerance > 0 ? ` (tolérance ${tolerance})` : ''}, ${niveauxParMaitre} niveau(x) par maître, stabilité ${stabilite} ans, vœux examinés ${ordre === 'voeux' ? "dans l'ordre de l'enseignant" : 'par poids des écoles'}${doubleFlux ? '' : ', sans double flux'}${obligatoire ? '' : ', sans redéploiement obligatoire'}.`,
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
              <option value="etendu">Étendu — niveau régional puis niveau central</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sc-norme">Un maître pour (élèves)</label>
            <input id="sc-norme" type="number" min={20} max={120} value={norme} onChange={e => setNorme(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="sc-tol">Tolérance d’arrondi (élèves)</label>
            <input id="sc-tol" type="number" min={0} max={59} value={tolerance} onChange={e => setTolerance(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="sc-niv">Niveaux tenus par un maître</label>
            <select id="sc-niv" value={niveauxParMaitre} onChange={e => setNiveauxParMaitre(Number(e.target.value))}>
              <option value={1}>1 — chaque niveau a son maître</option>
              <option value={2}>2 — niveaux regroupés deux à deux</option>
              <option value={3}>3 — niveaux regroupés trois à trois</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sc-stab">Stabilité minimale au poste (ans)</label>
            <input id="sc-stab" type="number" min={0} max={20} value={stabilite} onChange={e => setStabilite(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="sc-ordre">Ordre d’examen des vœux</label>
            <select id="sc-ordre" value={ordre} onChange={e => setOrdre(e.target.value as OrdreExamenVoeux)}>
              <option value="voeux">Ordre choisi par l’enseignant (par défaut)</option>
              <option value="poids">Poids des écoles (variante)</option>
            </select>
          </div>
        </div>

        <div className="switch-list" style={{ marginTop: 14 }}>
          <label className="switch-row">
            <input type="checkbox" checked={doubleFlux} onChange={e => setDoubleFlux(e.target.checked)} />
            <span>
              <b>Double flux autorisé</b>
              <span>Une salle en double flux compte pour deux maîtres dans BMAX.</span>
            </span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={solutionProche} onChange={e => setSolutionProche(e.target.checked)} />
            <span>
              <b>Solution la plus proche pour les demandes non satisfaites</b>
              <span>Proposition hors vœux, dans la commune, le département puis la région des écoles demandées.</span>
            </span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={obligatoire} onChange={e => setObligatoire(e.target.checked)} />
            <span>
              <b>Redéploiement obligatoire</b>
              <span>Les écoles restées non couvertes reçoivent un maître d’une école excédentaire du même sous-système.</span>
            </span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={zoneRouge} onChange={e => setZoneRouge(e.target.checked)} />
            <span>
              <b>Règle de la zone rouge</b>
              <span>Aucun poste en zone rouge n’est proposé hors vœux ni imposé.</span>
            </span>
          </label>
        </div>

        {scope === 'etendu' && (
          <Notice tone="warn" title="Scénario étendu : mouvements entre régions possibles.">
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
    {
      cle: 'nature',
      entete: 'Nature',
      rendu: a => (
        <span>
          <Pill tone={a.nature === 'voeu' ? 'ok' : a.nature === 'obligatoire' ? 'warn' : 'info'}>{LIBELLE_NATURE[a.nature]}</Pill>
          {a.rangVoeu != null && <small>vœu {a.rangVoeu}</small>}
        </span>
      ),
      tri: a => a.nature,
    },
    { cle: 'perimetre', entete: 'Périmètre', rendu: a => <Pill tone={a.niveauProximite === 'meme_commune' ? 'ok' : a.niveauProximite === 'meme_departement' ? 'info' : 'warn'}>{LIBELLE_PROXIMITE[a.niveauProximite]}</Pill>, tri: a => a.niveauProximite },
    { cle: 'statut', entete: 'Statut', rendu: a => LIBELLE_STATUT_PROPOSITION[a.statut], tri: a => a.statut },
    { cle: 'score', entete: 'Score', numerique: true, rendu: a => fmt(a.score), tri: a => a.score },
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
    colonnes.splice(6, 0, { cle: 'phase', entete: 'Étape', rendu: a => a.phase, tri: a => a.phase })
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
            · {LIBELLE_PROXIMITE[selection.niveauProximite]} · {LIBELLE_NATURE[selection.nature]}
            {selection.rangVoeu != null ? ` (vœu ${selection.rangVoeu})` : ''}
          </p>
          <p style={{ marginBottom: 14 }}>{EXPLICATION_NATURE[selection.nature]}</p>

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
                <th scope="row">{selection.nature === 'obligatoire' ? 'Barème individuel' : selection.nature === 'arbitrage' ? 'Décision' : 'Score de priorité S'}</th>
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
    { label: 'Vœux satisfaits', actuel: '—', valeur: r => fmt(r.mouvementsParNature.find(m => m.nature === 'voeu')?.nombre ?? 0) },
    { label: 'Redéploiements obligatoires', actuel: '—', valeur: r => fmt(r.mouvementsParNature.find(m => m.nature === 'obligatoire')?.nombre ?? 0) },
    {
      label: "Degré d'aléa",
      actuel: tousResultats[0]?.syntheseAvant.degreAlea == null ? '—' : fmtPct(tousResultats[0].syntheseAvant.degreAlea),
      valeur: r => (r.syntheseApres.degreAlea == null ? '—' : fmtPct(r.syntheseApres.degreAlea)),
    },
    { label: 'Recrutement à prévoir', actuel: fmt(tousResultats[0]?.syntheseAvant.recrutementAPrevoir ?? 0), valeur: r => fmt(r.syntheseApres.recrutementAPrevoir) },
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

