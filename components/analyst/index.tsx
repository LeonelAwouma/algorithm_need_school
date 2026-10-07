'use client'

/**
 * Pages de la Vue analyste : données brutes, vivier, postes, affectations,
 * non affectés et journal de simulation.
 *
 * Elles s'appuient exactement sur les mêmes calculs que la Vue simplifiée — il
 * n'existe qu'un seul moteur — mais exposent les valeurs intermédiaires, les
 * noms techniques et les exports détaillés.
 */

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { PoolTeacher, TeachingPost } from '@/types/simulation'
import { exporterCSV } from '@/lib/reporting/export-csv'
import { LIBELLE_PROXIMITE } from '@/lib/simulation/scoring'
import { DataQualityPanel } from '../data-quality/DataQualityPanel'
import { PropositionsPanel } from '../simulations'
import { DataTable, EmptyState, Notice, Panel, Pill, SearchField, fmt, fmtDec, type Colonne } from '../common'
import type { PlanningStore } from '../usePlanningState'

export function DataPage({ store }: { store: PlanningStore }) {
  const { qualite, fichiers, dataset, diagnostic, setPage } = store

  if (!dataset || !diagnostic) {
    return (
      <EmptyState titre="Aucune donnée chargée" action={{ label: 'Ajouter les données', onClick: () => setPage('import') }}>
        Cette page décrit les fichiers importés, leurs colonnes et leur qualité.
      </EmptyState>
    )
  }

  return (
    <div className="stack">
      <Panel kicker="Source" title="Fichiers analysés">
        <dl className="def-grid">
          <div>
            <dt>Fichier établissements</dt>
            <dd style={{ fontSize: 13 }}>{dataset.sourceFiles.etablissements ?? '—'}</dd>
          </div>
          <div>
            <dt>Fichier enseignants</dt>
            <dd style={{ fontSize: 13 }}>{dataset.sourceFiles.enseignants ?? '—'}</dd>
          </div>
          <div>
            <dt>Établissements lus</dt>
            <dd>{fmt(dataset.schools.length)}</dd>
          </div>
          <div>
            <dt>Enseignants lus</dt>
            <dd>{fmt(dataset.teachers.length)}</dd>
          </div>
          <div>
            <dt>Établissements retenus au diagnostic</dt>
            <dd>{fmt(diagnostic.schools.length)}</dd>
          </div>
          <div>
            <dt>Importé le</dt>
            <dd style={{ fontSize: 13 }}>{new Date(dataset.importedAt).toLocaleString('fr-FR')}</dd>
          </div>
        </dl>
        {dataset.demonstration && (
          <Notice tone="warn" title="Jeu de démonstration.">
            Les valeurs sont fictives et générées localement de façon déterministe.
          </Notice>
        )}
      </Panel>

      {qualite ? (
        <Panel kicker="Contrôle" title="Qualité des données">
          <DataQualityPanel rapport={qualite} />
        </Panel>
      ) : (
        <Notice tone="neutral" title="Pas de rapport qualité.">
          Le jeu de démonstration n’est pas soumis au contrôle qualité : il est produit par l’application elle-même.
        </Notice>
      )}

      {(['etablissements', 'enseignants'] as const).map(kind => {
        const fichier = fichiers[kind]
        if (!fichier) return null
        return (
          <Panel key={kind} kicker={kind === 'etablissements' ? 'Établissements' : 'Enseignants'} title={`Colonnes reconnues — ${fichier.nomFichier}`} flush>
            <DataTable
              lignes={fichier.mapping.matches}
              colonnes={[
                { cle: 'champ', entete: 'Champ interne', rendu: m => <span className="mono">{m.champ}</span>, tri: m => m.champ },
                { cle: 'label', entete: 'Information métier', rendu: m => m.label, tri: m => m.label },
                { cle: 'entete', entete: 'Colonne du fichier', rendu: m => m.enTete ?? '—', tri: m => m.enTete ?? '' },
                { cle: 'methode', entete: 'Reconnaissance', rendu: m => m.methode, tri: m => m.methode },
                { cle: 'confiance', entete: 'Confiance', numerique: true, rendu: m => (m.confiance === 0 ? '—' : m.confiance.toFixed(2)), tri: m => m.confiance },
                { cle: 'requis', entete: 'Requis', rendu: m => (m.requis ? <Pill tone={m.enTete ? 'ok' : 'alert'}>Requis</Pill> : '—') },
              ]}
              cle={m => `${kind}-${m.champ}`}
              taillePage={30}
              legende={`Table de correspondance du fichier ${kind}`}
            />
          </Panel>
        )
      })}
    </div>
  )
}

