'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Database,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Info,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserX,
  Users,
} from 'lucide-react'
import { readFirstWorksheetRows } from '@/lib/read-workbook'
import { KEY_INDICATORS, MENU_SECTIONS, METHOD_RULES } from '@/lib/methodology'
import {
  DEFAULT_CONFIG,
  exportAffectationsXlsx,
  parseAffectationRows,
  runAffectation,
  type AffectationConfig,
  type ResultatAffectation,
} from '@/lib/affectation-engine'

type PageKey = 'dashboard' | 'imports' | 'needs' | 'suppliers' | 'assignments' | 'unassigned' | 'openPosts' | 'pool' | 'method' | 'settings'
type ImportStatus = 'missing' | 'ready' | 'invalid'
type ImportId = 'etablissements' | 'enseignants'

interface ImportSlotDef { id: ImportId; title: string; description: string }
interface ImportSlot extends ImportSlotDef { status: ImportStatus; rows: number; fileName: string | null; error: string | null }

const IMPORT_SLOTS: ImportSlotDef[] = [
  { id: 'etablissements', title: 'Établissements', description: 'id_etab, nom_etab, commune, departement, region, zone, nb_classes, nb_enseignants_etat, nb_postes_ouverts, classes_multigrades, priorite_locale, type_etab' },
  { id: 'enseignants', title: 'Enseignants', description: 'id_ens, nom, prenom, date_naissance, id_etab_attache, commune_attache, departement_attache, zone_attache, anciennete_carriere_ans, anciennete_poste_ans, situation_familiale, nb_enfants, formation_continue, statut, paye_par_etat' },
]

const navItems: { id: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'imports', label: 'Importation des données', icon: Upload },
  { id: 'needs', label: 'Écoles en besoin', icon: GraduationCap },
  { id: 'suppliers', label: 'Écoles fournisseurs', icon: Building2 },
  { id: 'assignments', label: 'Affectations proposées', icon: ArrowRight },
  { id: 'unassigned', label: 'Enseignants non affectés', icon: UserX },
  { id: 'openPosts', label: 'Postes non pourvus', icon: AlertTriangle },
  { id: 'pool', label: 'Vivier potentiel', icon: Users },
  { id: 'method', label: 'Méthodologie', icon: BookOpen },
]

const initialSlots: ImportSlot[] = IMPORT_SLOTS.map(slot => ({ ...slot, status: 'missing', rows: 0, fileName: null, error: null }))

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

function exportCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escape = (v: string | number | null) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(row => row.map(escape).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>
}

function Sidebar({ page, setPage }: { page: PageKey; setPage: (page: PageKey) => void }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><GraduationCap size={20} /></div><div><strong>Planification</strong><span>des enseignants</span></div></div>
    <div className="sidebar-context"><span>Algorithme</span><strong>Affectation séquentielle</strong></div>
    <nav aria-label="Navigation principale" className="nav-list">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={16} /><span>Données conservées dans cette session</span></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings2 size={17} /><span>Paramètres</span></button></div>
  </aside>
}

function Topbar({ page, onMenu, resultat, error }: { page: PageKey; onMenu: () => void; resultat: ResultatAffectation | null; error: string | null }) {
  const title = page === 'settings' ? 'Paramètres' : navItems.find(item => item.id === page)?.label ?? 'Tableau de bord'
  return <header className="topbar"><button className="mobile-menu" aria-label="Ouvrir le menu" onClick={onMenu}><Menu size={20} /></button><div><p className="eyebrow">Planification des enseignants / affectation séquentielle</p><h1>{title}</h1></div><div className="top-actions">{error ? <StatusPill tone="danger"><span className="status-dot" /> Erreur de calcul</StatusPill> : resultat ? <StatusPill tone="success"><Check size={12} /> Affectation calculée</StatusPill> : <StatusPill tone="warning"><span className="status-dot" /> Données non importées</StatusPill>}</div></header>
}

function MetricCard({ label, value, detail, accent, onClick }: { label: string; value: string; detail: string; accent?: 'blue' | 'amber' | 'red'; onClick?: () => void }) {
  return <button className={`metric-card ${accent ? `metric-${accent}` : ''}`} onClick={onClick}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail} <ArrowRight size={13} /></span></button>
}

function EmptyState({ onImport, text }: { onImport: () => void; text?: string }) {
  return <div className="empty-state"><div className="empty-icon"><Database size={23} /></div><h3>Aucune affectation disponible</h3><p>{text ?? "Importez les fichiers établissements et enseignants, puis lancez le calcul pour voir apparaître les résultats."}</p><button className="button button-primary" onClick={onImport}><Upload size={16} /> Importer les données</button></div>
}

