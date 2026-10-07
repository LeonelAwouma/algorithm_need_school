'use client'

/**
 * Pages du plan de rotation et de redéploiement (Référentiel technique, §3) :
 *   — Vœux des enseignants : synthèse des demandes, recevabilité, scores, issue,
 *     projection N+2 ;
 *   — Commission d'arbitrage : écoles non couvertes et combinaisons proposées,
 *     validation, rejet ou correction des propositions, changement de
 *     sous-système, traçabilité des décisions ;
 *   — Nouveaux recrutés : import des candidats au concours et déploiement sur les
 *     postes restés vacants.
 */

import { useMemo, useRef, useState } from 'react'
import { Ban, Check, Download, Gavel, PencilLine, Undo2, Upload } from 'lucide-react'
import type { Candidature, DecisionArbitrage, ProposedAssignment } from '@/types/simulation'
import { exporterCSV } from '@/lib/reporting/export-csv'
import { COLONNES_RECRUES, lireRecrues } from '@/lib/data/recrues'
import { LIBELLE_ISSUE, LIBELLE_MOTIF, LIBELLE_NATURE, LIBELLE_STATUT_PROPOSITION, LIBELLE_STATUT_VOEU } from '@/lib/simulation/libelles'
import { normalizeLabel } from '@/lib/data/normalize'
import { DataTable, EmptyState, KpiCard, Notice, Panel, Pill, SearchField, fmt, type Colonne } from '../common'
import type { PlanningStore } from '../usePlanningState'

const nomDe = (c: Candidature) => `${c.teacher.nom} ${c.teacher.prenom}`.trim()
const TON_ISSUE: Record<Candidature['issue'], 'ok' | 'info' | 'warn' | 'alert' | 'neutral'> = {
  affecte_voeu: 'ok',
  hors_voeux: 'info',
  projete_n2: 'info',
  sans_solution: 'warn',
  irrecevable: 'neutral',
  depart_non_valide: 'warn',
  arbitrage: 'ok',
}

function SansSimulation({ store, texte }: { store: PlanningStore; texte: string }) {
  return (
    <EmptyState titre="Aucun plan calculé" action={{ label: 'Ouvrir les scénarios', onClick: () => store.setPage('simulations') }}>
      {texte}
    </EmptyState>
  )
}

// --- Vœux des enseignants ---------------------------------------------------------

