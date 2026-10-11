'use client'

/**
 * Liste des enseignants.
 *
 * La colonne « Mobilisable » explique, enseignant par enseignant, pourquoi il
 * entre ou non dans le vivier de redéploiement : c'est la traduction lisible de
 * la règle d'excédent, qui est le cœur de la logique métier.
 */

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { Teacher } from '@/types/education'
import { exporterCSV } from '@/lib/reporting/export-csv'
import { calculerBaremeIndividuel, detaillerBareme, pointsSituation } from '@/lib/simulation/scoring'
import { libelleSituation, normaliserSituation } from '@/lib/data/situation-familiale'
import { estEligibleAdministrativement } from '@/lib/simulation/pool'
import { DataTable, EmptyState, Notice, Panel, Pill, SearchField, fmt, fmtDec, type Colonne } from '../common'
import type { PlanningStore } from '../usePlanningState'

interface LigneEnseignant {
  teacher: Teacher
  bareme: number
  ecoleNom: string
  mobilisable: boolean
  motif: string
}

export function TeachersPage({ store }: { store: PlanningStore }) {
  const { dataset, diagnostic, settings, resultatComplet, setPage, ouvrirEcole } = store
  const [recherche, setRecherche] = useState('')
  const [filtreMobilisable, setFiltreMobilisable] = useState<'tous' | 'oui' | 'non'>('tous')
  const [detail, setDetail] = useState<LigneEnseignant | null>(null)

  const lignes = useMemo<LigneEnseignant[]>(() => {
    if (!dataset || !diagnostic) return []
    const dansVivier = new Set(resultatComplet?.pool.teachers.map(p => p.teacher.id) ?? [])

    return dataset.teachers.map(t => {
      const ecole = diagnostic.bySchoolId[t.idEtabAttache]
      const eligibilite = estEligibleAdministrativement(t, settings)

      let mobilisable = false
      let motif: string

      if (t.faitPrinceId) {
        motif = 'Redéployé par fait de Prince (décision de la DRH) : non remis en cause par l’algorithme'
      } else if (!eligibilite.ok) {
        motif = `Non éligible : ${eligibilite.label}`
      } else if (!ecole) {
        motif = "École de rattachement absente du fichier établissements"
      } else if (ecole.excedentTheorique <= 0) {
        motif = `Son école n’a pas d’excédent (${ecole.enseignantsEtat} enseignants pour un minimum de ${ecole.enseignantsMinimumAConserver})`
      } else if (resultatComplet && !dansVivier.has(t.id)) {
        motif = `Au-delà de l’excédent de son école (${ecole.excedentTheorique} place(s) mobilisable(s))`
      } else {
        mobilisable = true
        motif = `Son école dispose d’un excédent de ${ecole.excedentTheorique} enseignant(s)`
      }

      return {
        teacher: t,
        bareme: calculerBaremeIndividuel(t, settings, ecole?.priorite.niveauDifficulte ?? null),
        ecoleNom: ecole?.school.nom || t.idEtabAttache,
        mobilisable,
        motif,
      }
    })
  }, [dataset, diagnostic, settings, resultatComplet])

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes.filter(l => {
      if (filtreMobilisable === 'oui' && !l.mobilisable) return false
      if (filtreMobilisable === 'non' && l.mobilisable) return false
      if (!q) return true
      return `${l.teacher.id} ${l.teacher.nom} ${l.teacher.prenom} ${l.ecoleNom} ${l.teacher.communeAttache}`.toLowerCase().includes(q)
    })
  }, [lignes, recherche, filtreMobilisable])

  if (!dataset || !diagnostic) {
    return (
      <EmptyState titre="Aucun enseignant chargé" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        La liste du personnel provient du fichier des enseignants.
      </EmptyState>
    )
  }

  const colonnes: Colonne<LigneEnseignant>[] = [
    {
      cle: 'nom',
      entete: 'Enseignant',
      rendu: l => (
        <span>
          <strong>
            {l.teacher.nom} {l.teacher.prenom}
          </strong>
          <small>{l.teacher.id}</small>
          {l.teacher.faitPrinceId && <Pill tone="info">Fait de Prince</Pill>}
        </span>
      ),
      tri: l => `${l.teacher.nom} ${l.teacher.prenom}`,
    },
    {
      cle: 'ecole',
      entete: 'École de rattachement',
      rendu: l => (
        <button type="button" className="row-action" onClick={() => ouvrirEcole(l.teacher.idEtabAttache)}>
          <strong>{l.ecoleNom}</strong>
          <small>
            {l.teacher.communeAttache} · {l.teacher.departementAttache}
          </small>
        </button>
      ),
      tri: l => l.ecoleNom,
    },
    { cle: 'age', entete: 'Âge', numerique: true, rendu: l => (l.teacher.age == null ? '—' : fmt(Math.floor(l.teacher.age))), tri: l => l.teacher.age ?? -1 },
    { cle: 'carriere', entete: 'Ancienneté carrière', numerique: true, rendu: l => fmtDec(l.teacher.ancienneteCarriereAns, 0), tri: l => l.teacher.ancienneteCarriereAns },
    { cle: 'poste', entete: 'Ancienneté poste', numerique: true, rendu: l => fmtDec(l.teacher.anciennetePosteAns, 0), tri: l => l.teacher.anciennetePosteAns },
    {
      cle: 'situation',
      entete: 'Situation familiale',
      rendu: l => {
        const points = pointsSituation(l.teacher.situationFamiliale, settings.scoring)
        const reconnue = normaliserSituation(l.teacher.situationFamiliale) !== null
        return (
          <span>
            <strong>{libelleSituation(l.teacher.situationFamiliale)}</strong>
            <small>
              {points > 0
                ? `${points} point(s) au barème`
                : reconnue
                  ? 'aucun point paramétré'
                  : l.teacher.situationFamiliale.trim()
                    ? 'valeur non reconnue : 0 point'
                    : 'non renseignée : 0 point'}
            </small>
          </span>
        )
      },
      tri: l => libelleSituation(l.teacher.situationFamiliale),
    },
    { cle: 'enfants', entete: 'Enfants', numerique: true, rendu: l => fmt(l.teacher.nbEnfants), tri: l => l.teacher.nbEnfants },
    { cle: 'formation', entete: 'Formations', numerique: true, rendu: l => fmt(l.teacher.formationContinue), tri: l => l.teacher.formationContinue },
    {
      cle: 'bareme',
      entete: 'Barème',
      numerique: true,
      rendu: l => (
        <button type="button" className="row-action" onClick={() => setDetail(l)} title="Voir le détail du barème">
          {fmtDec(l.bareme, 2)}
        </button>
      ),
      tri: l => l.bareme,
    },
    {
      cle: 'mobilisable',
      entete: 'Mobilisable',
      rendu: l => (
        <span>
          <Pill tone={l.mobilisable ? 'ok' : 'neutral'}>{l.mobilisable ? '✓ Oui' : '— Non'}</Pill>
          <small style={{ maxWidth: 340 }}>{l.motif}</small>
        </span>
      ),
      tri: l => (l.mobilisable ? 1 : 0),
    },
  ]

  return (
    <div className="stack">
      <Notice tone="neutral" title="Mobilisable ne veut pas dire muté.">
        Un enseignant n’est considéré comme mobilisable que si son départ ne crée pas de déficit dans son établissement
        d’origine. Cette information décrit une possibilité arithmétique, pas une décision.
      </Notice>

      <div className="filter-bar">
        <SearchField value={recherche} onChange={setRecherche} label="Rechercher un enseignant" placeholder="Nom, matricule, école, commune…" />
        <div className="field">
          <label htmlFor="f-mobilisable">Mobilisable</label>
          <select id="f-mobilisable" value={filtreMobilisable} onChange={e => setFiltreMobilisable(e.target.value as 'tous' | 'oui' | 'non')}>
            <option value="tous">Tous les enseignants</option>
            <option value="oui">Uniquement les mobilisables</option>
            <option value="non">Uniquement les non mobilisables</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              exporterCSV(
                'enseignants.csv',
                ['Matricule', 'Nom', 'Prénom', 'École', 'Commune', 'Département', 'Âge', 'Ancienneté carrière', 'Ancienneté poste', 'Situation familiale (déclarée)', 'Situation familiale (retenue)', 'Points situation', 'Nombre d’enfants', 'Formations continues', 'Statut', 'Barème', 'Mobilisable', 'Motif'],
                filtrees.map(l => [
                  l.teacher.id, l.teacher.nom, l.teacher.prenom, l.ecoleNom, l.teacher.communeAttache, l.teacher.departementAttache,
                  l.teacher.age == null ? null : Math.floor(l.teacher.age),
                  l.teacher.ancienneteCarriereAns, l.teacher.anciennetePosteAns,
                  l.teacher.situationFamiliale,
                  libelleSituation(l.teacher.situationFamiliale),
                  pointsSituation(l.teacher.situationFamiliale, settings.scoring),
                  l.teacher.nbEnfants, l.teacher.formationContinue, l.teacher.statut,
                  l.bareme, l.mobilisable ? 'Oui' : 'Non', l.motif,
                ]),
              )
            }
          >
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        </div>
      </div>

      {detail && (
        <Panel
          kicker="Barème individuel"
          title={`Comment le barème de ${detail.teacher.nom} ${detail.teacher.prenom} est calculé`}
          hint="Ce barème classe les enseignants d’une même école : il détermine lesquels partiraient en premier."
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setDetail(null)}>
              Fermer
            </button>
          }
        >
          <table className="compare-table">
            <thead>
              <tr>
                <th>Critère</th>
                <th className="num">Valeur</th>
                <th className="num">Poids</th>
                <th className="num">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {detaillerBareme(detail.teacher, settings, diagnostic?.bySchoolId[detail.teacher.idEtabAttache]?.priorite.niveauDifficulte ?? null).components.map(c => (
                <tr key={c.label}>
                  <th scope="row" style={{ fontWeight: 500 }}>
                    {c.label}
                  </th>
                  <td className="num">{c.valeur.toLocaleString('fr-FR')}</td>
                  <td className="num">{c.poids}</td>
                  <td className="num">{c.contribution.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Barème total</th>
                <td className="num" colSpan={3}>
                  <strong>{fmtDec(detail.bareme, 2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            Les poids de chaque critère se règlent dans « Configuration du moteur » (Vue analyste).
          </p>
        </Panel>
      )}

      <Panel kicker="Personnel" title={`${fmt(filtrees.length)} enseignants`} flush>
        <DataTable
          lignes={filtrees}
          colonnes={colonnes}
          cle={l => `${l.teacher.id}-${l.teacher.ligneSource}`}
          legende="Liste des enseignants et éligibilité au redéploiement"
          messageVide="Aucun enseignant ne correspond à cette recherche."
        />
      </Panel>
    </div>
  )
}