const fmt = (n: number) => n.toLocaleString('fr-FR')

function Dashboard({ setPage, resultat, onExportExcel, exportingExcel }: { setPage: (page: PageKey) => void; resultat: ResultatAffectation | null; onExportExcel: () => void; exportingExcel: boolean }) {
  const s = resultat?.synthese
  const topNeeds = useMemo(() => resultat ? [...resultat.ecolesEnBesoin].sort((a, b) => b.nbPostesOuverts - a.nbPostesOuverts).slice(0, 8) : [], [resultat])
  return <div className="page-stack">
    <div className="notice notice-info"><AlertTriangle size={17} /><p><strong>Résultat de simulation :</strong> ces propositions d'affectation sont issues d'un barème configurable, pas de mutations administrativement approuvées.</p></div>
    <div className="metric-grid">
      <MetricCard label="Besoin total (postes)" value={s ? fmt(s.besoinTotal) : '—'} detail="Voir les écoles en besoin" onClick={() => setPage('needs')} />
      <MetricCard label="Enseignants disponibles" value={s ? fmt(s.disponibles) : '—'} detail="Voir le vivier" accent="blue" onClick={() => setPage('pool')} />
      <MetricCard label="Enseignants affectés" value={s ? fmt(s.affectes) : '—'} detail="Voir les affectations" onClick={() => setPage('assignments')} />
    </div>
    <div className="metric-grid">
      <MetricCard label="Non affectés" value={s ? fmt(s.nonAffectes) : '—'} detail="Voir le détail" accent="amber" onClick={() => setPage('unassigned')} />
      <MetricCard label="Postes restants non pourvus" value={s ? fmt(s.postesNonPourvus) : '—'} detail="Voir le détail" accent="amber" onClick={() => setPage('openPosts')} />
      <MetricCard label="Déficit final (à recruter)" value={s ? fmt(s.aRecruter) : '—'} detail="Voir les postes non pourvus" accent="red" onClick={() => setPage('openPosts')} />
    </div>
    <section className="panel regional-preview">
      <div className="panel-heading"><div><p className="section-kicker">Synthèse</p><h2>Écoles les plus en besoin</h2></div><button className="text-button" onClick={() => setPage('needs')}>Voir toutes les écoles en besoin <ArrowRight size={14} /></button></div>
      <div className="table-wrap"><table><thead><tr><th>École</th><th>Commune</th><th className="number">Postes ouverts</th><th className="number">Taux d'encadrement</th></tr></thead>
        <tbody>{resultat ? topNeeds.map(e => <tr key={e.idEtab}><td><strong>{e.nomEtab}</strong><small>{e.idEtab}</small></td><td>{e.commune}<small>{e.departement}</small></td><td className="number warning-number">{fmt(e.nbPostesOuverts)}</td><td className="number">{e.tauxEncadrementAbsolu.toFixed(2)}</td></tr>)
          : <tr><td colSpan={4} className="table-empty">Importez les données pour afficher les résultats.</td></tr>}</tbody>
      </table></div>
    </section>
    {resultat && <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Rapport</p><h2>Export complet</h2></div></div>
      <p className="muted" style={{ marginBottom: 14 }}>Toutes les tables (synthèse, écoles en besoin, écoles fournisseurs, affectations, non affectés, postes non pourvus, vivier) dans un seul classeur Excel.</p>
      <button className="button button-primary" onClick={onExportExcel} disabled={exportingExcel}><ArrowDownToLine size={16} /> {exportingExcel ? 'Génération…' : 'Télécharger le rapport complet (Excel)'}</button>
    </section>}
  </div>
}

