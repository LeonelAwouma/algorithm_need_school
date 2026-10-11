'use client'

/**
 * Fait de Prince — redéploiements décidés par la DRH.
 *
 * Cette page est la seule de l'application où l'utilisateur décide au lieu de
 * simuler. Une décision enregistrée ici n'est pas une proposition : elle est
 * appliquée aux données, sans aucun contrôle de l'algorithme. L'impact prévisible
 * est montré avant validation, à titre d'information ; il n'empêche jamais la
 * décision.
 *
 * Une fois enregistrée, la décision devient un fait acquis : le diagnostic et
 * toutes les simulations sont recalculés en la prenant pour donnée de départ.
 */

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, Crown, Download, Trash2, Upload } from 'lucide-react'
import { analyserFichierPrince } from '@/lib/data/prince-import'
import type { SchoolDiagnostic, Teacher } from '@/types/education'
import { exporterCSV } from '@/lib/reporting/export-csv'
import { LIBELLE_STATUT_PRINCE, simulerImpactPrince } from '@/lib/simulation/prince'
import { normalizeLabel } from '@/lib/data/normalize'
import { rapprocherSaisie } from '@/lib/data/rapprochement'
import { DataTable, EmptyState, Notice, Panel, Pill, fmt, type Colonne } from '../common'
import type { PlanningStore } from '../usePlanningState'

/** Nombre de suggestions proposées pendant la frappe. */
const MAX_SUGGESTIONS = 40

