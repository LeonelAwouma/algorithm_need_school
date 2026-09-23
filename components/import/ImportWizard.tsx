'use client'

/**
 * Import des données, en une seule action.
 *
 * L'utilisateur dépose ses deux classeurs puis lance l'analyse : contrôle
 * qualité, correspondance des colonnes, diagnostic et simulations s'enchaînent
 * sans autre clic. Chaque étape est annoncée pendant qu'elle se déroule, pour
 * que le traitement reste lisible et qu'un blocage soit immédiatement situé.
 *
 * L'utilisateur n'a la main que dans un seul cas : une information indispensable
 * introuvable dans ses fichiers. L'enchaînement s'arrête alors sur la
 * correspondance des colonnes, et reprend là où il s'était interrompu.
 *
 * Le classeur est lu dans le navigateur ; aucun fichier ne quitte le poste.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, FlaskConical, Play, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react'
import type { DataQualityReport } from '@/types/data-quality'
import { applyManualMapping, fieldsFor, SEUIL_CONFIRMATION, type DatasetKind } from '@/lib/data/column-mapping'
import { construireDataset, lireClasseur, type FichierLu } from '@/lib/data/import'
import { MENTION_DEMONSTRATION } from '@/lib/data/demo-dataset'
import { DataQualityPanel } from '../data-quality/DataQualityPanel'
import { Notice, Panel, Pill, fmt } from '../common'
import type { PlanningStore } from '../usePlanningState'

/**
 * Étapes enchaînées automatiquement après le clic. L'ordre est celui du
 * traitement réel : chacune correspond à un calcul effectivement exécuté.
 */
const ETAPES = [
  { cle: 'lecture', titre: 'Lecture des classeurs' },
  { cle: 'colonnes', titre: 'Reconnaissance des colonnes' },
  { cle: 'qualite', titre: 'Contrôle qualité des données' },
  { cle: 'diagnostic', titre: 'Diagnostic des établissements' },
  { cle: 'scenarios', titre: 'Simulation des scénarios de redéploiement' },
] as const

type CleEtape = (typeof ETAPES)[number]['cle']
type EtatEtape = 'attente' | 'encours' | 'faite' | 'bloquee'

interface AvancementEtape {
  etat: EtatEtape
  detail?: string
}

/**
 * Laisse le navigateur peindre l'étape en cours avant d'enchaîner le calcul suivant.
 * Le délai sert aussi à rendre l'enchaînement lisible : sur un petit fichier, tout
 * s'exécuterait en quelques dizaines de millisecondes et l'utilisateur ne verrait
 * défiler aucune étape.
 */
const respirer = () => new Promise(r => window.setTimeout(r, 420))

const DESCRIPTIONS: Record<DatasetKind, { titre: string; texte: string }> = {
  etablissements: {
    titre: 'Établissements',
    texte:
      "La liste des écoles, avec leur territoire, leur nombre de classes et leurs enseignants. Les effectifs d’élèves sont facultatifs : sans eux, les indicateurs pédagogiques ne sont simplement pas calculés.",
  },
  enseignants: {
    titre: 'Enseignants',
    texte:
      "La liste du personnel, avec son école de rattachement et les éléments du barème (ancienneté, situation familiale, formation continue).",
  },
}