export function PoolPage({ store }: { store: PlanningStore }) {
  const { resultatComplet, setPage } = store
  const [recherche, setRecherche] = useState('')

  const lignes = useMemo(() => {
    if (!resultatComplet) return []
    const q = recherche.trim().toLowerCase()
    if (!q) return resultatComplet.pool.teachers
    return resultatComplet.pool.teachers.filter(p =>
      `${p.teacher.id} ${p.teacher.nom} ${p.teacher.prenom} ${p.ecoleOrigine.nom}`.toLowerCase().includes(q),
    )
  }, [resultatComplet, recherche])

  if (!resultatComplet) {
    return (
      <EmptyState titre="Aucune simulation exécutée" action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}>
        Le vivier est constitué lors de l’exécution d’un scénario.
      </EmptyState>
    )
  }

  const colonnes: Colonne<PoolTeacher>[] = [
    { cle: 'id', entete: 'Matricule', rendu: p => <span className="mono">{p.teacher.id}</span>, tri: p => p.teacher.id },
    { cle: 'nom', entete: 'Enseignant', rendu: p => `${p.teacher.nom} ${p.teacher.prenom}`, tri: p => p.teacher.nom },
    { cle: 'ecole', entete: 'École d’origine', rendu: p => (<span>{p.ecoleOrigine.nom}<small>{p.teacher.communeAttache}</small></span>), tri: p => p.ecoleOrigine.nom },
    { cle: 'excedent', entete: 'Excédent de l’école', numerique: true, rendu: p => fmt(p.ecoleOrigine.excedentMobilisable), tri: p => p.ecoleOrigine.excedentMobilisable },
    { cle: 'rang', entete: 'Rang dans l’école', numerique: true, rendu: p => fmt(p.rangDansEcole), tri: p => p.rangDansEcole },
    { cle: 'bareme', entete: 'Barème', numerique: true, rendu: p => fmtDec(p.bareme, 2), tri: p => p.bareme },
    { cle: 'affecte', entete: 'Affecté', rendu: p => <Pill tone={p.affecte ? 'ok' : 'neutral'}>{p.affecte ? 'Oui' : 'Non'}</Pill>, tri: p => (p.affecte ? 1 : 0) },
  ]

  return (
    <div className="stack">
      <Panel kicker="Constitution" title="Comment ce vivier a été constitué">
        <dl className="def-grid">
          <div>
            <dt>Excédent théorique total</dt>
            <dd>{fmt(resultatComplet.pool.excedentTotal)}</dd>
          </div>
          <div>
            <dt>Enseignants retenus</dt>
            <dd>{fmt(resultatComplet.pool.teachers.length)}</dd>
          </div>
          <div>
            <dt>Écoles sources</dt>
            <dd>{fmt(resultatComplet.pool.ecolesSources.length)}</dd>
          </div>
          <div>
            <dt>Affectés</dt>
            <dd>{fmt(resultatComplet.pool.teachers.filter(p => p.affecte).length)}</dd>
          </div>
        </dl>
        <h3 style={{ marginTop: 16 }}>Motifs d’exclusion du vivier</h3>
        <table className="compare-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Motif</th>
              <th className="num">Enseignants écartés</th>
            </tr>
          </thead>
          <tbody>
            {resultatComplet.pool.exclusions.map(e => (
              <tr key={e.code}>
                <th scope="row" style={{ fontWeight: 500 }}>
                  {e.label}
                </th>
                <td className="num">{fmt(e.count)}</td>
              </tr>
            ))}
            {resultatComplet.pool.exclusions.length === 0 && (
              <tr>
                <td colSpan={2}>Aucun enseignant écarté.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <div className="filter-bar">
        <SearchField value={recherche} onChange={setRecherche} label="Rechercher dans le vivier" placeholder="Matricule, nom, école…" />
        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              exporterCSV(
                'vivier.csv',
                ['Matricule', 'Nom', 'Prénom', 'École origine', 'Commune', 'Excédent école', 'Rang', 'Barème', 'Affecté'],
                lignes.map(p => [
                  p.teacher.id, p.teacher.nom, p.teacher.prenom, p.ecoleOrigine.nom, p.teacher.communeAttache,
                  p.ecoleOrigine.excedentMobilisable, p.rangDansEcole, p.bareme, p.affecte ? 'Oui' : 'Non',
                ]),
              )
            }
          >
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        </div>
      </div>

      <Panel kicker="Vivier" title={`${fmt(lignes.length)} enseignants mobilisables`} flush>
        <DataTable lignes={lignes} colonnes={colonnes} cle={p => p.teacher.id} legende="Vivier réellement redéployable" />
      </Panel>
    </div>
  )
}