export function VoeuxPage({ store }: { store: PlanningStore }) {
  const { resultatComplet } = store
  const [recherche, setRecherche] = useState('')
  const [issue, setIssue] = useState<Candidature['issue'] | 'toutes'>('toutes')

  const lignes = useMemo(() => {
    if (!resultatComplet) return []
    const q = normalizeLabel(recherche)
    return [...resultatComplet.candidatures]
      .sort((a, b) => a.rangClassement - b.rangClassement)
      .filter(c => issue === 'toutes' || c.issue === issue)
      .filter(c => !q || normalizeLabel(`${nomDe(c)} ${c.teacher.id} ${c.ecoleOrigine.nom}`).includes(q))
  }, [resultatComplet, recherche, issue])

  if (!resultatComplet) return <SansSimulation store={store} texte="La synthèse des vœux est établie à l’exécution d’un scénario." />

  const c = resultatComplet.candidatures
  const compte = (i: Candidature['issue']) => c.filter(x => x.issue === i).length

  if (c.length === 0) {
    return (
      <div className="stack">
        <Notice tone="info" title="Aucune demande de mutation dans les données.">
          Les vœux se renseignent dans le fichier des enseignants (colonnes « voeu_1 », « voeu_2 », « voeu_3 », avec le code des écoles
          sollicitées, et facultativement « motif_demande », « ecole_motif », « annees_zone_niveau_1 », « annees_zone_niveau_2 »,
          « rang_tirage »). Sans vœux, seul le redéploiement obligatoire peut proposer des mouvements.
        </Notice>
      </div>
    )
  }

  const colonnes: Colonne<Candidature>[] = [
    { cle: 'rang', entete: 'Rang', numerique: true, rendu: x => fmt(x.rangClassement), tri: x => x.rangClassement },
    { cle: 'nom', entete: 'Enseignant', rendu: x => (<span><strong>{nomDe(x)}</strong><small>{x.teacher.id}{x.teacher.motifDemande ? ` · ${LIBELLE_MOTIF[x.teacher.motifDemande]}` : ''}</small></span>), tri: x => x.teacher.nom },
    { cle: 'ecole', entete: 'École d’attache', rendu: x => (<span>{x.ecoleOrigine.nom}<small>excédent {fmt(x.ecoleOrigine.excedent)} · {fmt(x.teacher.anciennetePosteAns)} an(s) au poste</small></span>), tri: x => x.ecoleOrigine.nom },
    { cle: 'a', entete: 'A', numerique: true, rendu: x => fmt(x.pointsAnciennete), tri: x => x.pointsAnciennete },
    { cle: 'z', entete: 'Z', numerique: true, rendu: x => fmt(x.pointsZoneDifficile), tri: x => x.pointsZoneDifficile },
    {
      cle: 'voeux',
      entete: 'Vœux (score S)',
      rendu: x => (
        <span>
          {x.voeux.map(v => (
            <small key={v.rang} style={{ display: 'block' }}>
              {v.rang}. {v.nomEtab} — {v.statut === 'examine' ? `S = ${fmt(v.score)}${v.bonification ? ` (dont ${fmt(v.bonification)} de bonification)` : ''}` : LIBELLE_STATUT_VOEU[v.statut]}
            </small>
          ))}
        </span>
      ),
    },
    {
      cle: 'issue',
      entete: 'Issue',
      rendu: x => (
        <span>
          <Pill tone={TON_ISSUE[x.issue]}>{LIBELLE_ISSUE[x.issue]}</Pill>
          <small>{x.detailIssue}</small>
        </span>
      ),
      tri: x => x.issue,
    },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Synthèse des vœux (§3.2 et §3.3).">
        Une demande est recevable si l’enseignant compte la stabilité minimale au poste et si son école d’attache est excédentaire.
        Le rang suit le classement unique : score A + Z décroissant, puis ancienneté générale, âge et rang de tirage. Une école retient
        ensuite les candidats de plus fort score S = A + Z + B.
      </Notice>

      <div className="kpi-row">
        <KpiCard label="Demandes de mutation" value={fmt(c.length)} hint={`${fmt(c.filter(x => x.recevable).length)} recevables`} />
        <KpiCard label="Vœux satisfaits" value={fmt(compte('affecte_voeu'))} hint="Par acceptation différée" tone="ok" />
        <KpiCard label="Propositions hors vœux" value={fmt(compte('hors_voeux'))} hint="Solution la plus proche, soumise à accord" tone="info" />
        <KpiCard
          label="Possibilités en N+2"
          value={fmt(compte('projete_n2'))}
          hint={`${fmt(resultatComplet.postesProjetesN2)} poste(s) projeté(s) après les départs prévisibles`}
          tone="info"
        />
      </div>

      <Panel
        kicker="Demandes"
        title={`${fmt(lignes.length)} demande(s)`}
        flush
        actions={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              exporterCSV(
                'synthese-des-voeux.csv',
                ['Rang', 'Matricule', 'Nom', "École d'attache", 'Recevable', 'A', 'Z', 'Vœu 1', 'Vœu 2', 'Vœu 3', 'Issue', 'Détail'],
                [...c]
                  .sort((a, b) => a.rangClassement - b.rangClassement)
                  .map(x => [
                    x.rangClassement,
                    x.teacher.id,
                    nomDe(x),
                    x.ecoleOrigine.nom,
                    x.recevable ? 'oui' : 'non',
                    x.pointsAnciennete,
                    x.pointsZoneDifficile,
                    ...[0, 1, 2].map(i => (x.voeux[i] ? `${x.voeux[i].nomEtab} (${LIBELLE_STATUT_VOEU[x.voeux[i].statut]})` : '')),
                    LIBELLE_ISSUE[x.issue],
                    x.detailIssue,
                  ]),
              )
            }
          >
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        }
      >
        <div className="filter-bar" style={{ border: 0, borderRadius: 0 }}>
          <SearchField value={recherche} onChange={setRecherche} label="Rechercher" placeholder="Nom, matricule ou école" />
          <div className="field">
            <label htmlFor="v-issue">Issue</label>
            <select id="v-issue" value={issue} onChange={e => setIssue(e.target.value as typeof issue)}>
              <option value="toutes">Toutes</option>
              {(Object.keys(LIBELLE_ISSUE) as Candidature['issue'][]).map(i => (
                <option key={i} value={i}>
                  {LIBELLE_ISSUE[i]} ({fmt(compte(i))})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DataTable lignes={lignes} colonnes={colonnes} cle={x => x.teacher.id} legende="Synthèse des vœux des enseignants" />
      </Panel>
    </div>
  )
}

// --- Commission d'arbitrage --------------------------------------------------------

interface Brouillon {
  teacherId: string
  nomEnseignant: string
  proposition: ProposedAssignment | null
  decision: DecisionArbitrage['decision']
  schoolDestinationId: string
  changementSousSysteme: boolean
  motif: string
  instance: DecisionArbitrage['instance']
}

export function ArbitragePage({ store }: { store: PlanningStore }) {
  const { resultatComplet, arbitrages, ajouterArbitrage, annulerArbitrage, diagnostic } = store
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null)
  const [recherche, setRecherche] = useState('')

  const propositions = useMemo(() => {
    if (!resultatComplet) return []
    const q = normalizeLabel(recherche)
    return resultatComplet.assignments.filter(
      a => !q || normalizeLabel(`${a.nomEns} ${a.prenomEns} ${a.teacherId} ${a.nomEtabDestination} ${a.nomEtabOrigine}`).includes(q),
    )
  }, [resultatComplet, recherche])

  /** Écoles qui ont encore au moins un poste ouvert : destinations possibles d'une correction. */
  const ecolesOuvertes = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; commune: string; libres: number; sousSysteme: string | null }>()
    for (const p of resultatComplet?.uncoveredPosts ?? []) {
      const e = m.get(p.schoolId) ?? { id: p.schoolId, nom: p.nomEtab, commune: p.commune, libres: 0, sousSysteme: p.sousSysteme }
      e.libres++
      m.set(p.schoolId, e)
    }
    return [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [resultatComplet])

  const nonCouvertes = useMemo(() => {
    if (!resultatComplet) return []
    const parEcole = new Map<string, { nom: string; commune: string; indice: number; postes: number; zoneRouge: boolean }>()
    for (const p of resultatComplet.uncoveredPosts) {
      const e = parEcole.get(p.schoolId) ?? { nom: p.nomEtab, commune: p.commune, indice: p.priorite.indice, postes: 0, zoneRouge: p.priorite.zoneRouge }
      e.postes++
      parEcole.set(p.schoolId, e)
    }
    return [...parEcole.entries()].map(([id, e]) => ({ id, ...e })).sort((a, b) => b.indice - a.indice)
  }, [resultatComplet])

  if (!resultatComplet) return <SansSimulation store={store} texte="La commission examine les propositions d’un scénario calculé." />

  function enregistrer() {
    if (!brouillon) return
    const destination = brouillon.decision === 'modifier' ? ecolesOuvertes.find(e => e.id === brouillon.schoolDestinationId) : null
    ajouterArbitrage({
      id: `arb-${Date.now().toString(36)}`,
      teacherId: brouillon.teacherId,
      nomEnseignant: brouillon.nomEnseignant,
      propositionInitiale: brouillon.proposition
        ? { schoolId: brouillon.proposition.schoolDestinationId, nomEtab: brouillon.proposition.nomEtabDestination, nature: brouillon.proposition.nature }
        : null,
      decision: brouillon.decision,
      schoolDestinationId: destination?.id ?? null,
      nomEtabDestination: destination?.nom ?? null,
      changementSousSysteme: brouillon.changementSousSysteme,
      motif: brouillon.motif.trim(),
      instance: brouillon.instance,
      decideLe: new Date().toISOString(),
    })
    setBrouillon(null)
  }

  const ouvrir = (a: ProposedAssignment, decision: Brouillon['decision']) =>
    setBrouillon({
      teacherId: a.teacherId,
      nomEnseignant: `${a.nomEns} ${a.prenomEns}`.trim(),
      proposition: a,
      decision,
      schoolDestinationId: '',
      changementSousSysteme: false,
      motif: '',
      instance: 'regionale',
    })

  const colonnes: Colonne<ProposedAssignment>[] = [
    { cle: 'ens', entete: 'Enseignant', rendu: a => (<span><strong>{a.nomEns} {a.prenomEns}</strong><small>{a.teacherId}</small></span>), tri: a => a.nomEns },
    { cle: 'mouvement', entete: 'Mouvement proposé', rendu: a => (<span>{a.nomEtabOrigine} → <strong>{a.nomEtabDestination}</strong><small>{a.communeDestination}</small></span>), tri: a => a.nomEtabDestination },
    { cle: 'nature', entete: 'Nature', rendu: a => `${LIBELLE_NATURE[a.nature]}${a.rangVoeu ? ` (vœu ${a.rangVoeu})` : ''}`, tri: a => a.nature },
    { cle: 'statut', entete: 'Statut', rendu: a => <Pill tone={a.statut === 'propose' ? 'neutral' : 'ok'}>{LIBELLE_STATUT_PROPOSITION[a.statut]}</Pill>, tri: a => a.statut },
    {
      cle: 'actions',
      entete: 'Décision',
      rendu: a =>
        a.statut === 'propose' ? (
          <span className="acces-actions">
            <button type="button" className="row-action" onClick={() => ouvrir(a, 'valider')}>
              <Check size={12} aria-hidden="true" /> Valider
            </button>
            <button type="button" className="row-action" onClick={() => ouvrir(a, 'modifier')}>
              <PencilLine size={12} aria-hidden="true" /> Corriger
            </button>
            <button type="button" className="row-action row-action-danger" onClick={() => ouvrir(a, 'rejeter')}>
              <Ban size={12} aria-hidden="true" /> Rejeter
            </button>
          </span>
        ) : (
          '—'
        ),
    },
  ]

  const appliquees = new Map(resultatComplet.arbitrages.map(a => [a.decision.id, a]))
  const excedentRestant = (schoolId: string) => {
    const x = diagnostic?.bySchoolId[schoolId]?.excedentTheorique ?? 0
    return x - resultatComplet.assignments.filter(a => a.schoolOrigineId === schoolId).length
  }

  return (
    <div className="stack">
      <Notice tone="info" title="Le moteur propose, la commission décide (§3.10).">
        Chaque décision conserve la proposition initiale, son motif et l’instance qui l’a prise. Après chaque décision, les besoins sont
        recalculés et l’algorithme est relancé sur les postes et les candidats restants, pour tous les scénarios.
      </Notice>

      {brouillon && (
        <Panel
          kicker="Décision en cours"
          title={`${brouillon.decision === 'valider' ? 'Valider' : brouillon.decision === 'rejeter' ? 'Rejeter' : brouillon.changementSousSysteme ? 'Changer de sous-système' : 'Corriger'} — ${brouillon.nomEnseignant}`}
        >
          {brouillon.proposition && (
            <p className="hint" style={{ marginBottom: 12 }}>
              Proposition initiale : {brouillon.proposition.nomEtabOrigine} → {brouillon.proposition.nomEtabDestination} ({LIBELLE_NATURE[brouillon.proposition.nature]}).
            </p>
          )}
          <div className="param-grid">
            {brouillon.decision === 'modifier' && (
              <div className="field">
                <label htmlFor="arb-dest">École retenue par la commission</label>
                <select id="arb-dest" value={brouillon.schoolDestinationId} onChange={e => setBrouillon({ ...brouillon, schoolDestinationId: e.target.value })}>
                  <option value="">Choisissez une école ayant un poste ouvert</option>
                  {ecolesOuvertes.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nom} — {e.commune} ({fmt(e.libres)} poste(s){e.sousSysteme ? `, ${e.sousSysteme}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="arb-instance">Instance</label>
              <select id="arb-instance" value={brouillon.instance} onChange={e => setBrouillon({ ...brouillon, instance: e.target.value as Brouillon['instance'] })}>
                <option value="regionale">Commission régionale</option>
                <option value="centrale">Commission centrale</option>
              </select>
            </div>
            <div className="field field-recherche">
              <label htmlFor="arb-motif">Motif de la décision</label>
              <input id="arb-motif" type="text" value={brouillon.motif} onChange={e => setBrouillon({ ...brouillon, motif: e.target.value })} placeholder="Consigné au procès-verbal" />
            </div>
          </div>
          {brouillon.decision === 'modifier' && (
            <label className="switch-row">
              <input type="checkbox" checked={brouillon.changementSousSysteme} onChange={e => setBrouillon({ ...brouillon, changementSousSysteme: e.target.checked })} />
              <span>
                <b>Changement de sous-système</b>
                <span>
                  Seulement si l’enseignant maîtrise la langue d’enseignement du sous-système d’accueil (preuve arrêtée par la DRH) et a demandé le
                  poste ou y consent. L’application vérifie que le poste est vacant et que le départ reste dans la limite de l’excédent.
                </span>
              </span>
            </label>
          )}
          <div className="topbar-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!brouillon.motif.trim() || (brouillon.decision === 'modifier' && !brouillon.schoolDestinationId)}
              onClick={enregistrer}
            >
              <Gavel size={14} aria-hidden="true" /> Enregistrer la décision
            </button>
            <button type="button" className="btn" onClick={() => setBrouillon(null)}>
              Annuler
            </button>
          </div>
        </Panel>
      )}

      <Panel
        kicker="Écoles non couvertes"
        title={`${fmt(nonCouvertes.length)} école(s) restée(s) sans maître, par ordre de priorité`}
        hint="Combinaisons proposées automatiquement, avant le redéploiement obligatoire : redéploiement direct depuis l’école excédentaire la plus proche, chaîne de mouvements, permutation."
      >
        {nonCouvertes.length === 0 ? (
          <p className="hint">Toutes les écoles nécessiteuses sont couvertes dans ce scénario.</p>
        ) : (
          <ul className="acces-demandes">
            {nonCouvertes.slice(0, 40).map(e => {
              const combis = resultatComplet.combinaisons.filter(c => c.schoolId === e.id)
              return (
                <li key={e.id} style={{ display: 'block' }}>
                  <strong>
                    {e.nom} — {e.commune}
                  </strong>
                  <span>
                    {' '}
                    · indice u = {fmt(e.indice)} · {fmt(e.postes)} poste(s) ouvert(s){e.zoneRouge ? ' · zone rouge : volontaires, primes ou recrutement uniquement' : ''}
                  </span>
                  {combis.length === 0 ? (
                    <span style={{ display: 'block', marginTop: 4 }}>Aucune combinaison volontaire : redéploiement obligatoire ou recrutement.</span>
                  ) : (
                    combis.map((c, i) => (
                      <span key={i} style={{ display: 'block', marginTop: 4 }}>
                        <Pill tone="info">{c.type === 'direct' ? 'Direct' : c.type === 'chaine' ? 'Chaîne' : 'Permutation'}</Pill> {c.description}
                      </span>
                    ))
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {resultatComplet.voeuxAutreSousSysteme.length > 0 && (
        <Panel
          kicker="Changement de sous-système"
          title="Vœux portant sur l’autre sous-système"
          hint="L’algorithme n’affecte jamais un enseignant hors de son sous-système. La commission peut le décider au cas par cas."
        >
          <ul className="reason-list">
            {resultatComplet.voeuxAutreSousSysteme.map(v => {
              const reste = excedentRestant(resultatComplet.candidatures.find(c => c.teacher.id === v.teacherId)?.ecoleOrigine.id ?? '')
              return (
                <li key={`${v.teacherId}-${v.schoolId}`}>
                  <span>
                    <strong>{v.nom}</strong> ({v.sousSystemeEnseignant ?? 'sous-système non renseigné'}) demande {v.nomEtab} ({v.sousSystemePoste ?? '—'}).{' '}
                    {v.posteVacant ? 'Poste vacant.' : 'Aucun poste vacant.'} {reste > 0 ? 'Départ dans la limite de l’excédent.' : 'L’excédent de l’école d’attache est atteint.'}{' '}
                    {v.posteVacant && reste > 0 && (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() =>
                          setBrouillon({
                            teacherId: v.teacherId,
                            nomEnseignant: v.nom,
                            proposition: null,
                            decision: 'modifier',
                            schoolDestinationId: v.schoolId,
                            changementSousSysteme: true,
                            motif: '',
                            instance: 'regionale',
                          })
                        }
                      >
                        Décider le changement
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <Panel kicker="Propositions" title={`${fmt(propositions.length)} proposition(s) du plan`} flush>
        <div className="filter-bar" style={{ border: 0, borderRadius: 0 }}>
          <SearchField value={recherche} onChange={setRecherche} label="Rechercher" placeholder="Nom, matricule ou école" />
        </div>
        <DataTable lignes={propositions} colonnes={colonnes} cle={a => a.postId} legende="Propositions soumises à la commission" />
      </Panel>

      <Panel kicker="Traçabilité" title={`${fmt(arbitrages.length)} décision(s) enregistrée(s)`}>
        {arbitrages.length === 0 ? (
          <p className="hint">Aucune décision n’a encore été prise.</p>
        ) : (
          <ul className="reason-list">
            {[...arbitrages].reverse().map(d => {
              const sort = appliquees.get(d.id)
              return (
                <li key={d.id}>
                  <span>
                    <strong>{d.nomEnseignant}</strong> —{' '}
                    {d.decision === 'valider' ? 'proposition validée' : d.decision === 'rejeter' ? 'proposition rejetée' : `affecté à ${d.nomEtabDestination}`}
                    {d.propositionInitiale ? ` (proposition initiale : ${d.propositionInitiale.nomEtab})` : ''}
                    {d.changementSousSysteme ? ', avec changement de sous-système' : ''}. Commission {d.instance === 'centrale' ? 'centrale' : 'régionale'}, le{' '}
                    {new Date(d.decideLe).toLocaleDateString('fr-FR')} — motif : {d.motif}.{' '}
                    {sort && !sort.appliquee && <Pill tone="warn">Non appliquée : {sort.motif}</Pill>}{' '}
                    <button type="button" className="btn-link" onClick={() => annulerArbitrage(d.id)}>
                      <Undo2 size={12} aria-hidden="true" /> Annuler
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}

// --- Nouveaux recrutés --------------------------------------------------------------

export function RecrutesPage({ store }: { store: PlanningStore }) {
  const { recrues, setRecrues, resultatComplet } = store
  const [erreur, setErreur] = useState<string | null>(null)
  const [avertissement, setAvertissement] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function charger(file?: File) {
    if (!file) return
    setErreur(null)
    setAvertissement(null)
    try {
      const lecture = await lireRecrues(file)
      if (lecture.manquantes.length > 0) {
        setErreur(`Colonnes indispensables introuvables : ${lecture.manquantes.join(', ')}.`)
        return
      }
      setRecrues(lecture.recrues)
      if (lecture.ecartees.length > 0) {
        setAvertissement(`${fmt(lecture.ecartees.length)} ligne(s) écartée(s) : ${lecture.ecartees.slice(0, 5).map(e => `ligne ${e.ligne} (${e.motif})`).join(', ')}.`)
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  const r = resultatComplet?.recrutes ?? null

  return (
    <div className="stack">
      <Notice tone="info" title="Déploiement des nouveaux recrutés (§3.8).">
        Les nouveaux recrutés ne sont déployés que sur les postes restés vacants après le redéploiement. Le mieux classé au concours
        choisit le premier parmi ses trois choix ; à défaut, un poste lui est proposé dans le département, puis dans la région, puis il
        entre dans un vivier national pour arbitrage. Seuls les postes du sous-système de son concours lui sont proposés.
      </Notice>

      <Panel
        kicker="Candidats au concours"
        title={recrues.length > 0 ? `${fmt(recrues.length)} candidat(s) chargé(s)` : 'Aucun candidat chargé'}
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()}>
              <Upload size={13} aria-hidden="true" /> {recrues.length > 0 ? 'Remplacer le fichier' : 'Importer le fichier des candidats'}
            </button>
            {recrues.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => setRecrues([])}>
                Retirer la liste
              </button>
            )}
          </>
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          style={{ display: 'none' }}
          onChange={e => {
            void charger(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {erreur && <Notice tone="alert">{erreur}</Notice>}
        {avertissement && <Notice tone="warn">{avertissement}</Notice>}
        <p className="hint" style={{ marginBottom: 8 }}>
          Colonnes attendues (une ligne par candidat admis) :
        </p>
        <ul className="reason-list">
          {COLONNES_RECRUES.map(c => (
            <li key={c.champ}>
              <span>
                <strong>{c.label}</strong>
                {c.requis ? ' — indispensable' : ''} · noms acceptés : {c.alias.slice(0, 4).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {recrues.length > 0 && !r && <SansSimulation store={store} texte="Le déploiement des recrutés s’effectue sur les postes restés vacants d’un scénario calculé." />}

      {r && (
        <>
          <div className="kpi-row">
            <KpiCard label="Candidats affectés" value={fmt(r.affectations.length)} hint="Par ordre de note d’admission" tone="ok" />
            <KpiCard label="Sur un de leurs choix" value={fmt(r.affectations.filter(a => a.issue === 'choix').length)} hint="Les autres par extension territoriale" />
            <KpiCard label="Vivier national" value={fmt(r.vivierNational.length)} hint="Sans poste compatible dans leur région" tone="warn" />
            <KpiCard label="Postes encore vacants" value={fmt(r.postesRestants)} hint="Après redéploiement et recrutement" tone={r.postesRestants > 0 ? 'alert' : 'ok'} />
          </div>
          <Panel kicker="Affectations" title="Postes proposés aux nouveaux recrutés" flush>
            <DataTable
              lignes={r.affectations}
              colonnes={[
                { cle: 'nom', entete: 'Candidat', rendu: a => (<span><strong>{a.nom}</strong><small>{a.recrueId}</small></span>), tri: a => a.nom },
                { cle: 'note', entete: 'Note', numerique: true, rendu: a => a.note.toLocaleString('fr-FR'), tri: a => a.note },
                { cle: 'ecole', entete: 'Poste', rendu: a => (<span><strong>{a.nomEtab}</strong><small>{a.commune}</small></span>), tri: a => a.nomEtab },
                {
                  cle: 'issue',
                  entete: 'Issue',
                  rendu: a => (a.issue === 'choix' ? `Choix ${a.rangChoix}` : a.issue === 'departement' ? 'Extension au département' : 'Extension à la région'),
                  tri: a => a.issue,
                },
              ]}
              cle={a => a.recrueId}
              legende="Affectation des nouveaux recrutés"
            />
          </Panel>
          {r.vivierNational.length > 0 && (
            <Panel kicker="Vivier national" title="Candidats transmis pour arbitrage">
              <ul className="reason-list">
                {r.vivierNational.map(v => (
                  <li key={v.recrueId}>
                    <span>
                      <strong>{v.nom}</strong> ({v.note.toLocaleString('fr-FR')}) — {v.motif}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

// --- Projections pluriannuelles --------------------------------------------------------

const LIBELLE_SS: Record<string, string> = { francophone: 'Francophone', anglophone: 'Anglophone', non_renseigne: 'Non renseigné' }

export function ProjectionsPage({ store }: { store: PlanningStore }) {
  const { resultatComplet, settings } = store
  const [recherche, setRecherche] = useState('')
  const ecoles = useMemo(() => {
    const liste = resultatComplet?.projectionPluriannuelle.ecoles ?? []
    const q = normalizeLabel(recherche)
    return [...liste]
      .filter(e => !q || normalizeLabel(`${e.nomEtab} ${e.schoolId} ${e.commune}`).includes(q))
      .sort((a, b) => b.annees[2].besoin - a.annees[2].besoin || b.indicePriorite - a.indicePriorite)
  }, [resultatComplet, recherche])

  if (!resultatComplet) return <SansSimulation store={store} texte="Les projections partent des effectifs après le plan d’un scénario calculé." />
  const { territoire } = resultatComplet.projectionPluriannuelle
  const total = (annee: string, cle: 'recrutementAPrevoir' | 'departsRetraite' | 'besoin') =>
    territoire.filter(t => t.annee === annee).reduce((s, t) => s + t[cle], 0)

  type Ligne = (typeof ecoles)[number]
  const colonnes: Colonne<Ligne>[] = [
    { cle: 'ecole', entete: 'École', rendu: e => (<span><strong>{e.nomEtab}</strong><small>{e.commune} · indice u {fmt(e.indicePriorite)}</small></span>), tri: e => e.nomEtab },
    { cle: 'k', entete: 'Cible K', numerique: true, rendu: e => fmt(e.cible), tri: e => e.cible },
    { cle: 'b', entete: 'Besoin avant plan', numerique: true, rendu: e => fmt(e.besoinAvantPlan), tri: e => e.besoinAvantPlan },
    { cle: 'flux', entete: 'Arrivées / départs', rendu: e => `+${fmt(e.arrivants.length)} / −${fmt(e.sortants.length)}` },
    ...([0, 1, 2] as const).map(k => ({
      cle: `a${k}`,
      entete: `${['N+1', 'N+2', 'N+3'][k]} : effectif · besoin`,
      numerique: true,
      rendu: (e: Ligne) => `${fmt(e.annees[k].effectif)} · ${fmt(e.annees[k].besoin)}${k > 0 && e.annees[k].departsRetraite ? ` (${fmt(e.annees[k].departsRetraite)} retraite)` : ''}`,
      tri: (e: Ligne) => e.annees[k].besoin,
    })),
    { cle: 's', entete: 'Salles manquantes', numerique: true, rendu: e => fmt(e.sallesManquantes), tri: e => e.sallesManquantes },
  ]

  return (
    <div className="stack">
      <Notice tone="info" title="Projection de la rentrée du plan (N+1) à N+3.">
        L’effectif de chaque école part de la situation après le plan (mouvements et nouveaux recrutés compris), puis perd les
        enseignants qui atteignent {settings.besoin.ageRetraite} ans. Le besoin projeté suit la règle du référentiel (cible K), sans
        projection des effectifs d’élèves. L’attrition hors retraite ({settings.recrutement.tauxAttritionHorsRetraite.toLocaleString('fr-FR')} % par
        an) est appliquée au territoire, par sous-système. Une projection n’est pas un engagement.
      </Notice>

      <div className="kpi-row">
        {(['N+1', 'N+2', 'N+3'] as const).map(a => (
          <KpiCard
            key={a}
            label={`Recrutement à prévoir ${a}`}
            value={fmt(total(a, 'recrutementAPrevoir'))}
            hint={`${fmt(total(a, 'besoin'))} poste(s) de besoin${a !== 'N+1' ? `, ${fmt(total(a, 'departsRetraite'))} retraite(s) dans l’année` : ''}`}
            tone={a === 'N+1' ? 'info' : 'warn'}
          />
        ))}
        <KpiCard
          label="Postes en zone rouge sans maître"
          value={fmt(resultatComplet.postesZoneRougeNonPourvus)}
          hint="Volontariat, primes de zone difficile ou recrutement uniquement"
          tone={resultatComplet.postesZoneRougeNonPourvus > 0 ? 'alert' : 'ok'}
        />
      </div>

      <Panel kicker="Territoire" title="Projection par sous-système" flush>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Rentrée</th>
                <th>Sous-système</th>
                <th className="num">Effectif</th>
                <th className="num">Retraites dans l’année</th>
                <th className="num">Attrition attendue</th>
                <th className="num">Besoin B</th>
                <th className="num">Excédent X</th>
                <th className="num">Recrutement à prévoir</th>
              </tr>
            </thead>
            <tbody>
              {territoire.map(t => (
                <tr key={`${t.annee}-${t.sousSysteme}`}>
                  <th scope="row">{t.annee}</th>
                  <td>{LIBELLE_SS[t.sousSysteme]}</td>
                  <td className="num">{fmt(t.effectif)}</td>
                  <td className="num">{fmt(t.departsRetraite)}</td>
                  <td className="num">{fmt(t.attrition)}</td>
                  <td className="num">{fmt(t.besoin)}</td>
                  <td className="num">{fmt(t.excedent)}</td>
                  <td className="num">
                    <strong>{fmt(t.recrutementAPrevoir)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        kicker="Écoles"
        title={`${fmt(ecoles.length)} école(s)`}
        flush
        actions={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              exporterCSV(
                'projections-N1-N3.csv',
                [
                  'Code', 'École', 'Sous-système', 'Commune', 'Indice u', 'BMAX', 'Dotation D', 'Cible K', 'Besoin avant plan', 'Excédent avant plan',
                  'Arrivants', 'Sortants', 'Salles manquantes',
                  ...['N+1', 'N+2', 'N+3'].flatMap(a => [`Retraites ${a}`, `Effectif ${a}`, `Besoin ${a}`, `Excédent ${a}`]),
                ],
                ecoles.map(e => [
                  e.schoolId, e.nomEtab, e.sousSysteme ?? '', e.commune, e.indicePriorite, e.bmax ?? '', e.dotation, e.cible, e.besoinAvantPlan, e.excedentAvantPlan,
                  e.arrivants.join(' '), e.sortants.join(' '), e.sallesManquantes,
                  ...e.annees.flatMap(a => [a.departsRetraite, a.effectif, a.besoin, a.excedent]),
                ]),
              )
            }
          >
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        }
      >
        <div className="filter-bar" style={{ border: 0, borderRadius: 0 }}>
          <SearchField value={recherche} onChange={setRecherche} label="Rechercher" placeholder="École, code ou commune" />
        </div>
        <DataTable lignes={ecoles} colonnes={colonnes} cle={e => e.schoolId} legende="Projection pluriannuelle par école" />
      </Panel>
    </div>
  )
}