export function PrincePage({ store }: { store: PlanningStore }) {
  const {
    dataset,
    datasetImporte,
    diagnostic,
    diagnosticSansPrince,
    settings,
    faitsPrince,
    faitsPrinceAppliques,
    nbFaitsPrinceActifs,
    ajouterFaitPrince,
    annulerFaitPrince,
    setPage,
    ouvrirEcole,
  } = store

  const [saisieEns, setSaisieEns] = useState('')
  const [saisieEcole, setSaisieEcole] = useState('')
  /** Matricule retenu quand plusieurs enseignants portent le nom saisi. */
  const [choixHomonyme, setChoixHomonyme] = useState('')
  const [reference, setReference] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  /** Enseignants encore redéployables à la main : ceux qui n'ont pas déjà une décision. */
  const enseignantsDisponibles = useMemo(() => {
    if (!datasetImporte) return []
    const deja = new Set(faitsPrince.map(e => e.teacherId))
    return datasetImporte.teachers.filter(t => !deja.has(t.id))
  }, [datasetImporte, faitsPrince])

  /** Écoles proposées : les plus en déficit d'abord, ce sont les destinations les plus probables. */
  const ecolesDisponibles = useMemo(() => {
    if (!diagnostic) return []
    return [...diagnostic.schools].sort(
      (a, b) => b.besoinTheorique - a.besoinTheorique || a.school.nom.localeCompare(b.school.nom, 'fr'),
    )
  }, [diagnostic])

  /** L'enseignant désigné par la saisie : par son nom, son prénom ou son matricule. */
  const rapprochementEns = useMemo(
    () =>
      rapprocherSaisie(
        saisieEns,
        enseignantsDisponibles,
        t => t.id,
        t => [`${t.nom} ${t.prenom}`, `${t.prenom} ${t.nom}`, t.nom],
      ),
    [saisieEns, enseignantsDisponibles],
  )

  // Des homonymes existent dans tout fichier de personnel : quand la saisie en
  // désigne plusieurs, c'est l'utilisateur qui tranche, jamais l'application.
  const enseignant: Teacher | null = useMemo(() => {
    if (choixHomonyme) return rapprochementEns.candidats.find(t => t.id === choixHomonyme) ?? null
    return rapprochementEns.trouve
  }, [rapprochementEns, choixHomonyme])

  /** L'école désignée par la saisie : par son nom ou son code. */
  const rapprochementEcole = useMemo(
    () =>
      rapprocherSaisie(
        saisieEcole,
        ecolesDisponibles,
        d => d.school.id,
        d => [d.school.nom, `${d.school.nom} ${d.school.commune}`],
      ),
    [saisieEcole, ecolesDisponibles],
  )
  const destination: SchoolDiagnostic | null = rapprochementEcole.trouve

  /** Suggestions affichées pendant la frappe, pour guider sans imposer. */
  const suggestionsEns = useMemo(() => {
    const q = normalizeLabel(saisieEns)
    const liste = q
      ? enseignantsDisponibles.filter(t => normalizeLabel(`${t.nom} ${t.prenom} ${t.id} ${t.communeAttache}`).includes(q))
      : enseignantsDisponibles
    return liste.slice(0, MAX_SUGGESTIONS)
  }, [saisieEns, enseignantsDisponibles])

  const suggestionsEcoles = useMemo(() => {
    const q = normalizeLabel(saisieEcole)
    const liste = q
      ? ecolesDisponibles.filter(d => normalizeLabel(`${d.school.nom} ${d.school.commune} ${d.school.id}`).includes(q))
      : ecolesDisponibles
    return liste.slice(0, MAX_SUGGESTIONS)
  }, [saisieEcole, ecolesDisponibles])
  // L'origine est lue sur le diagnostic « sans fait de Prince » : c'est la situation
  // réelle de l'école avant cette décision-ci.
  const origine: SchoolDiagnostic | null = useMemo(
    () => (enseignant && diagnosticSansPrince ? diagnosticSansPrince.bySchoolId[enseignant.idEtabAttache] ?? null : null),
    [enseignant, diagnosticSansPrince],
  )

  const impact = useMemo(
    () => (enseignant && destination ? simulerImpactPrince(enseignant, origine, destination, settings) : null),
    [enseignant, destination, origine, settings],
  )

  if (!dataset || !diagnostic) {
    return (
      <EmptyState titre="Aucune donnée chargée" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Les redéploiements décidés par la DRH s’appliquent aux enseignants et aux écoles du fichier importé.
      </EmptyState>
    )
  }

  function enregistrer() {
    const verdict = ajouterFaitPrince(enseignant, destination, reference)
    if (!verdict.ok) {
      setErreur(verdict.motif)
      setConfirmation(null)
      return
    }
    setConfirmation(
      `${enseignant?.nom} ${enseignant?.prenom} est désormais rattaché à ${destination?.school.nom}. Le diagnostic et les simulations ont été recalculés.`,
    )
    setErreur(null)
    setSaisieEns('')
    setSaisieEcole('')
    setChoixHomonyme('')
    setReference('')
  }

  const colonnes: Colonne<(typeof faitsPrinceAppliques)[number]>[] = [
    {
      cle: 'ens',
      entete: 'Enseignant',
      rendu: a => (
        <span>
          <strong>{a.fait.enseignant}</strong>
          <small>{a.fait.teacherId}</small>
        </span>
      ),
      tri: a => a.fait.enseignant,
    },
    {
      cle: 'mouvement',
      entete: 'Redéploiement',
      rendu: a => (
        <span>
          <button type="button" className="row-action" onClick={() => ouvrirEcole(a.fait.origine.id)}>
            {a.fait.origine.nom}
          </button>
          <small>
            <ArrowRight size={11} aria-hidden="true" /> {a.fait.destination.nom} ({a.fait.destination.commune})
          </small>
        </span>
      ),
      tri: a => a.fait.destination.nom,
    },
    {
      cle: 'date',
      entete: 'Décidé le',
      rendu: a => new Date(a.fait.decideLe).toLocaleDateString('fr-FR'),
      tri: a => a.fait.decideLe,
    },
    { cle: 'ref', entete: 'Référence', rendu: a => a.fait.reference || '—', tri: a => a.fait.reference },
    {
      cle: 'statut',
      entete: 'État',
      rendu: a => (
        <span>
          <Pill tone={a.statut === 'applique' ? 'ok' : 'warn'}>{LIBELLE_STATUT_PRINCE[a.statut]}</Pill>
          {a.statut !== 'applique' && <small style={{ maxWidth: 320 }}>{a.motif}</small>}
        </span>
      ),
      tri: a => a.statut,
    },
    {
      cle: 'annuler',
      entete: '',
      rendu: a => (
        <button
          type="button"
          className="row-action row-action-danger"
          onClick={() => {
            annulerFaitPrince(a.fait.id)
            setConfirmation(`Décision annulée : ${a.fait.enseignant} retrouve son école d’origine.`)
          }}
        >
          <Trash2 size={12} aria-hidden="true" /> Annuler
        </button>
      ),
    },
  ]

  return (
    <div className="stack">
      <Notice tone="warn" title="Décision, et non simulation.">
        Un fait de Prince redéploie un enseignant à la seule volonté de la DRH : ni l’ancienneté, ni l’âge, ni le statut,
        ni l’excédent de l’école d’origine, ni le besoin de l’école de destination ne sont contrôlés. Une fois enregistré, il
        devient une donnée de départ : le diagnostic et toutes les simulations le prennent en compte, et l’algorithme ne remet
        jamais cet enseignant en mouvement.
      </Notice>

      {confirmation && (
        <Notice tone="info" title="Enregistré.">
          {confirmation}
        </Notice>
      )}

      <Panel
        kicker="Nouvelle décision"
        title="Redéployer un enseignant"
        hint="Saisissez le nom de l’enseignant et celui de l’école où le déployer. Les suggestions apparaissent pendant la frappe ; les conséquences sont affichées avant validation."
      >
        <div className="grid-2 prince-saisie">
          <div className="field">
            <label htmlFor="prince-ens">Nom de l’enseignant à redéployer</label>
            <input
              id="prince-ens"
              type="text"
              list="prince-ens-liste"
              autoComplete="off"
              value={saisieEns}
              onChange={e => {
                setSaisieEns(e.target.value)
                setChoixHomonyme('')
              }}
              placeholder="Tapez le nom, le prénom ou le matricule…"
            />
            <datalist id="prince-ens-liste">
              {suggestionsEns.map(t => (
                <option key={t.id} value={t.id}>
                  {t.nom} {t.prenom} · {t.communeAttache}
                </option>
              ))}
            </datalist>
            {enseignant ? (
              <span className="prince-trouve">
                <Check size={13} aria-hidden="true" /> {enseignant.nom} {enseignant.prenom} ({enseignant.id}) — actuellement à{' '}
                {origine?.school.nom ?? enseignant.idEtabAttache}
              </span>
            ) : rapprochementEns.candidats.length > 0 ? (
              <div className="prince-homonymes">
                <span className="hint">
                  {fmt(rapprochementEns.candidats.length)} enseignants portent ce nom. Lequel redéployer ?
                </span>
                <ul>
                  {rapprochementEns.candidats.slice(0, 8).map(t => (
                    <li key={t.id}>
                      <button type="button" className="btn btn-sm" onClick={() => setChoixHomonyme(t.id)}>
                        {t.nom} {t.prenom} — {t.id} ({t.communeAttache})
                      </button>
                    </li>
                  ))}
                </ul>
                {rapprochementEns.candidats.length > 8 && (
                  <span className="hint">
                    {fmt(rapprochementEns.candidats.length - 8)} autres ne sont pas listés : saisissez le matricule pour trancher.
                  </span>
                )}
              </div>
            ) : (
              <span className="hint">
                {saisieEns.trim()
                  ? 'Aucun enseignant ne correspond : vérifiez le nom ou saisissez le matricule.'
                  : `${fmt(enseignantsDisponibles.length)} enseignants disponibles.`}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="prince-ecole">École où le déployer</label>
            <input
              id="prince-ecole"
              type="text"
              list="prince-ecole-liste"
              autoComplete="off"
              value={saisieEcole}
              onChange={e => setSaisieEcole(e.target.value)}
              placeholder="Tapez le nom de l’école ou son code…"
            />
            <datalist id="prince-ecole-liste">
              {suggestionsEcoles.map(d => (
                <option key={d.school.id} value={d.school.nom}>
                  {d.school.commune} · {d.besoinTheorique > 0 ? `${d.besoinTheorique} poste(s) manquant(s)` : 'aucun poste manquant'}
                </option>
              ))}
            </datalist>
            {destination ? (
              <span className="prince-trouve">
                <Check size={13} aria-hidden="true" /> {destination.school.nom} ({destination.school.commune}) —{' '}
                {destination.besoinTheorique > 0 ? `${destination.besoinTheorique} poste(s) manquant(s)` : 'aucun poste manquant'}
              </span>
            ) : rapprochementEcole.candidats.length > 0 ? (
              <div className="prince-homonymes">
                <span className="hint">{fmt(rapprochementEcole.candidats.length)} écoles correspondent. Laquelle ?</span>
                <ul>
                  {rapprochementEcole.candidats.slice(0, 6).map(d => (
                    <li key={d.school.id}>
                      <button type="button" className="btn btn-sm" onClick={() => setSaisieEcole(d.school.nom)}>
                        {d.school.nom} — {d.school.commune}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span className="hint">
                {saisieEcole.trim()
                  ? 'Aucune école ne correspond : vérifiez le nom ou saisissez le code.'
                  : `${fmt(ecolesDisponibles.length)} écoles disponibles.`}
              </span>
            )}
          </div>
        </div>

        <div className="field" style={{ marginTop: 14, maxWidth: 460 }}>
          <label htmlFor="prince-ref">Référence de la décision (facultatif)</label>
          <input
            id="prince-ref"
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Note de service, courrier, numéro de décision…"
          />
        </div>

        {impact && enseignant && destination && (
          <div className="prince-impact">
            <h3>Conséquences de cette décision</h3>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Établissement</th>
                  <th className="num">Enseignants État</th>
                  <th className="num">Postes manquants</th>
                  <th className="num">Excédent mobilisable</th>
                </tr>
              </thead>
              <tbody>
                {impact.origine && (
                  <tr>
                    <th scope="row">
                      Origine — {impact.origine.nom}
                    </th>
                    <td className="num">
                      {fmt(impact.origine.effectifAvant)} → <strong>{fmt(impact.origine.effectifApres)}</strong>
                    </td>
                    <td className="num">
                      {fmt(impact.origine.besoinAvant)} → <strong>{fmt(impact.origine.besoinApres)}</strong>
                    </td>
                    <td className="num">
                      {fmt(impact.origine.excedentAvant)} → <strong>{fmt(impact.origine.excedentApres)}</strong>
                    </td>
                  </tr>
                )}
                <tr>
                  <th scope="row">Destination — {impact.destination.nom}</th>
                  <td className="num">
                    {fmt(impact.destination.effectifAvant)} → <strong>{fmt(impact.destination.effectifApres)}</strong>
                  </td>
                  <td className="num">
                    {fmt(impact.destination.besoinAvant)} → <strong>{fmt(impact.destination.besoinApres)}</strong>
                  </td>
                  <td className="num">
                    {fmt(impact.destination.excedentAvant)} → <strong>{fmt(impact.destination.excedentApres)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>

            {impact.observations.length > 0 && (
              <ul className="reason-list" style={{ marginTop: 12 }}>
                {impact.observations.map(o => (
                  <li key={o}>
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint" style={{ marginTop: 10 }}>
              Ces observations sont informatives : elles n’empêchent pas la décision.
            </p>
          </div>
        )}

        {erreur && (
          <Notice tone="alert" title="Décision impossible.">
            {erreur}
          </Notice>
        )}

        <div className="topbar-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-primary" disabled={!enseignant || !destination} onClick={enregistrer}>
            <Crown size={15} aria-hidden="true" /> Enregistrer ce redéploiement
          </button>
          {(saisieEns || saisieEcole || reference) && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSaisieEns('')
                setSaisieEcole('')
                setChoixHomonyme('')
                setReference('')
                setErreur(null)
              }}
            >
              Effacer la saisie
            </button>
          )}
        </div>
      </Panel>

      <ImportPrince store={store} />

      <Panel
        kicker="Décisions enregistrées"
        title={`${fmt(nbFaitsPrinceActifs)} redéploiement(s) en vigueur`}
        hint="Annuler une décision rend l’enseignant à son école d’origine et relance immédiatement les calculs."
        actions={
          faitsPrinceAppliques.length > 0 ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                exporterCSV(
                  `faits-de-prince-${settings.anneeScolaire}.csv`,
                  ['Matricule', 'Enseignant', 'École origine', 'Commune origine', 'École destination', 'Commune destination', 'Décidé le', 'Référence', 'État'],
                  faitsPrinceAppliques.map(a => [
                    a.fait.teacherId,
                    a.fait.enseignant,
                    a.fait.origine.nom,
                    a.fait.origine.commune,
                    a.fait.destination.nom,
                    a.fait.destination.commune,
                    new Date(a.fait.decideLe).toLocaleDateString('fr-FR'),
                    a.fait.reference,
                    LIBELLE_STATUT_PRINCE[a.statut],
                  ]),
                )
              }
            >
              <Download size={13} aria-hidden="true" /> Exporter (CSV)
            </button>
          ) : undefined
        }
        flush
      >
        <DataTable
          lignes={faitsPrinceAppliques}
          colonnes={colonnes}
          cle={a => a.fait.id}
          taillePage={15}
          legende="Redéploiements décidés par la DRH"
          messageVide="Aucun redéploiement n’a encore été décidé. Les chiffres de l’application reflètent uniquement les données importées."
        />
      </Panel>
    </div>
  )
}

/** Import d'un lot de décisions depuis un classeur ou un fichier CSV. */
function ImportPrince({ store }: { store: PlanningStore }) {
  const { datasetImporte, diagnosticSansPrince, ajouterFaitsPrinceEnLot } = store
  const inputRef = useRef<HTMLInputElement>(null)
  const [bilan, setBilan] = useState<{ acceptees: number; refus: string[] } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger(file?: File) {
    if (!file || !datasetImporte || !diagnosticSansPrince) return
    setErreur(null)
    setBilan(null)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true }) as unknown[][]
      const { lignes, manquantes } = analyserFichierPrince(rows, datasetImporte.teachers, diagnosticSansPrince.schools)
      if (manquantes.length > 0) {
        setErreur(`Colonnes introuvables : ${manquantes.join(', ')}.`)
        return
      }
      const introuvables = lignes.filter(l => l.erreur).map(l => `ligne ${l.ligne} : ${l.erreur}`)
      const resultat = ajouterFaitsPrinceEnLot(lignes.filter(l => !l.erreur))
      setBilan({ acceptees: resultat.acceptees, refus: [...introuvables, ...resultat.refus] })
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Panel
      kicker="Import"
      title="Importer un lot de décisions"
      hint="Une ligne par décision : matricule de l’enseignant (« id_ens » ou « Matricule_Enseignant »), école de destination (« id_etab » ou « Identifiant_Ecole ») et, facultativement, le motif ou la référence de la décision."
      actions={
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={!datasetImporte}>
          <Upload size={13} aria-hidden="true" /> Importer un fichier
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={e => {
          void charger(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {erreur && <Notice tone="alert">{erreur}</Notice>}
      {bilan && (
        <Notice tone={bilan.refus.length ? 'warn' : 'info'} title={`${fmt(bilan.acceptees)} décision(s) enregistrée(s).`}>
          {bilan.refus.length > 0 ? `${fmt(bilan.refus.length)} ligne(s) écartée(s) : ${bilan.refus.slice(0, 6).join(' ; ')}${bilan.refus.length > 6 ? '…' : ''}` : 'Toutes les lignes ont été appliquées.'}
        </Notice>
      )}
      {!bilan && !erreur && <p className="hint">Chaque décision est contrôlée comme une saisie manuelle : enseignant et école connus, pas de double redéploiement.</p>}
    </Panel>
  )
}