export function PostsPage({ store }: { store: PlanningStore }) {
  const { resultatComplet, setPage } = store
  if (!resultatComplet) {
    return (
      <EmptyState titre="Aucune simulation exécutée" action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}>
        Les postes à couvrir sont construits lors de l’exécution d’un scénario.
      </EmptyState>
    )
  }

  const pourvus = new Set(resultatComplet.assignments.map(a => a.postId))
  const tous: TeachingPost[] = resultatComplet.postes

  const colonnes: Colonne<TeachingPost>[] = [
    { cle: 'rang', entete: 'Rang', numerique: true, rendu: p => fmt(p.rang), tri: p => p.rang },
    { cle: 'id', entete: 'Poste', rendu: p => <span className="mono">{p.id}</span>, tri: p => p.id },
    { cle: 'etab', entete: 'Établissement', rendu: p => (<span><strong>{p.nomEtab || p.schoolId}</strong><small>{p.commune} · {p.departement}</small></span>), tri: p => p.nomEtab },
    { cle: 'region', entete: 'Région', rendu: p => p.region, tri: p => p.region },
    { cle: 'ss', entete: 'Sous-système', rendu: p => (p.sousSysteme === 'anglophone' ? 'Anglophone' : p.sousSysteme === 'francophone' ? 'Francophone' : '—'), tri: p => p.sousSysteme ?? '' },
    { cle: 'w', entete: 'Poids w', numerique: true, rendu: p => fmt(p.priorite.poids), tri: p => p.priorite.poids },
    { cle: 'niveau', entete: 'Niveau', numerique: true, rendu: p => fmt(p.priorite.niveauDifficulte), tri: p => p.priorite.niveauDifficulte },
    { cle: 'beta', entete: 'β', numerique: true, rendu: p => fmt(p.priorite.pointsBesoin), tri: p => p.priorite.pointsBesoin },
    { cle: 'u', entete: 'Indice u', numerique: true, rendu: p => (<span>{fmt(p.priorite.indice)}{p.priorite.zoneRouge && <small>zone rouge</small>}{p.estStructure && <small>structure</small>}</span>), tri: p => p.priorite.indice },
    { cle: 'etat', entete: 'État', rendu: p => <Pill tone={pourvus.has(p.id) ? 'ok' : 'warn'}>{pourvus.has(p.id) ? 'Pourvu (proposition)' : 'Non pourvu'}</Pill>, tri: p => (pourvus.has(p.id) ? 1 : 0) },
  ]

  return (
    <div className="stack">
      <Notice tone="neutral" title="Référentiel des écoles nécessiteuses et des structures d’accueil (§3.1).">
        Un poste = une unité de besoin b d’une école nécessiteuse, ou une place d’une structure fixée par la hiérarchie. Les postes
        sont classés par indice de priorité u = w + β décroissant ; à indice égal, les écoles passent avant les structures, puis
        l’école au REM actuel le plus élevé.
      </Notice>
      <Panel kicker="Postes" title={`${fmt(tous.length)} postes à couvrir`} flush>
        <DataTable lignes={tous} colonnes={colonnes} cle={p => p.id} legende="Postes à couvrir et leur état" />
      </Panel>
    </div>
  )
}

export function AssignmentsPage({ store }: { store: PlanningStore }) {
  const { resultatComplet, setPage } = store
  if (!resultatComplet) {
    return (
      <EmptyState titre="Aucune simulation exécutée" action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}>
        Les propositions d’affectation sont produites par l’exécution d’un scénario.
      </EmptyState>
    )
  }

  return (
    <div className="stack">
      <div className="filter-bar">
        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              exporterCSV(
                'affectations.csv',
                ['Phase', 'Poste', 'Matricule', 'Nom', 'Prénom', 'École origine', 'Commune origine', 'École destination', 'Commune destination', 'Périmètre', 'Barème', 'Score'],
                resultatComplet.assignments.map(a => [
                  a.phase, a.postId, a.teacherId, a.nomEns, a.prenomEns, a.nomEtabOrigine, a.communeOrigine,
                  a.nomEtabDestination, a.communeDestination, LIBELLE_PROXIMITE[a.niveauProximite], a.bareme, a.score,
                ]),
              )
            }
          >
            <Download size={13} aria-hidden="true" /> Exporter (CSV)
          </button>
        </div>
      </div>
      <PropositionsPanel key={resultatComplet.scenarioId} resultat={resultatComplet} analyste />
    </div>
  )
}