function ImportPage({ slots, onFile, onCompute, canCompute, computing, error }: { slots: ImportSlot[]; onFile: (id: ImportId, file?: File) => void; onCompute: () => void; canCompute: boolean; computing: boolean; error: string | null }) {
  const validCount = slots.filter(slot => slot.status === 'ready').length
  return <div className="page-stack">
    <div className="notice notice-warning"><AlertTriangle size={17} /><p><strong>Import local uniquement.</strong> Les fichiers sont lus dans votre navigateur et ne sont jamais envoyés vers un service externe.</p></div>
    {error && <div className="notice notice-warning"><AlertTriangle size={17} /><p><strong>Échec du calcul.</strong> {error}</p></div>}
    <div className="import-header"><div><p className="section-kicker">Deux fichiers Excel</p><h2>Sélectionner les fichiers établissements et enseignants</h2><p className="muted">La première feuille de chaque classeur est lue, avec sa première ligne comme en-têtes.</p></div><button className="button button-primary" disabled={!canCompute} onClick={onCompute}><RefreshCw size={16} className={computing ? 'spin' : ''} /> {computing ? 'Calcul en cours…' : 'Lancer l’affectation'} <span className="button-count">{validCount}/2</span></button></div>
    <div className="import-list">{slots.map((slot, index) => <div className="import-card" key={slot.id}>
      <div className="import-number">{String.fromCharCode(65 + index)}</div>
      <div className="import-main">
        <div className="import-title"><div><span className="section-kicker">{slot.title}</span><h3>{slot.fileName ?? 'Aucun fichier sélectionné'}</h3></div><StatusPill tone={slot.status === 'ready' ? 'success' : slot.status === 'invalid' ? 'danger' : 'warning'}>{slot.status === 'ready' ? 'Feuille lue' : slot.status === 'invalid' ? 'Erreur de lecture' : 'Fichier requis'}</StatusPill></div>
        <div className="import-meta"><span>Colonnes attendues <strong>{slot.description}</strong></span>{slot.rows > 0 && <span>Lignes lues <strong>{slot.rows.toLocaleString('fr-FR')}</strong></span>}</div>
        {slot.status === 'invalid' && <p className="error-text">{slot.error ?? 'Le fichier doit être un classeur Excel (.xlsx ou .xls).'}</p>}
        <label className="upload-control"><Upload size={15} /> {slot.status === 'ready' ? 'Remplacer le fichier' : 'Sélectionner le fichier'}<input type="file" accept=".xlsx,.xls" onChange={event => onFile(slot.id, event.target.files?.[0])} /></label>
      </div>
    </div>)}</div>
    <div className="import-footnote"><FileSpreadsheet size={16} /><span>Les cellules vides et les valeurs numériques sont préservées lors de la lecture.</span></div>
  </div>
}

type FilterSelection = Record<string, Set<string>>
interface FilterGroupDef { key: string; label: string; options: string[] }

function useFilterState() {
  const [selected, setSelected] = useState<FilterSelection>({})
  function toggle(key: string, value: string) {
    setSelected(current => {
      const next = new Set(current[key] ?? [])
      if (next.has(value)) next.delete(value); else next.add(value)
      return { ...current, [key]: next }
    })
  }
  function clear() { setSelected({}) }
  function matches(key: string, value: string) {
    const set = selected[key]
    return !set || set.size === 0 || set.has(value)
  }
  return { selected, toggle, clear, matches }
}

function FilterMenu({ groups, selected, onToggle, onClear }: { groups: FilterGroupDef[]; selected: FilterSelection; onToggle: (key: string, value: string) => void; onClear: () => void }) {
  const activeCount = Object.values(selected).reduce((n, s) => n + s.size, 0)
  const visibleGroups = groups.filter(g => g.options.length > 0)
  if (visibleGroups.length === 0) return null
  return <details className="filter-popover">
    <summary className="button button-secondary"><Filter size={15} /> Filtres <span className="filter-count">{activeCount}</span></summary>
    <div className="filter-panel">
      {visibleGroups.map(g => <div className="filter-group" key={g.key}>
        <h4>{g.label}</h4>
        {g.options.map(opt => <label key={opt}><input type="checkbox" checked={selected[g.key]?.has(opt) ?? false} onChange={() => onToggle(g.key, opt)} />{opt}</label>)}
      </div>)}
      {activeCount > 0 && <div className="filter-actions"><button className="text-button" onClick={onClear}>Réinitialiser les filtres</button></div>}
    </div>
  </details>
}

function SearchToolbar({ query, setQuery, placeholder, onExport, extra, filters }: { query: string; setQuery: (v: string) => void; placeholder: string; onExport?: () => void; extra?: React.ReactNode; filters?: React.ReactNode }) {
  return <div className="toolbar-row">
    <div className="search-field"><Search size={16} /><input aria-label={placeholder} placeholder={placeholder} value={query} onChange={e => setQuery(e.target.value)} /></div>
    {extra}
    {filters}
    {onExport && <button className="button button-secondary" onClick={onExport}><ArrowDownToLine size={15} /> Exporter CSV</button>}
  </div>
}

const ROW_LIMIT = 300