export function ImportWizard({ store }: { store: PlanningStore }) {
  const [lecture, setLecture] = useState<DatasetKind | null>(null)
  const [erreurs, setErreurs] = useState<Partial<Record<DatasetKind, string>>>({})
  const [apercu, setApercu] = useState<{ qualite: DataQualityReport } | null>(null)
  const [avancement, setAvancement] = useState<Partial<Record<CleEtape, AvancementEtape>>>({})
  const [enCours, setEnCours] = useState(false)
  const [blocage, setBlocage] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  /** Vrai entre le chargement du jeu de données et la fin des simulations. */
  const attenteScenarios = useRef(false)

  const { fichiers, setFichiers, chargerDataset, chargerDemonstration, setPage, simulationPrete, erreur: erreurMoteur } = store
  const complet = !!fichiers.etablissements && !!fichiers.enseignants

  async function choisirFichier(kind: DatasetKind, file?: File) {
    if (!file) return
    setLecture(kind)
    setErreurs(e => ({ ...e, [kind]: undefined }))
    try {
      const lu = await lireClasseur(kind, file)
      setFichiers(f => ({ ...f, [kind]: lu }))
      setApercu(null)
    } catch (err) {
      setErreurs(e => ({ ...e, [kind]: err instanceof Error ? err.message : String(err) }))
      setFichiers(f => ({ ...f, [kind]: null }))
    } finally {
      setLecture(null)
    }
  }

  function corrigerMapping(kind: DatasetKind, champ: string, enTete: string | null) {
    setFichiers(f => {
      const fichier = f[kind]
      if (!fichier) return f
      return { ...f, [kind]: { ...fichier, mapping: applyManualMapping(fichier.mapping, champ, enTete) } }
    })
    setApercu(null)
  }

  const bloquant = useMemo(() => {
    const e = fichiers.etablissements?.mapping.incomplet ?? true
    const t = fichiers.enseignants?.mapping.incomplet ?? true
    return e || t
  }, [fichiers])

  const marquer = useCallback((cle: CleEtape, etat: EtatEtape, detail?: string) => {
    setAvancement(a => ({ ...a, [cle]: { etat, detail } }))
  }, [])

  /**
   * Enchaîne les étapes sans intervention. Chaque étape est affichée avant son
   * calcul : si l'une échoue, on voit immédiatement laquelle.
   */
  const lancerAnalyse = useCallback(async () => {
    const etablissements = fichiers.etablissements
    const enseignants = fichiers.enseignants
    if (!etablissements || !enseignants || enCours) return

    setEnCours(true)
    setBlocage(null)
    setEchec(null)
    setAvancement({})

    try {
      marquer('lecture', 'encours')
      await respirer()
      marquer(
        'lecture',
        'faite',
        `${fmt(etablissements.records.length)} établissements et ${fmt(enseignants.records.length)} enseignants lus.`,
      )

      marquer('colonnes', 'encours')
      await respirer()
      const manquants = [...etablissements.mapping.matches, ...enseignants.mapping.matches].filter(m => m.requis && !m.enTete)
      if (manquants.length > 0) {
        marquer('colonnes', 'bloquee', `${manquants.length} information(s) indispensable(s) introuvable(s).`)
        setBlocage(
          `${manquants.map(m => m.label).join(', ')} : ces informations n'ont pas été retrouvées dans vos fichiers. Indiquez la colonne correspondante ci-dessous, puis relancez l'analyse.`,
        )
        setEnCours(false)
        return
      }
      const reconnues = [...etablissements.mapping.matches, ...enseignants.mapping.matches].filter(m => m.enTete).length
      const total = etablissements.mapping.matches.length + enseignants.mapping.matches.length
      marquer('colonnes', 'faite', `${reconnues} informations reconnues sur ${total}.`)

      marquer('qualite', 'encours')
      await respirer()
      const { dataset, qualite } = construireDataset(etablissements, enseignants)
      setApercu({ qualite })
      marquer('qualite', 'faite', `Score de ${qualite.score} sur 100 — ${qualite.appreciation.toLowerCase()}.`)

      marquer('diagnostic', 'encours')
      await respirer()
      // Charger le jeu de données déclenche le diagnostic puis, par l'état, le
      // calcul des scénarios : on attend leur fin avant d'ouvrir la vue d'ensemble.
      attenteScenarios.current = true
      chargerDataset(dataset, qualite)
      marquer('diagnostic', 'faite', `${fmt(dataset.schools.length)} établissements analysés.`)
      marquer('scenarios', 'encours')
    } catch (err) {
      setEchec(err instanceof Error ? err.message : String(err))
      setEnCours(false)
      attenteScenarios.current = false
    }
  }, [fichiers, enCours, marquer, chargerDataset])

  /** Fin des simulations : dernière étape close, puis ouverture de la vue d'ensemble. */
  useEffect(() => {
    if (!attenteScenarios.current) return
    if (erreurMoteur) {
      attenteScenarios.current = false
      marquer('scenarios', 'bloquee', erreurMoteur)
      setEchec(erreurMoteur)
      setEnCours(false)
      return
    }
    if (!simulationPrete) return
    attenteScenarios.current = false
    marquer('scenarios', 'faite', 'Les trois scénarios géographiques sont calculés.')
    const t = window.setTimeout(() => {
      setEnCours(false)
      setPage('overview')
    }, 1200)
    return () => window.clearTimeout(t)
  }, [simulationPrete, erreurMoteur, marquer, setPage])

  return (
    <div className="stack">
      {!enCours && (
        <section className="welcome">
          <img className="welcome-logo" src="/logo-full.png" alt="Logo AlgoBaba" width={150} height={116} />
          <div>
            <h2>Bienvenue dans AlgoBaba</h2>
            <p>
              Ajoutez la liste des établissements et celle des enseignants : la plateforme contrôle les données, mesure les
              besoins de chaque école et simule des scénarios de redéploiement.
            </p>
          </div>
        </section>
      )}

      <Notice tone="info" title="Traitement entièrement local.">
        Les classeurs sont lus dans votre navigateur. Aucun fichier établissement, enseignant ou élève n’est envoyé vers un
        service externe, et aucune connexion Internet n’est nécessaire.
      </Notice>

      {(enCours || Object.keys(avancement).length > 0) && (
        <Panel kicker="Traitement" title={enCours ? 'Analyse en cours' : blocage ? 'Analyse interrompue' : 'Analyse terminée'}>
          <ol className="avancement">
            {ETAPES.map(e => {
              const etat = avancement[e.cle]?.etat ?? 'attente'
              return (
                <li key={e.cle} data-etat={etat}>
                  <span className="avancement-marque" aria-hidden="true">
                    {etat === 'faite' ? (
                      <Check size={13} />
                    ) : etat === 'encours' ? (
                      <RefreshCw size={13} className="spin" />
                    ) : etat === 'bloquee' ? (
                      <AlertTriangle size={13} />
                    ) : (
                      <span className="avancement-point" />
                    )}
                  </span>
                  <span>
                    <b>{e.titre}</b>
                    {avancement[e.cle]?.detail && <small>{avancement[e.cle]?.detail}</small>}
                  </span>
                  <span className="sr-only">
                    {etat === 'faite' ? 'terminé' : etat === 'encours' ? 'en cours' : etat === 'bloquee' ? 'interrompu' : 'à venir'}
                  </span>
                </li>
              )
            })}
          </ol>
        </Panel>
      )}

      <EtapeFichiers
        fichiers={fichiers}
        erreurs={erreurs}
        lecture={lecture}
        onFichier={choisirFichier}
        onSuivant={lancerAnalyse}
        onDemo={chargerDemonstration}
        complet={complet}
        enCours={enCours}
      />

      {echec && (
        <Notice tone="alert" title="L’analyse n’a pas pu aboutir.">
          {echec}
        </Notice>
      )}

      {blocage && (
        <div className="stack">
          <Notice tone="alert" title="Information indispensable manquante.">
            {blocage}
          </Notice>
          {(['etablissements', 'enseignants'] as DatasetKind[]).map(kind => {
            const fichier = fichiers[kind]
            if (!fichier) return null
            return <TableCorrespondance key={kind} fichier={fichier} onChange={(champ, enTete) => corrigerMapping(kind, champ, enTete)} />
          })}
          <div className="topbar-actions">
            <button type="button" className="btn btn-primary" disabled={bloquant || enCours} onClick={lancerAnalyse}>
              <RefreshCw size={15} aria-hidden="true" /> Relancer l’analyse
            </button>
          </div>
        </div>
      )}

      {apercu && !blocage && !enCours && (
        <Panel
          kicker="Contrôle"
          title="Qualité des données"
          hint="Ce contrôle liste tout ce qui pourrait fausser l’analyse. Rien n’est masqué : les avertissements restent visibles même quand le score est bon."
        >
          <DataQualityPanel rapport={apercu.qualite} />
        </Panel>
      )}

    </div>
  )
}