export function UnassignedPage({ store }: { store: PlanningStore }) {
  const { resultatComplet, setPage } = store
  if (!resultatComplet) {
    return (
      <EmptyState titre="Aucune simulation exécutée" action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}>
        Cette page liste les enseignants du vivier pour lesquels aucun poste compatible n’a été trouvé.
      </EmptyState>
    )
  }

  const colonnes: Colonne<PoolTeacher>[] = [
    { cle: 'id', entete: 'Matricule', rendu: p => <span className="mono">{p.teacher.id}</span>, tri: p => p.teacher.id },
    { cle: 'nom', entete: 'Enseignant', rendu: p => `${p.teacher.nom} ${p.teacher.prenom}`, tri: p => p.teacher.nom },
    { cle: 'ecole', entete: 'École d’origine', rendu: p => p.ecoleOrigine.nom, tri: p => p.ecoleOrigine.nom },
    { cle: 'commune', entete: 'Commune', rendu: p => p.teacher.communeAttache, tri: p => p.teacher.communeAttache },
    { cle: 'departement', entete: 'Département', rendu: p => p.teacher.departementAttache, tri: p => p.teacher.departementAttache },
    { cle: 'bareme', entete: 'Barème', numerique: true, rendu: p => fmtDec(p.bareme, 2), tri: p => p.bareme },
  ]

  return (
    <div className="stack">
      <Notice tone="neutral" title="Pourquoi un enseignant reste non affecté.">
        Aucun poste ouvert ne se trouvait dans son périmètre autorisé, ou tous les postes de ce périmètre avaient déjà été
        pourvus par des enseignants mieux classés.
      </Notice>
      <Panel kicker="Vivier" title={`${fmt(resultatComplet.unmatchedTeachers.length)} enseignants non affectés`} flush>
        <DataTable
          lignes={resultatComplet.unmatchedTeachers}
          colonnes={colonnes}
          cle={p => p.teacher.id}
          legende="Enseignants du vivier sans proposition"
          messageVide="Tous les enseignants du vivier ont reçu une proposition."
        />
      </Panel>
    </div>
  )
}

export function LogsPage({ store }: { store: PlanningStore }) {
  const { resultatComplet, setPage } = store
  if (!resultatComplet) {
    return (
      <EmptyState titre="Aucune simulation exécutée" action={{ label: 'Créer un scénario', onClick: () => setPage('simulations') }}>
        Le journal retrace chaque étape de la dernière simulation.
      </EmptyState>
    )
  }

  return (
    <div className="stack">
      <Panel kicker="Exécution" title={`Journal — ${resultatComplet.scenarioNom}`} hint={`Calculé le ${new Date(resultatComplet.computedAt).toLocaleString('fr-FR')}.`}>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Étape</th>
              <th>Détail</th>
              <th className="num">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {resultatComplet.logs.map((l, i) => (
              <tr key={`${l.etape}-${i}`}>
                <th scope="row">{l.etape}</th>
                <td>{l.message}</td>
                <td className="num">{l.valeur == null ? '—' : fmt(l.valeur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel
        kicker="Acceptation différée (§3.4)"
        title="Tours de l’algorithme d’appariement"
        hint={`Chaque tour : les candidats libres demandent l’école suivante de leur liste ; chaque école garde provisoirement les mieux classés et refuse les autres.${resultatComplet.toursTronques ? ' Seuls les premiers tours de chaque niveau sont conservés.' : ''}`}
      >
        {resultatComplet.tours.length === 0 ? (
          <p className="hint">Aucune demande de mutation recevable : l’algorithme n’a pas eu de tour à jouer.</p>
        ) : (
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th className="num">Tour</th>
                  <th className="num">Demandes</th>
                  <th>Écoles et candidats gardés provisoirement</th>
                  <th>Refusés</th>
                </tr>
              </thead>
              <tbody>
                {resultatComplet.tours.map(t => (
                  <tr key={`${t.niveau}-${t.tour}`}>
                    <th scope="row">{t.niveau}</th>
                    <td className="num">{t.tour}</td>
                    <td className="num">{fmt(t.demandes.length)}</td>
                    <td>
                      {t.gardes
                        .slice(0, 12)
                        .map(g => `${g.schoolId} : ${g.teacherIds.join(', ') || '—'}`)
                        .join(' · ')}
                      {t.gardes.length > 12 ? ' …' : ''}
                    </td>
                    <td>{t.refuses.length === 0 ? '—' : `${t.refuses.slice(0, 12).join(', ')}${t.refuses.length > 12 ? ' …' : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel kicker="Contrôles" title="Invariants métier vérifiés après simulation">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Contrôle</th>
              <th>Résultat</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {resultatComplet.invariants.map(i => (
              <tr key={i.code}>
                <th scope="row">{i.label}</th>
                <td>
                  <Pill tone={i.ok ? 'ok' : 'alert'}>{i.ok ? 'Conforme' : 'Écart détecté'}</Pill>
                </td>
                <td>{i.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