function NeedsPage({ resultat, setPage }: { resultat: ResultatAffectation | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!resultat) return []
    const q = query.toLowerCase()
    return resultat.ecolesEnBesoin.filter(e => !q || `${e.idEtab} ${e.nomEtab} ${e.commune} ${e.departement}`.toLowerCase().includes(q))
  }, [resultat, query])
  if (!resultat) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par code, nom ou commune" onExport={() => exportCSV('ecoles_en_besoin.csv',
      ['Code établissement', 'École', 'Commune', 'Département', 'Postes ouverts', "Taux d'encadrement"],
      filtered.map(e => [e.idEtab, e.nomEtab, e.commune, e.departement, e.nbPostesOuverts, e.tauxEncadrementAbsolu]))} />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Établissements avec postes ouverts</p><h2>Écoles en besoin</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>École</th><th>Territoire</th><th>Zone</th><th className="number">Postes ouverts</th><th className="number">Taux d'encadrement</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={5} className="table-empty">Aucune école ne correspond à cette recherche.</td></tr> : filtered.slice(0, ROW_LIMIT).map(e => <tr key={e.idEtab}>
          <td><strong>{e.nomEtab}</strong><small>{e.idEtab}</small></td>
          <td>{e.commune}<small>{e.departement} · {e.region}</small></td>
          <td>{e.zone}</td>
          <td className="number warning-number">{e.nbPostesOuverts}</td>
          <td className="number">{e.tauxEncadrementAbsolu.toFixed(2)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function SuppliersPage({ resultat, setPage }: { resultat: ResultatAffectation | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!resultat) return []
    const q = query.toLowerCase()
    return resultat.ecolesFournisseurs.filter(e => !q || `${e.idEtab} ${e.commune}`.toLowerCase().includes(q))
  }, [resultat, query])
  if (!resultat) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Les écoles fournisseurs d'enseignants apparaîtront ici après le calcul." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par code établissement ou commune" onExport={() => exportCSV('ecoles_fournisseurs.csv',
      ['Code établissement', 'Commune', 'Enseignants du vivier'], filtered.map(e => [e.idEtab, e.commune, e.nbEnseignantsVivier]))} />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Origine du vivier</p><h2>Écoles fournisseurs</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>Code établissement</th><th>Commune</th><th className="number">Enseignants du vivier</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={3} className="table-empty">Aucun résultat.</td></tr> : filtered.slice(0, ROW_LIMIT).map((e, i) => <tr key={`${e.idEtab}-${i}`}>
          <td><strong>{e.idEtab}</strong></td>
          <td>{e.commune}</td>
          <td className="number">{e.nbEnseignantsVivier}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function AssignmentsPage({ resultat, setPage }: { resultat: ResultatAffectation | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const { selected, toggle, clear, matches } = useFilterState()
  const filterGroups = useMemo<FilterGroupDef[]>(() => {
    if (!resultat) return []
    return [{ key: 'phase', label: 'Phase', options: Array.from(new Set(resultat.affectations.map(a => a.phase))).sort() }]
  }, [resultat])
  const filtered = useMemo(() => {
    if (!resultat) return []
    const q = query.toLowerCase()
    return resultat.affectations.filter(a => matches('phase', a.phase) && (!q || `${a.idEns} ${a.nomEns} ${a.prenomEns} ${a.nomEtab}`.toLowerCase().includes(q)))
  }, [resultat, query, selected])
  if (!resultat) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Ces propositions sont issues du calcul et ne constituent pas des mutations administrativement approuvées." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par enseignant ou école" onExport={() => exportCSV('affectations.csv',
      ['Phase', 'Poste', 'École', 'Commune poste', 'Enseignant', 'Nom', 'Prénom', 'Commune origine', 'Barème', 'Score'],
      filtered.map(a => [a.phase, a.idPoste, a.nomEtab, a.communePoste, a.idEns, a.nomEns, a.prenomEns, a.communeOrigine, a.bareme, a.scoreAffectation]))}
      filters={<FilterMenu groups={filterGroups} selected={selected} onToggle={toggle} onClear={clear} />}
    />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Résultat du moteur</p><h2>Affectations proposées</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>Enseignant</th><th>Origine</th><th>Destination</th><th className="number">Barème</th><th className="number">Score</th><th>Phase</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="table-empty">Aucun résultat.</td></tr> : filtered.slice(0, ROW_LIMIT).map((a, i) => <tr key={`${a.idEns}-${i}`}>
          <td><strong>{a.nomEns} {a.prenomEns}</strong><small>{a.idEns}</small></td>
          <td>{a.communeOrigine}</td>
          <td>{a.nomEtab}<small>{a.communePoste}</small></td>
          <td className="number">{a.bareme}</td>
          <td className="number">{a.scoreAffectation}</td>
          <td><StatusPill tone={a.phase.startsWith('phase1') ? 'success' : 'neutral'}>{a.phase}</StatusPill></td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function UnassignedPage({ resultat, setPage }: { resultat: ResultatAffectation | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!resultat) return []
    const q = query.toLowerCase()
    return resultat.nonAffectes.filter(e => !q || `${e.idEns} ${e.nom} ${e.prenom} ${e.idEtabAttache}`.toLowerCase().includes(q))
  }, [resultat, query])
  if (!resultat) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Les enseignants du vivier sans poste trouvé apparaîtront ici." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par identifiant ou nom" onExport={() => exportCSV('non_affectes.csv',
      ['Identifiant', 'Nom', 'Prénom', 'École attache', 'Commune', 'Barème'],
      filtered.map(e => [e.idEns, e.nom, e.prenom, e.idEtabAttache, e.communeAttache, e.bareme]))} />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Vivier sans destination</p><h2>Enseignants non affectés</h2></div><StatusPill tone={filtered.length ? 'warning' : 'success'}>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>Identifiant</th><th>École origine</th><th className="number">Barème</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={3} className="table-empty">Aucun résultat.</td></tr> : filtered.slice(0, ROW_LIMIT).map(e => <tr key={e.idEns}>
          <td><strong>{e.nom} {e.prenom}</strong><small>{e.idEns}</small></td>
          <td>{e.idEtabAttache}<small>{e.communeAttache}</small></td>
          <td className="number">{e.bareme}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function OpenPostsPage({ resultat, setPage }: { resultat: ResultatAffectation | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!resultat) return []
    const q = query.toLowerCase()
    return resultat.postesNonPourvus.filter(p => !q || `${p.idPoste} ${p.nomEtab} ${p.commune}`.toLowerCase().includes(q))
  }, [resultat, query])
  if (!resultat) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Le déficit final à recruter apparaîtra ici." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par poste, école ou commune" onExport={() => exportCSV('postes_non_pourvus.csv',
      ['Poste', 'École', 'Commune', 'Département'], filtered.map(p => [p.idPoste, p.nomEtab, p.commune, p.departement]))} />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Déficit à recruter</p><h2>Postes non pourvus</h2></div><StatusPill tone={filtered.length ? 'danger' : 'success'}>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>Poste</th><th>École</th><th>Territoire</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={3} className="table-empty">Aucun poste restant.</td></tr> : filtered.slice(0, ROW_LIMIT).map(p => <tr key={p.idPoste}>
          <td><strong>{p.idPoste}</strong></td>
          <td>{p.nomEtab}</td>
          <td>{p.commune}<small>{p.departement}</small></td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function PoolPage({ resultat, setPage }: { resultat: ResultatAffectation | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const { selected, toggle, clear, matches } = useFilterState()
  const filterGroups = useMemo<FilterGroupDef[]>(() => {
    if (!resultat) return []
    return [{ key: 'affecte', label: 'Statut', options: ['Affecté', 'Non affecté'] }]
  }, [resultat])
  const filtered = useMemo(() => {
    if (!resultat) return []
    const q = query.toLowerCase()
    return resultat.vivier.filter(e => matches('affecte', e.affecte ? 'Affecté' : 'Non affecté') && (!q || `${e.idEns} ${e.nom} ${e.prenom} ${e.idEtabAttache}`.toLowerCase().includes(q)))
  }, [resultat, query, selected])
  if (!resultat) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Le vivier potentiel apparaîtra ici après le calcul : enseignants éligibles, barème et statut d'affectation." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par identifiant ou école" onExport={() => exportCSV('vivier.csv',
      ['Identifiant', 'Nom', 'Prénom', 'École attache', 'Commune', 'Ancienneté poste', 'Âge', 'Barème', 'Affecté'],
      filtered.map(e => [e.idEns, e.nom, e.prenom, e.idEtabAttache, e.communeAttache, e.anciennetePosteAns, e.age != null ? Math.round(e.age) : null, e.bareme, e.affecte ? 'oui' : 'non']))}
      filters={<FilterMenu groups={filterGroups} selected={selected} onToggle={toggle} onClear={clear} />}
    />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Ressources mobilisables</p><h2>Vivier potentiel</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>Identifiant</th><th>École origine</th><th className="number">Ancienneté poste</th><th className="number">Âge</th><th className="number">Barème</th><th>Statut</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="table-empty">Aucun résultat.</td></tr> : filtered.slice(0, ROW_LIMIT).map(e => <tr key={e.idEns}>
          <td><strong>{e.nom} {e.prenom}</strong><small>{e.idEns}</small></td>
          <td>{e.idEtabAttache}<small>{e.communeAttache}</small></td>
          <td className="number">{e.anciennetePosteAns}</td>
          <td className="number">{e.age != null ? Math.round(e.age) : '—'}</td>
          <td className="number">{e.bareme}</td>
          <td><StatusPill tone={e.affecte ? 'success' : 'neutral'}>{e.affecte ? 'Affecté' : 'Non affecté'}</StatusPill></td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function MethodPage() {
  return <div className="page-stack">
    <section className="panel page-intro">
      <div className="intro-icon"><BookOpen size={24} /></div>
      <div><p className="section-kicker">Référentiel de calcul</p><h2>Méthodologie</h2><p className="muted">Ce que veut dire chaque indicateur du tableau de bord, et les règles précises appliquées par le moteur.</p></div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Comprendre les indicateurs clés</h2></div></div>
      <div className="glossary-list">
        {KEY_INDICATORS.map(item => <div className="glossary-item" key={item.term}>
          <h3>{item.term}</h3>
          <p className="glossary-summary">{item.summary}</p>
          <p>{item.explanation}</p>
        </div>)}
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Que trouve-t-on dans chaque page ?</h2></div></div>
      <div className="glossary-list">
        {MENU_SECTIONS.map(item => <div className="glossary-item" key={item.label}>
          <h3>{item.label}</h3>
          <p>{item.description}</p>
        </div>)}
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Pour aller plus loin</p><h2>Règles précises appliquées par le moteur</h2></div></div>
      <ul className="method-list">
        {METHOD_RULES.map(rule => <li key={rule.title}><strong>{rule.title}</strong> — {rule.text}</li>)}
      </ul>
    </section>
  </div>
}

function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <label className="slider-row">
    <span className="slider-label">{label}</span>
    <input type="range" min={0} max={1} step={0.05} value={value} onChange={e => onChange(Number(e.target.value))} />
    <span className="slider-value">{value.toFixed(2)}</span>
  </label>
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return <label className="number-field">
    <span>{label}</span>
    <input type="number" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
  </label>
}

function SettingsPage({ cfg, setCfg, resultat, generatedAt, onRecompute, canRecompute, recomputing }: {
  cfg: AffectationConfig
  setCfg: (updater: (c: AffectationConfig) => AffectationConfig) => void
  resultat: ResultatAffectation | null
  generatedAt: string | null
  onRecompute: () => void
  canRecompute: boolean
  recomputing: boolean
}) {
  const [configError, setConfigError] = useState<string | null>(null)

  function handleConfigUpload(file?: File) {
    if (!file) return
    file.text().then(text => {
      try {
        const loaded = JSON.parse(text) as Partial<AffectationConfig>
        setCfg(current => ({ ...current, ...loaded }))
        setConfigError(null)
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function handleConfigDownload() {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'configuration-affectation.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="page-stack">
    <section className="panel page-intro"><div className="intro-icon"><Settings2 size={24} /></div><div><p className="section-kicker">Configuration</p><h2>Paramètres de l'algorithme</h2><p className="muted">Ajustez les seuils, les poids et les phases, puis relancez le calcul. Rien de tout ceci n'est envoyé à un service externe.</p></div></section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">État</p><h2>Dernier calcul</h2></div><StatusPill tone={resultat ? 'success' : 'warning'}>{resultat ? 'Calculé' : 'Aucune donnée'}</StatusPill></div>
      <div className="settings-info">
        <div><Info size={15} /><span>Dernier calcul</span><strong>{generatedAt ? new Date(generatedAt).toLocaleString('fr-FR') : '—'}</strong></div>
        <div><Info size={15} /><span>Enseignants dans le vivier</span><strong>{resultat ? fmt(resultat.vivier.length) : '—'}</strong></div>
        <div><Info size={15} /><span>Postes ouverts</span><strong>{resultat ? fmt(resultat.synthese.besoinTotal) : '—'}</strong></div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Phases DREB</p><h2>Phases activables</h2></div></div>
      <div className="filter-group" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label><input type="checkbox" checked={cfg.reglesDreb.phase1Commune} onChange={e => setCfg(c => ({ ...c, reglesDreb: { ...c.reglesDreb, phase1Commune: e.target.checked } }))} /> Phase 1 — Même commune</label>
        <label><input type="checkbox" checked={cfg.reglesDreb.phase2Departement} onChange={e => setCfg(c => ({ ...c, reglesDreb: { ...c.reglesDreb, phase2Departement: e.target.checked } }))} /> Phase 2 — Même département</label>
        <label><input type="checkbox" checked={cfg.reglesDreb.phase3JeunesVersMultigrades} onChange={e => setCfg(c => ({ ...c, reglesDreb: { ...c.reglesDreb, phase3JeunesVersMultigrades: e.target.checked } }))} /> Phase 3 — Jeunes → multigrades</label>
        <label><input type="checkbox" checked={cfg.reglesDreb.phase3AnciensRuralVersUrbain} onChange={e => setCfg(c => ({ ...c, reglesDreb: { ...c.reglesDreb, phase3AnciensRuralVersUrbain: e.target.checked } }))} /> Phase 3 — Anciens rural → urbain</label>
        <label><input type="checkbox" checked={cfg.reglesDreb.phase4CommunePlusDemanderesse} onChange={e => setCfg(c => ({ ...c, reglesDreb: { ...c.reglesDreb, phase4CommunePlusDemanderesse: e.target.checked } }))} /> Phase 4 — Reste</label>
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Seuils</p><h2>Bornes d'âge et d'ancienneté</h2></div></div>
      <div className="config-grid">
        <NumberField label="Bonus ancienneté poste (ans)" min={0} max={20} value={cfg.seuils.anciennetePosteBonusAns} onChange={v => setCfg(c => ({ ...c, seuils: { ...c.seuils, anciennetePosteBonusAns: v } }))} />
        <NumberField label="Âge jeune (≤)" min={20} max={45} value={cfg.seuils.ageJeuneAns} onChange={v => setCfg(c => ({ ...c, seuils: { ...c.seuils, ageJeuneAns: v } }))} />
        <NumberField label="Âge élevé (≥)" min={40} max={65} value={cfg.seuils.ageAgeAns} onChange={v => setCfg(c => ({ ...c, seuils: { ...c.seuils, ageAgeAns: v } }))} />
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Barème individuel</p><h2>Poids du classement du vivier</h2></div></div>
      <div className="slider-list">
        <SliderField label="Ancienneté carrière" value={cfg.poidsBaremeIndividuel.ancienneteCarriere} onChange={v => setCfg(c => ({ ...c, poidsBaremeIndividuel: { ...c.poidsBaremeIndividuel, ancienneteCarriere: v } }))} />
        <SliderField label="Ancienneté poste" value={cfg.poidsBaremeIndividuel.anciennetePoste} onChange={v => setCfg(c => ({ ...c, poidsBaremeIndividuel: { ...c.poidsBaremeIndividuel, anciennetePoste: v } }))} />
        <SliderField label="Situation familiale" value={cfg.poidsBaremeIndividuel.situationFamiliale} onChange={v => setCfg(c => ({ ...c, poidsBaremeIndividuel: { ...c.poidsBaremeIndividuel, situationFamiliale: v } }))} />
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Score de poste</p><h2>Poids de l'affectation enseignant-poste</h2></div></div>
      <div className="slider-list">
        <SliderField label="Barème enseignant" value={cfg.poidsScorePoste.baremeEnseignant} onChange={v => setCfg(c => ({ ...c, poidsScorePoste: { ...c.poidsScorePoste, baremeEnseignant: v } }))} />
        <SliderField label="Proximité" value={cfg.poidsScorePoste.proximite} onChange={v => setCfg(c => ({ ...c, poidsScorePoste: { ...c.poidsScorePoste, proximite: v } }))} />
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Configuration</p><h2>Importer / exporter</h2></div></div>
      {configError && <p className="error-text">{configError}</p>}
      <div className="settings-actions">
        <div className="settings-action">
          <div><strong>Charger une configuration JSON</strong><p className="muted">Remplace les sections présentes dans le fichier (seuils, poids, phases…), les autres restent inchangées.</p></div>
          <label className="upload-control"><Upload size={15} /> Charger<input type="file" accept=".json" onChange={e => handleConfigUpload(e.target.files?.[0])} /></label>
        </div>
        <div className="settings-action">
          <div><strong>Télécharger la configuration actuelle</strong><p className="muted">Exporte les paramètres ci-dessus au format JSON, pour les réutiliser ou les partager.</p></div>
          <button className="button button-secondary" onClick={handleConfigDownload}><ArrowDownToLine size={15} /> Télécharger</button>
        </div>
        <div className="settings-action">
          <div><strong>Recalculer avec ces paramètres</strong><p className="muted">Relance le moteur sur les fichiers déjà importés, avec la configuration actuelle.</p></div>
          <button className="button button-primary" disabled={!canRecompute || recomputing} onClick={onRecompute}><RefreshCw size={15} className={recomputing ? 'spin' : ''} /> {recomputing ? 'Calcul…' : 'Recalculer'}</button>
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Détail</p><h2>Configuration effective (JSON)</h2></div></div>
      <details><summary className="text-button" style={{ cursor: 'pointer' }}><SlidersHorizontal size={14} /> Voir la configuration complète</summary>
        <pre style={{ background: '#0b1d2f0a', padding: 14, borderRadius: 8, fontSize: 11, overflowX: 'auto', marginTop: 10 }}>{JSON.stringify(cfg, null, 2)}</pre>
      </details>
    </section>
  </div>
}

export default function Page() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [slots, setSlots] = useState(initialSlots)
  const [rawRows, setRawRows] = useState<Partial<Record<ImportId, unknown[][]>>>({})
  const [cfg, setCfg] = useState<AffectationConfig>(DEFAULT_CONFIG)
  const [computing, setComputing] = useState(false)
  const [resultat, setResultat] = useState<ResultatAffectation | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)

  async function handleFile(id: ImportId, file?: File) {
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: 'invalid', rows: 0, fileName: file.name, error: 'Le fichier doit être un classeur Excel (.xlsx ou .xls).' } : slot))
      return
    }
    try {
      const rows = await readFirstWorksheetRows(file)
      setRawRows(current => ({ ...current, [id]: rows }))
      setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: 'ready', rows: Math.max(0, rows.length - 1), fileName: file.name, error: null } : slot))
    } catch (err) {
      setRawRows(current => ({ ...current, [id]: undefined }))
      setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: 'invalid', rows: 0, fileName: file.name, error: err instanceof Error ? err.message : String(err) } : slot))
    }
  }

  function compute() {
    if (!rawRows.etablissements || !rawRows.enseignants) return
    setComputing(true)
    setError(null)
    setTimeout(() => {
      try {
        const { etablissements, enseignants } = parseAffectationRows({ etablissements: rawRows.etablissements!, enseignants: rawRows.enseignants! })
        const r = runAffectation(etablissements, enseignants, cfg)
        setResultat(r)
        setGeneratedAt(new Date().toISOString())
        setPage('dashboard')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setResultat(null)
      } finally {
        setComputing(false)
      }
    }, 30)
  }

  async function handleExportExcel() {
    if (!resultat) return
    setExportingExcel(true)
    try {
      const bytes = await exportAffectationsXlsx(resultat)
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'resultat_affectation.xlsx'
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingExcel(false)
    }
  }

  const canCompute = slots.every(s => s.status === 'ready') && !computing
  const canRecompute = !!rawRows.etablissements && !!rawRows.enseignants

  return <div className="app-shell">
    <div className={`sidebar-dimmer ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />
    <div className={sidebarOpen ? 'sidebar-wrap open' : 'sidebar-wrap'}><Sidebar page={page} setPage={id => { setPage(id); setSidebarOpen(false) }} /></div>
    <main className="main-content">
      <Topbar page={page} onMenu={() => setSidebarOpen(true)} resultat={resultat} error={error} />
      <div className="content-area">
        {computing && <div className="running-banner"><RefreshCw size={16} className="spin" /> Calcul de l'affectation en cours…</div>}
        {page === 'dashboard' && <Dashboard setPage={setPage} resultat={resultat} onExportExcel={handleExportExcel} exportingExcel={exportingExcel} />}
        {page === 'imports' && <ImportPage slots={slots} onFile={handleFile} onCompute={compute} canCompute={canCompute} computing={computing} error={error} />}
        {page === 'needs' && <NeedsPage resultat={resultat} setPage={setPage} />}
        {page === 'suppliers' && <SuppliersPage resultat={resultat} setPage={setPage} />}
        {page === 'assignments' && <AssignmentsPage resultat={resultat} setPage={setPage} />}
        {page === 'unassigned' && <UnassignedPage resultat={resultat} setPage={setPage} />}
        {page === 'openPosts' && <OpenPostsPage resultat={resultat} setPage={setPage} />}
        {page === 'pool' && <PoolPage resultat={resultat} setPage={setPage} />}
        {page === 'method' && <MethodPage />}
        {page === 'settings' && <SettingsPage cfg={cfg} setCfg={setCfg} resultat={resultat} generatedAt={generatedAt} onRecompute={compute} canRecompute={canRecompute} recomputing={computing} />}
      </div>
    </main>
  </div>
}