function EtapeFichiers({
  fichiers,
  erreurs,
  lecture,
  onFichier,
  onSuivant,
  onDemo,
  complet,
  enCours,
}: {
  fichiers: { etablissements: FichierLu | null; enseignants: FichierLu | null }
  erreurs: Partial<Record<DatasetKind, string>>
  lecture: DatasetKind | null
  onFichier: (kind: DatasetKind, file?: File) => void
  onSuivant: () => void
  onDemo: () => void
  complet: boolean
  enCours: boolean
}) {
  return (
    <div className="stack">
      <div className="upload-cards">
        {(['etablissements', 'enseignants'] as DatasetKind[]).map(kind => {
          const fichier = fichiers[kind]
          const erreur = erreurs[kind]
          const etat = erreur ? 'error' : fichier ? 'ready' : 'vide'
          const description = DESCRIPTIONS[kind]
          const reconnues = fichier?.mapping.matches.filter(m => m.enTete !== null).length ?? 0
          return (
            <div className="upload-card" data-state={etat} key={kind}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <p className="eyebrow">Fichier requis</p>
                  <h2>{description.titre}</h2>
                </div>
                {etat === 'ready' && (
                  <Pill tone="ok">
                    <Check size={12} aria-hidden="true" /> Lu
                  </Pill>
                )}
                {etat === 'error' && (
                  <Pill tone="alert">
                    <X size={12} aria-hidden="true" /> Illisible
                  </Pill>
                )}
                {etat === 'vide' && <Pill tone="warn">À fournir</Pill>}
              </div>

              <p className="hint">{description.texte}</p>

              <ColonnesAttendues kind={kind} />

              {erreur && (
                <Notice tone="alert" title="Lecture impossible.">
                  {erreur}
                </Notice>
              )}

              {fichier && (
                <div className="upload-meta">
                  <span>
                    <strong style={{ color: 'var(--ink)' }}>{fichier.nomFichier}</strong>
                  </span>
                  <span>
                    Feuille « {fichier.feuilleLue} » · {fmt(fichier.records.length)} lignes de données ·{' '}
                    {reconnues} informations reconnues sur {fichier.mapping.matches.length}
                  </span>
                </div>
              )}

              <label className="upload-drop">
                {lecture === kind ? (
                  <>
                    <RefreshCw size={18} className="spin" aria-hidden="true" /> Lecture du classeur…
                  </>
                ) : (
                  <>
                    <Upload size={18} aria-hidden="true" />
                    <span>
                      <strong>{fichier ? 'Remplacer le fichier' : 'Choisir un fichier Excel'}</strong>
                      <br />
                      Formats acceptés : .xlsx, .xls, .xlsm, .csv
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.csv"
                  onChange={e => onFichier(kind, e.target.files?.[0])}
                />
              </label>
            </div>
          )
        })}
      </div>

      <div className="topbar-actions">
        <button type="button" className="btn btn-primary" disabled={!complet || enCours} onClick={onSuivant}>
          {enCours ? <RefreshCw size={15} className="spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {enCours ? 'Analyse en cours…' : 'Lancer l’analyse complète'}
          <span className="btn-count">{[fichiers.etablissements, fichiers.enseignants].filter(Boolean).length}/2</span>
        </button>
        <button type="button" className="btn" disabled={enCours} onClick={onDemo}>
          <FlaskConical size={15} aria-hidden="true" /> Explorer avec des données de démonstration
        </button>
      </div>

      <Notice tone="warn" title="Données de démonstration.">
        {MENTION_DEMONSTRATION}
      </Notice>

      <p className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <ShieldCheck size={15} aria-hidden="true" /> La première feuille de chaque classeur est lue, sa première ligne servant
        d’en-têtes. Un seul clic suffit ensuite : contrôle qualité, reconnaissance des colonnes, diagnostic et simulations
        s’enchaînent, et la vue d’ensemble s’ouvre à la fin.
      </p>
    </div>
  )
}

/**
 * Aide à la préparation d'un fichier : les colonnes que l'application cherche,
 * les indispensables d'abord. La liste vient du dictionnaire qui sert à
 * reconnaître les colonnes, elle ne peut donc pas s'en écarter.
 */
function ColonnesAttendues({ kind }: { kind: DatasetKind }) {
  const champs = fieldsFor(kind)
  const indispensables = champs.filter(c => c.requis)
  const facultatives = champs.filter(c => !c.requis)

  const liste = (items: typeof champs) => (
    <ul>
      {items.map(c => (
        <li key={c.champ}>
          <span>
            <b>{c.label}</b> <code className="mono">{c.alias[0] ?? c.champ}</code>
          </span>
          <small>{c.consequence}</small>
        </li>
      ))}
    </ul>
  )

  return (
    <details className="advanced">
      <summary>
        Colonnes attendues ({indispensables.length} indispensables, {facultatives.length} facultatives)
      </summary>
      <div className="colonnes-attendues">
        <h4>Indispensables</h4>
        {liste(indispensables)}
        <h4>Facultatives</h4>
        {liste(facultatives)}
        <p className="hint">
          Le nom en gris est un exemple d’intitulé. Les accents, les majuscules et les variantes courantes (« Nom de l’école »,
          « nb_classes »…) sont reconnus ; ce qui ne l’est pas sera à indiquer à l’étape « Correspondance des colonnes ».
          L’ordre des colonnes n’a pas d’importance.
        </p>
      </div>
    </details>
  )
}

function TableCorrespondance({ fichier, onChange }: { fichier: FichierLu; onChange: (champ: string, enTete: string | null) => void }) {
  const [toutAfficher, setToutAfficher] = useState(false)
  const aConfirmer = fichier.mapping.matches.filter(m => m.enTete !== null && m.confiance < SEUIL_CONFIRMATION)
  const manquants = fichier.mapping.matches.filter(m => m.enTete === null)
  const visibles = toutAfficher ? fichier.mapping.matches : [...aConfirmer, ...manquants]

  return (
    <Panel
      kicker={fichier.kind === 'etablissements' ? 'Établissements' : 'Enseignants'}
      title={fichier.nomFichier}
      hint={
        visibles.length === 0
          ? 'Toutes les colonnes attendues ont été reconnues avec certitude.'
          : 'Vérifiez les rapprochements ci-dessous, puis corrigez-les si nécessaire.'
      }
      actions={
        <button type="button" className="btn btn-sm" onClick={() => setToutAfficher(v => !v)}>
          {toutAfficher ? 'Afficher seulement les points à vérifier' : 'Afficher toutes les colonnes'}
        </button>
      }
    >
      {aConfirmer.length > 0 && (
        <Notice tone="warn" title="Rapprochements à confirmer.">
          {aConfirmer.length} colonne(s) ont été rapprochées par ressemblance et méritent une vérification humaine.
        </Notice>
      )}

      <div style={{ marginTop: 12 }}>
        {visibles.length === 0 && <p className="hint">Rien à corriger dans ce fichier.</p>}
        {visibles.map(m => (
          <div className="mapping-row" key={m.champ}>
            <div>
              <strong style={{ fontSize: 13 }}>{m.label}</strong>
              {m.requis && (
                <Pill tone={m.enTete ? 'neutral' : 'alert'}>{m.enTete ? 'Requis' : 'Requis — manquant'}</Pill>
              )}
            </div>
            <div>
              <label className="sr-only" htmlFor={`map-${fichier.kind}-${m.champ}`}>
                Colonne du fichier correspondant à « {m.label} »
              </label>
              <select
                id={`map-${fichier.kind}-${m.champ}`}
                value={m.enTete ?? ''}
                onChange={e => onChange(m.champ, e.target.value || null)}
              >
                <option value="">— Aucune colonne —</option>
                {fichier.headers
                  .filter(h => h !== '')
                  .map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              {m.enTete === null ? (
                <Pill tone={m.requis ? 'alert' : 'warn'}>Non trouvée</Pill>
              ) : m.confiance >= SEUIL_CONFIRMATION ? (
                <Pill tone="ok">Reconnue</Pill>
              ) : (
                <Pill tone="warn">
                  <AlertTriangle size={11} aria-hidden="true" /> À confirmer
                </Pill>
              )}
            </div>
          </div>
        ))}
      </div>

      <details className="advanced" style={{ marginTop: 14 }}>
        <summary>Détail technique — noms de colonnes et méthode de reconnaissance</summary>
        <div className="table-scroll" style={{ maxHeight: 320 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Champ interne</th>
                <th>En-tête retenu</th>
                <th>Méthode</th>
                <th className="num">Confiance</th>
              </tr>
            </thead>
            <tbody>
              {fichier.mapping.matches.map(m => (
                <tr key={m.champ}>
                  <td className="mono">{m.champ}</td>
                  <td>{m.enTete ?? '—'}</td>
                  <td>{m.methode}</td>
                  <td className="num">{m.confiance === 0 ? '—' : m.confiance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fichier.mapping.enTetesInconnus.length > 0 && (
          <p className="hint" style={{ marginTop: 10 }}>
            <FileSpreadsheet size={14} aria-hidden="true" /> Colonnes du fichier non utilisées :{' '}
            <span className="mono">{fichier.mapping.enTetesInconnus.join(', ')}</span>
          </p>
        )}
      </details>
    </Panel>
  )
}
