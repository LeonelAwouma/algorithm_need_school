'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Filter,
  FolderCheck,
  GraduationCap,
  Info,
  LayoutDashboard,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { readWorksheetRows } from '@/lib/read-workbook'
import { SOURCE_SLOTS, type SlotId, type SourceSlotDef } from '@/lib/sources'
import { KEY_INDICATORS, MENU_SECTIONS, METHOD_RULES } from '@/lib/methodology'
import {
  buildSchoolRosters,
  ENGINE_VERSION,
  parseWorkbookRows,
  simulateRotation,
  type Inputs,
  type RosterEntry,
  type RosterSchool,
  type SimulationResult,
} from '@/lib/rotation-engine'

type PageKey = 'dashboard' | 'imports' | 'schools' | 'pool' | 'moves' | 'roster' | 'territory' | 'controls' | 'method' | 'settings'
type ImportStatus = 'missing' | 'ready' | 'invalid'

type ImportSlot = SourceSlotDef & { status: ImportStatus; rows: number; error: string | null }
type AutoSource = SourceSlotDef & { exists: boolean; sizeBytes: number | null; modifiedAt: string | null }

const navItems: { id: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'imports', label: 'Importation des données', icon: Upload },
  { id: 'schools', label: 'Écoles et besoins', icon: GraduationCap },
  { id: 'pool', label: 'Vivier potentiel', icon: Users },
  { id: 'moves', label: 'Rotations proposées', icon: ArrowRight },
  { id: 'roster', label: 'Effectifs N / N+1', icon: ArrowLeftRight },
  { id: 'territory', label: 'Analyse territoriale', icon: BarChart3 },
  { id: 'controls', label: 'Contrôles des données', icon: ClipboardCheck },
  { id: 'method', label: 'Méthodologie', icon: BookOpen },
]

const initialSlots: ImportSlot[] = SOURCE_SLOTS.map(slot => ({ ...slot, status: 'missing', rows: 0, error: null }))

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

function Sidebar({ page, setPage, hasResult }: { page: PageKey; setPage: (page: PageKey) => void; hasResult: boolean }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><GraduationCap size={20} /></div><div><strong>Planification</strong><span>des enseignants</span></div></div>
    <div className="sidebar-context"><span>Année scolaire</span><strong>2024 — 2025</strong></div>
    <nav aria-label="Navigation principale" className="nav-list">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon size={17} /><span>{label}</span>{id === 'imports' && !hasResult && <span className="nav-count">4</span>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={16} /><span>Données conservées dans cette session</span></div><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings2 size={17} /><span>Paramètres</span></button></div>
  </aside>
}

function Topbar({ page, onMenu, result, simulationError }: { page: PageKey; onMenu: () => void; result: SimulationResult | null; simulationError: string | null }) {
  const title = page === 'settings' ? 'Paramètres' : navItems.find(item => item.id === page)?.label ?? 'Tableau de bord'
  return <header className="topbar"><button className="mobile-menu" aria-label="Ouvrir le menu" onClick={onMenu}><Menu size={20} /></button><div><p className="eyebrow">Planification des enseignants / 2024—2025</p><h1>{title}</h1></div><div className="top-actions"><div className="year-select"><span>Année</span><strong>2024—2025</strong><ChevronDown size={14} /></div>{simulationError ? <StatusPill tone="danger"><span className="status-dot" /> Erreur de simulation</StatusPill> : result ? <StatusPill tone="success"><Check size={12} /> Simulation à jour</StatusPill> : <StatusPill tone="warning"><span className="status-dot" /> Données non importées</StatusPill>}</div></header>
}

function MetricCard({ label, value, detail, accent, onClick }: { label: string; value: string; detail: string; accent?: 'blue' | 'amber' | 'red'; onClick?: () => void }) {
  return <button className={`metric-card ${accent ? `metric-${accent}` : ''}`} onClick={onClick}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail} <ArrowRight size={13} /></span></button>
}

function EmptyState({ onImport, text }: { onImport: () => void; text?: string }) {
  return <div className="empty-state"><div className="empty-icon"><Database size={23} /></div><h3>Aucune simulation disponible</h3><p>{text ?? 'Importez les quatre fichiers sources pour calculer les besoins de couverture et les propositions de rotation.'}</p><button className="button button-primary" onClick={onImport}><Upload size={16} /> Importer les données</button></div>
}

const fmt = (n: number) => n.toLocaleString('fr-FR')

function Dashboard({ setPage, result }: { setPage: (page: PageKey) => void; result: SimulationResult | null }) {
  const topRegions = useMemo(() => result ? result.regions.slice(0, 6) : [], [result])
  const maxNeed = Math.max(1, ...topRegions.map(r => r.initialNeed))
  return <div className="page-stack">
    <div className="notice notice-info"><AlertTriangle size={17} /><p><strong>Besoin de couverture :</strong> cette estimation est basée sur les salles utilisées pour l'enseignement. Elle ne constitue pas un quota de recrutement approuvé.</p></div>
    <div className="metric-grid">
      <MetricCard label="Écoles publiques" value={result ? fmt(result.totals.publicSchools) : '—'} detail="Après importation" onClick={() => setPage('schools')} />
      <MetricCard label="Écoles calculables" value={result ? fmt(result.totals.calculableSchools) : '—'} detail="Après importation" accent="blue" onClick={() => setPage('schools')} />
      <MetricCard label="Besoin initial" value={result ? fmt(result.totals.initialNeed) : '—'} detail="Couverture des salles" accent="amber" onClick={() => setPage('schools')} />
      <MetricCard label="Vivier potentiel" value={result ? fmt(result.totals.pool) : '—'} detail="Enseignants éligibles" accent="blue" onClick={() => setPage('pool')} />
    </div>
    <div className="content-grid">
      <section className="panel chart-panel">
        <div className="panel-heading"><div><p className="section-kicker">Analyse régionale</p><h2>Besoins de couverture</h2></div><StatusPill>{result ? 'Top 6 régions' : 'En attente des données'}</StatusPill></div>
        {result ? <div className="region-bars">{topRegions.map(r => <div className="region-bar-row" key={r.region}><span className="region-bar-label">{r.region}</span><div className="region-bar-track"><div className="region-bar-fill" style={{ width: `${(r.initialNeed / maxNeed) * 100}%` }} /></div><span className="region-bar-value">{fmt(r.initialNeed)}</span></div>)}</div>
          : <div className="chart-empty"><BarChart3 size={28} /><span>Le graphique apparaîtra après l'exécution de la simulation.</span></div>}
        <div className="legend"><span><i className="legend-dot dot-blue" /> Besoin initial</span><span><i className="legend-dot dot-amber" /> Besoin restant</span></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="section-kicker">Qualité des données</p><h2>Points d'attention</h2></div><button className="icon-button" onClick={() => setPage('controls')} aria-label="Voir les contrôles"><ArrowRight size={17} /></button></div>
        <div className="attention-list">
          {result ? <>
            <div><ClipboardCheck size={16} /><span>{fmt(result.controls.length)} anomalies remontées par le moteur.</span><StatusPill tone={result.controls.length ? 'warning' : 'success'}>{result.controls.length ? 'À vérifier' : 'Aucune'}</StatusPill></div>
            <div><Users size={16} /><span>{fmt(result.totals.remainingPool)} enseignants du vivier non affectés.</span><StatusPill>Info</StatusPill></div>
            <div><AlertTriangle size={16} /><span>{fmt(result.totals.remainingNeed)} salles restent sans besoin couvert après simulation.</span><StatusPill tone="warning">À suivre</StatusPill></div>
          </> : <>
            <div><AlertTriangle size={16} /><span>Les fichiers sources n'ont pas encore été chargés.</span><StatusPill tone="warning">Bloquant</StatusPill></div>
            <div><ClipboardCheck size={16} /><span>Les contrôles seront produits par le moteur.</span><StatusPill>En attente</StatusPill></div>
          </>}
        </div>
      </section>
    </div>
    <section className="panel regional-preview">
      <div className="panel-heading"><div><p className="section-kicker">Synthèse</p><h2>Comparaison par région</h2></div><button className="text-button" onClick={() => setPage('territory')}>Voir l'analyse territoriale <ArrowRight size={14} /></button></div>
      <div className="table-wrap"><table><thead><tr><th>Région</th><th className="number">Écoles calculables</th><th className="number">Besoin initial</th><th className="number">Rotations</th><th className="number">Besoin restant</th></tr></thead>
        <tbody>{result ? result.regions.map(r => <tr key={r.region}><td><strong>{r.region}</strong></td><td className="number">{fmt(r.calculableCount)}</td><td className="number warning-number">{fmt(r.initialNeed)}</td><td className="number">{fmt(r.departures)}</td><td className="number">{fmt(r.remainingNeed)}</td></tr>)
          : <tr><td colSpan={5} className="table-empty">Importez les données pour afficher les agrégats.</td></tr>}</tbody>
      </table></div>
    </section>
  </div>
}

function AutoImportPanel({ autoSources, autoLoading, autoError, onAutoLoad }: { autoSources: AutoSource[] | null; autoLoading: boolean; autoError: string | null; onAutoLoad: () => void }) {
  const ready = autoSources ?? []
  const allPresent = ready.length > 0 && ready.every(s => s.exists)
  return <section className="panel">
    <div className="panel-heading"><div><p className="section-kicker">data/sources/</p><h2>Import automatique</h2></div>{autoSources && <StatusPill tone={allPresent ? 'success' : 'warning'}>{ready.filter(s => s.exists).length}/{ready.length} détectés</StatusPill>}</div>
    <p className="muted" style={{ marginBottom: 14 }}>Déposez les classeurs sous leur nom d'origine dans le dossier <code>data/sources/</code> du projet : ils sont détectés automatiquement au prochain chargement, sans passer par le sélecteur de fichiers. Le premier chargement prend environ 40 secondes (fichier personnel volumineux) ; les suivants sont quasi instantanés tant que les fichiers ne changent pas.</p>
    {autoError && <p className="error-text">{autoError}</p>}
    <div className="import-list">
      {!autoSources ? <p className="muted">Recherche des fichiers…</p> : ready.map((s, index) => <div className="import-card" key={s.id}>
        <div className="import-number">{String.fromCharCode(65 + index)}</div>
        <div className="import-main">
          <div className="import-title"><div><span className="section-kicker">{s.title}</span><h3>{s.filename}</h3></div><StatusPill tone={s.exists ? 'success' : 'warning'}>{s.exists ? 'Détecté' : 'Absent'}</StatusPill></div>
          <div className="import-meta"><span>Feuille <strong>{s.worksheet}</strong></span>{s.exists && s.sizeBytes != null && <span>Taille <strong>{formatBytes(s.sizeBytes)}</strong></span>}{s.exists && s.modifiedAt && <span>Modifié <strong>{new Date(s.modifiedAt).toLocaleString('fr-FR')}</strong></span>}</div>
        </div>
      </div>)}
    </div>
    <button className="button button-primary" disabled={!allPresent || autoLoading} onClick={onAutoLoad} style={{ marginTop: 14 }}>
      <FolderCheck size={16} /> {autoLoading ? 'Simulation en cours…' : 'Charger depuis data/sources/ et lancer la simulation'}
    </button>
  </section>
}

function ImportPage({ slots, onFile, onSimulate, canSimulate, simulationError, autoSources, autoLoading, autoError, onAutoLoad }: { slots: ImportSlot[]; onFile: (id: SlotId, file?: File) => void; onSimulate: () => void; canSimulate: boolean; simulationError: string | null; autoSources: AutoSource[] | null; autoLoading: boolean; autoError: string | null; onAutoLoad: () => void }) {
  const validCount = slots.filter(slot => slot.status === 'ready').length
  return <div className="page-stack">
    <div className="notice notice-warning"><AlertTriangle size={17} /><p><strong>Import local uniquement.</strong> Les fichiers sont lus sur votre machine (dossier du projet ou sélecteur du navigateur) et ne sont jamais envoyés vers un service externe.</p></div>
    <AutoImportPanel autoSources={autoSources} autoLoading={autoLoading} autoError={autoError} onAutoLoad={onAutoLoad} />
    {simulationError && <div className="notice notice-warning"><AlertTriangle size={17} /><p><strong>Échec de la simulation.</strong> {simulationError}</p></div>}
    <div className="import-header"><div><p className="section-kicker">Ou import manuel</p><h2>Sélectionner les fichiers dans le navigateur</h2><p className="muted">Utile si les fichiers ne sont pas dans data/sources/ ou pour tester une autre version. Les noms de feuilles sont contrôlés avant lancement.</p></div><button className="button button-primary" disabled={!canSimulate} onClick={onSimulate}><RefreshCw size={16} /> Lancer la simulation <span className="button-count">{validCount}/4</span></button></div>
    <div className="import-list">{slots.map((slot, index) => <div className="import-card" key={slot.id}>
      <div className="import-number">{String.fromCharCode(65 + index)}</div>
      <div className="import-main">
        <div className="import-title"><div><span className="section-kicker">{slot.title}</span><h3>{slot.filename}</h3></div><StatusPill tone={slot.status === 'ready' ? 'success' : slot.status === 'invalid' ? 'danger' : 'warning'}>{slot.status === 'ready' ? 'Feuille lue' : slot.status === 'invalid' ? 'Erreur de lecture' : 'Fichier requis'}</StatusPill></div>
        <div className="import-meta"><span>Feuille <strong>{slot.worksheet}</strong></span><span>Lignes d'en-tête <strong>{slot.headers}</strong></span>{slot.rows > 0 && <span>Lignes lues <strong>{slot.rows.toLocaleString('fr-FR')}</strong></span>}</div>
        {slot.status === 'invalid' && <p className="error-text">{slot.error ?? "Le fichier doit être un classeur Excel (.xlsx ou .xls)."}</p>}
        <label className="upload-control"><Upload size={15} /> {slot.status === 'ready' ? 'Remplacer le fichier' : 'Sélectionner le fichier'}<input type="file" accept=".xlsx,.xls" onChange={event => onFile(slot.id, event.target.files?.[0])} /></label>
      </div>
    </div>)}</div>
    <div className="import-footnote"><FileSpreadsheet size={16} /><span>Les cellules vides, les valeurs numériques et la grille complète des feuilles sont préservées lors de la lecture.</span></div>
  </div>
}

type FilterSelection = Record<string, Set<string>>
interface FilterGroupDef { key: string; label: string; options: string[] }

/** Sélection multi-critères partagée par les pages avec un bouton Filtres. */
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
  const activeCount = Object.values(selected).reduce((n, s) => n + s.size, 0)
  return { selected, toggle, clear, matches, activeCount }
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

function SchoolsPage({ result, setPage }: { result: SimulationResult | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const [onlyMoves, setOnlyMoves] = useState(false)
  const { selected, toggle, clear, matches } = useFilterState()
  const filterGroups = useMemo<FilterGroupDef[]>(() => {
    if (!result) return []
    const uniq = (values: (string | null)[]) => Array.from(new Set(values.filter((v): v is string => !!v))).sort()
    return [
      { key: 'status', label: 'Statut', options: uniq(result.schools.map(s => s.status)) },
      { key: 'subsystem', label: 'Sous-système', options: uniq(result.schools.map(s => s.subsystem)) },
      { key: 'area', label: 'Zone', options: uniq(result.schools.map(s => s.area)) },
      { key: 'region', label: 'Région', options: uniq(result.schools.map(s => s.region)) },
    ]
  }, [result])
  const filtered = useMemo(() => {
    if (!result) return []
    const q = query.toLowerCase()
    return result.schools.filter(s =>
      (!q || `${s.code} ${s.name} ${s.region} ${s.department} ${s.district}`.toLowerCase().includes(q))
      && (!onlyMoves || s.departures > 0 || s.arrivals > 0)
      && matches('status', s.status) && matches('subsystem', s.subsystem ?? '') && matches('area', s.area) && matches('region', s.region))
  }, [result, query, onlyMoves, selected])
  if (!result) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par code, nom ou région" onExport={() => exportCSV('ecoles.csv',
      ['Code', 'École', 'Région', 'Département', 'Arrondissement', 'Zone', 'Salles utilisées', 'Enseignants État', 'Directeurs', 'Besoin initial', 'Arrivées', 'Départs', 'Besoin restant', 'Statut'],
      filtered.map(s => [s.code, s.name, s.region, s.department, s.district, s.area, s.usedRooms, s.stateTeachers, s.stateDirectors, s.initialNeed, s.arrivals, s.departures, s.remainingNeed, s.status]))}
      extra={<button className={`button ${onlyMoves ? 'button-primary' : 'button-secondary'}`} onClick={() => setOnlyMoves(v => !v)}><ArrowLeftRight size={15} /> Avec rotation uniquement</button>}
      filters={<FilterMenu groups={filterGroups} selected={selected} onToggle={toggle} onClear={clear} />}
    />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Couverture des salles</p><h2>Écoles et besoins</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>École</th><th>Territoire</th><th>Zone</th><th className="number">Salles</th><th className="number">Ens. État</th><th className="number">Besoin initial</th><th className="number">Départs</th><th className="number">Arrivées</th><th className="number">Besoin restant</th><th>Statut</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={10} className="table-empty">Aucune école ne correspond à cette recherche.</td></tr> : filtered.slice(0, ROW_LIMIT).map(s => <tr key={s.code}>
          <td><strong>{s.name}</strong><small>{s.code}</small></td>
          <td>{s.region}<small>{s.department} · {s.district}</small></td>
          <td>{s.area}</td>
          <td className="number">{s.usedRooms ?? '—'}</td>
          <td className="number">{s.stateTeachers + s.stateDirectors}</td>
          <td className="number warning-number">{s.initialNeed ?? '—'}</td>
          <td className="number">{s.departures}</td>
          <td className="number">{s.arrivals}</td>
          <td className="number">{s.remainingNeed ?? '—'}</td>
          <td><StatusPill tone={s.status === 'Calculable' ? 'success' : 'warning'}>{s.status}</StatusPill></td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span><span>Les filtres n'altèrent pas l'ordre de la simulation</span></div>
    </section>
  </div>
}

function PoolPage({ result, setPage }: { result: SimulationResult | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const byCode = useMemo(() => new Map((result?.schools ?? []).map(s => [s.code, s])), [result])
  const { selected, toggle, clear, matches } = useFilterState()
  const filterGroups = useMemo<FilterGroupDef[]>(() => {
    if (!result) return []
    return [{ key: 'phase', label: 'Phase', options: Array.from(new Set(result.pool.map(p => p.phase ?? 'Non affecté'))).sort() }]
  }, [result])
  const filtered = useMemo(() => {
    if (!result) return []
    const q = query.toLowerCase()
    return result.pool.filter(p => {
      if (!matches('phase', p.phase ?? 'Non affecté')) return false
      if (!q) return true
      const src = byCode.get(p.source)
      const dst = p.destination ? byCode.get(p.destination) : null
      return `${p.id} ${src?.name ?? ''} ${dst?.name ?? ''}`.toLowerCase().includes(q)
    })
  }, [result, query, byCode, selected])
  if (!result) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Le vivier potentiel apparaîtra ici après la simulation : enseignants excédentaires, ancienneté et destination proposée." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par identifiant ou école" onExport={() => exportCSV('vivier.csv',
      ['Identifiant', 'École origine', 'Territoire', 'Ancienneté', 'Catégorie', 'Destination', 'Phase'],
      filtered.map(p => [p.id, byCode.get(p.source)?.name ?? p.source, byCode.get(p.source)?.region ?? '', p.tenure, p.category, p.destination ? (byCode.get(p.destination)?.name ?? p.destination) : 'Non affecté', p.phase ?? '']))}
      filters={<FilterMenu groups={filterGroups} selected={selected} onToggle={toggle} onClear={clear} />}
    />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Ressources provisoires</p><h2>Vivier potentiel</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>Identifiant</th><th>École origine</th><th className="number">Ancienneté</th><th>Catégorie</th><th>Destination</th><th>Phase</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="table-empty">Aucun résultat.</td></tr> : filtered.slice(0, ROW_LIMIT).map(p => { const src = byCode.get(p.source); const dst = p.destination ? byCode.get(p.destination) : null; return <tr key={p.id}>
          <td><strong>{p.id}</strong></td>
          <td>{src?.name ?? p.source}<small>{src ? `${src.region} · ${src.district}` : ''}</small></td>
          <td className="number">{p.tenure}</td>
          <td>{p.category}</td>
          <td>{dst ? <>{dst.name}<small>{dst.region} · {dst.district}</small></> : <StatusPill>Non affecté</StatusPill>}</td>
          <td>{p.phase ?? '—'}</td>
        </tr> })}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function MovesPage({ result, setPage }: { result: SimulationResult | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const { selected, toggle, clear, matches } = useFilterState()
  const filterGroups = useMemo<FilterGroupDef[]>(() => {
    if (!result) return []
    return [{ key: 'phase', label: 'Phase', options: Array.from(new Set(result.moves.map(m => m.phase))).sort() }]
  }, [result])
  const filtered = useMemo(() => {
    if (!result) return []
    const q = query.toLowerCase()
    return result.moves.filter(m => matches('phase', m.phase) && (!q || `${m.teacherId} ${m.sourceName} ${m.destinationName}`.toLowerCase().includes(q)))
  }, [result, query, selected])
  if (!result) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Ces propositions sont issues de la simulation et ne constituent pas des mutations administrativement approuvées." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par identifiant ou école" onExport={() => exportCSV('rotations.csv',
      ['Ordre', 'Enseignant', 'École origine', 'Arrondissement origine', 'École destination', 'Arrondissement destination', 'Ancienneté', 'Phase', 'Sous-système'],
      filtered.map(m => [m.order, m.teacherId, m.sourceName, m.sourceDistrict, m.destinationName, m.destinationDistrict, m.tenure, m.phase, m.subsystem]))}
      filters={<FilterMenu groups={filterGroups} selected={selected} onToggle={toggle} onClear={clear} />}
    />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Résultats du moteur</p><h2>Rotations proposées</h2></div><StatusPill>{fmt(filtered.length)} résultats</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th className="number">#</th><th>Enseignant</th><th>Origine</th><th>Destination</th><th className="number">Ancienneté</th><th>Phase</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={6} className="table-empty">Aucun résultat.</td></tr> : filtered.slice(0, ROW_LIMIT).map(m => <tr key={m.teacherId}>
          <td className="number">{m.order}</td>
          <td><strong>{m.teacherId}</strong></td>
          <td>{m.sourceName}<small>{m.sourceDistrict}</small></td>
          <td>{m.destinationName}<small>{m.destinationDistrict}</small></td>
          <td className="number">{m.tenure}</td>
          <td><StatusPill tone={m.phase === 'Arrondissement' ? 'success' : 'neutral'}>{m.phase}</StatusPill></td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function RosterEntryRow({ entry }: { entry: RosterEntry }) {
  return <div className="roster-entry">
    <div className="roster-entry-main"><StatusPill tone={entry.role === 'Directeur' ? 'neutral' : 'success'}>{entry.role}</StatusPill><strong>{entry.id}</strong></div>
    <div className="roster-entry-meta">
      {entry.tenure != null && <span>{entry.tenure} ans à l'école</span>}
      {entry.departsTo && <span className="roster-move roster-move-out"><ArrowRight size={12} /> part vers {entry.departsTo.schoolName} <small>({entry.departsTo.phase})</small></span>}
      {entry.arrivesFrom && <span className="roster-move roster-move-in"><ArrowRight size={12} /> vient de {entry.arrivesFrom.schoolName} <small>({entry.arrivesFrom.phase})</small></span>}
    </div>
  </div>
}

function RosterPage({ rosters, setPage }: { rosters: RosterSchool[] | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const matches = useMemo(() => {
    if (!rosters) return []
    const q = query.toLowerCase()
    const list = q ? rosters.filter(r => `${r.code} ${r.name} ${r.region} ${r.department} ${r.district}`.toLowerCase().includes(q)) : rosters.filter(r => r.before.some(e => e.departsTo) || r.after.some(e => e.arrivesFrom))
    return list.slice(0, 40)
  }, [rosters, query])
  const current = useMemo(() => rosters?.find(r => r.code === (selected ?? matches[0]?.code)) ?? null, [rosters, selected, matches])

  if (!rosters) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="La vue Année N / Année N+1 apparaîtra ici : effectif par école avant simulation, puis après application des rotations proposées." /></div>
  return <div className="page-stack">
    <div className="notice notice-info"><ArrowLeftRight size={17} /><p>Un enseignant affecté ailleurs disparaît de la colonne Année N+1 de son école d'origine et apparaît dans celle de son école de destination. Sans recherche, la liste montre uniquement les écoles concernées par au moins une rotation.</p></div>
    <div className="search-field roster-search"><Search size={16} /><input aria-label="Rechercher une école" placeholder="Rechercher une école par code, nom ou territoire" value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }} /></div>
    <div className="roster-layout">
      <section className="panel roster-list-panel">
        <div className="panel-heading"><div><p className="section-kicker">Écoles</p><h2>{query ? 'Résultats' : 'Avec rotation'}</h2></div><StatusPill>{fmt(matches.length)}</StatusPill></div>
        <div className="roster-list">{matches.length === 0 ? <p className="muted">Aucune école ne correspond.</p> : matches.map(r => <button key={r.code} className={`roster-list-item ${current?.code === r.code ? 'active' : ''}`} onClick={() => setSelected(r.code)}>
          <strong>{r.name}</strong><small>{r.code} · {r.district}</small>
        </button>)}</div>
      </section>
      <section className="panel roster-detail-panel">
        {!current ? <p className="muted">Sélectionnez une école.</p> : <>
          <div className="panel-heading"><div><p className="section-kicker">{current.region} · {current.department} · {current.district}</p><h2>{current.name}</h2></div><StatusPill>{current.code}</StatusPill></div>
          <div className="roster-columns">
            <div className="roster-column"><h3>Année N (2024–2025)</h3>{current.before.length === 0 ? <p className="muted">Aucun personnel recensé.</p> : current.before.map(e => <RosterEntryRow key={e.id} entry={e} />)}</div>
            <div className="roster-column"><h3>Année N+1 (simulation)</h3>{current.after.length === 0 ? <p className="muted">Aucun personnel après simulation.</p> : current.after.map(e => <RosterEntryRow key={e.id} entry={e} />)}</div>
          </div>
        </>}
      </section>
    </div>
  </div>
}

function TerritoryPage({ result, setPage }: { result: SimulationResult | null; setPage: (page: PageKey) => void }) {
  const [level, setLevel] = useState<'region' | 'district'>('region')
  if (!result) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Explorez les besoins par région, département et arrondissement sans relancer l'algorithme." /></div>
  const rows = level === 'region' ? result.regions : result.districts
  return <div className="page-stack">
    <div className="toolbar-row">
      <button className={`button ${level === 'region' ? 'button-primary' : 'button-secondary'}`} onClick={() => setLevel('region')}>Régions</button>
      <button className={`button ${level === 'district' ? 'button-primary' : 'button-secondary'}`} onClick={() => setLevel('district')}>Arrondissements</button>
    </div>
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Lecture géographique</p><h2>Analyse territoriale</h2></div><StatusPill>{fmt(rows.length)} lignes</StatusPill></div>
      <div className="table-wrap"><table><thead><tr>{level === 'district' && <><th>Région</th><th>Département</th><th>Arrondissement</th></>}{level === 'region' && <th>Région</th>}<th className="number">Écoles</th><th className="number">Calculables</th><th className="number">Besoin initial</th><th className="number">Départs</th><th className="number">Arrivées</th><th className="number">Besoin restant</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={`${r.region}-${r.department}-${r.district}-${i}`}>
          {level === 'district' && <><td>{r.region}</td><td>{r.department}</td><td>{r.district}</td></>}
          {level === 'region' && <td><strong>{r.region}</strong></td>}
          <td className="number">{fmt(r.schoolCount)}</td>
          <td className="number">{fmt(r.calculableCount)}</td>
          <td className="number warning-number">{fmt(r.initialNeed)}</td>
          <td className="number">{fmt(r.departures)}</td>
          <td className="number">{fmt(r.arrivals)}</td>
          <td className="number">{fmt(r.remainingNeed)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>
}

function ControlsPage({ result, setPage }: { result: SimulationResult | null; setPage: (page: PageKey) => void }) {
  const [query, setQuery] = useState('')
  const { selected, toggle, clear, matches } = useFilterState()
  const filterGroups = useMemo<FilterGroupDef[]>(() => {
    if (!result) return []
    return [{ key: 'reason', label: 'Motif', options: Array.from(new Set(result.controls.map(c => c.reason))).sort() }]
  }, [result])
  const filtered = useMemo(() => {
    if (!result) return []
    const q = query.toLowerCase()
    return result.controls.filter(c => matches('reason', c.reason) && (!q || `${c.code} ${c.name} ${c.reason}`.toLowerCase().includes(q)))
  }, [result, query, selected])
  if (!result) return <div className="page-stack"><EmptyState onImport={() => setPage('imports')} text="Les anomalies remontées par le moteur, les écarts de personnel et les données manquantes seront listés ici." /></div>
  return <div className="page-stack">
    <SearchToolbar query={query} setQuery={setQuery} placeholder="Rechercher par code, école ou motif" onExport={() => exportCSV('controles.csv', ['Code', 'École', 'Motif', 'Valeur 1', 'Valeur 2'], filtered.map(c => [c.code, c.name, c.reason, c.value1, c.value2]))}
      filters={<FilterMenu groups={filterGroups} selected={selected} onToggle={toggle} onClear={clear} />} />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="section-kicker">Fiabilité des sources</p><h2>Contrôles des données</h2></div><StatusPill tone={filtered.length ? 'warning' : 'success'}>{fmt(filtered.length)} anomalies</StatusPill></div>
      <div className="table-wrap"><table><thead><tr><th>École</th><th>Motif</th><th className="number">Valeur 1</th><th className="number">Valeur 2</th></tr></thead>
        <tbody>{filtered.length === 0 ? <tr><td colSpan={4} className="table-empty">Aucune anomalie.</td></tr> : filtered.slice(0, ROW_LIMIT).map((c, i) => <tr key={`${c.code}-${i}`}>
          <td><strong>{c.name}</strong><small>{c.code}</small></td>
          <td>{c.reason}</td>
          <td className="number">{c.value1 ?? '—'}</td>
          <td className="number">{c.value2 ?? '—'}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-footer"><span>{filtered.length > ROW_LIMIT ? `${ROW_LIMIT} premières lignes affichées sur ${fmt(filtered.length)}` : `${fmt(filtered.length)} lignes affichées`}</span></div>
    </section>
  </div>
}

function MethodPage() {
  const [exporting, setExporting] = useState(false)
  async function handleExport() {
    setExporting(true)
    try {
      const { downloadMethodologyDocx } = await import('@/lib/export-methodology-docx')
      await downloadMethodologyDocx()
    } finally {
      setExporting(false)
    }
  }
  return <div className="page-stack">
    <section className="panel page-intro">
      <div className="intro-icon"><BookOpen size={24} /></div>
      <div><p className="section-kicker">Référentiel de calcul</p><h2>Méthodologie</h2><p className="muted">Ce que veut dire chaque indicateur du tableau de bord, et les règles précises appliquées par le moteur.</p></div>
      <button className="button button-primary" onClick={handleExport} disabled={exporting} style={{ marginLeft: 'auto', flex: 'none' }}><ArrowDownToLine size={16} /> {exporting ? 'Génération…' : 'Exporter en Word (.docx)'}</button>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h2>Comprendre les indicateurs clés</h2></div></div>
      <p className="muted" style={{ marginBottom: 4 }}>Ces quatre indicateurs s'enchaînent : on part des écoles publiques, on ne garde que celles qu'on peut réellement calculer, on en déduit un besoin, puis un vivier d'enseignants pour le combler.</p>
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

function SettingsPage({ result, generatedAt, autoSources, autoLoading, onForceReload, onReset }: {
  result: SimulationResult | null
  generatedAt: string | null
  autoSources: AutoSource[] | null
  autoLoading: boolean
  onForceReload: () => void
  onReset: () => void
}) {
  const detected = (autoSources ?? []).filter(s => s.exists).length
  const total = (autoSources ?? []).length
  return <div className="page-stack">
    <section className="panel page-intro"><div className="intro-icon"><Settings2 size={24} /></div><div><p className="section-kicker">Session</p><h2>Paramètres</h2><p className="muted">État de la simulation en cours et actions de maintenance. Rien de tout ceci n'est envoyé à un service externe.</p></div></section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">État</p><h2>Simulation en cours</h2></div><StatusPill tone={result ? 'success' : 'warning'}>{result ? 'Chargée' : 'Aucune donnée'}</StatusPill></div>
      <div className="settings-info">
        <div><Info size={15} /><span>Moteur</span><strong>{ENGINE_VERSION}</strong></div>
        <div><Info size={15} /><span>Dernier calcul</span><strong>{generatedAt ? new Date(generatedAt).toLocaleString('fr-FR') : '—'}</strong></div>
        <div><Info size={15} /><span>Écoles publiques</span><strong>{result ? fmt(result.totals.publicSchools) : '—'}</strong></div>
        <div><Info size={15} /><span>Personnel importé</span><strong>{result ? fmt(result.totals.personnel) : '—'}</strong></div>
        <div><Info size={15} /><span>Fichiers détectés dans data/sources/</span><strong>{autoSources ? `${detected}/${total}` : '…'}</strong></div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="section-kicker">Actions</p><h2>Maintenance</h2></div></div>
      <div className="settings-actions">
        <div className="settings-action">
          <div><strong>Forcer un nouveau chargement automatique</strong><p className="muted">Relit les fichiers de data/sources/ et recalcule, même si le résultat était déjà en cache. Utile si les fichiers ont changé sans que leur nom ne change.</p></div>
          <button className="button button-secondary" disabled={autoLoading} onClick={onForceReload}><RotateCcw size={15} /> {autoLoading ? 'Chargement…' : 'Recharger'}</button>
        </div>
        <div className="settings-action">
          <div><strong>Réinitialiser la simulation</strong><p className="muted">Efface le résultat affiché dans l'application (écoles, vivier, rotations, effectifs). Les fichiers de data/sources/ ne sont pas touchés.</p></div>
          <button className="button button-secondary" onClick={onReset}><Trash2 size={15} /> Réinitialiser</button>
        </div>
      </div>
    </section>
  </div>
}

export default function Page() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [slots, setSlots] = useState(initialSlots)
  const [rawRows, setRawRows] = useState<Partial<Record<SlotId, unknown[][]>>>({})
  const [simulationState, setSimulationState] = useState<'idle' | 'running'>('idle')
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [rosters, setRosters] = useState<RosterSchool[] | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [autoSources, setAutoSources] = useState<AutoSource[] | null>(null)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  function refreshSources() {
    fetch('/api/sources').then(res => res.json()).then(data => setAutoSources(data.sources)).catch(() => setAutoSources(SOURCE_SLOTS.map(slot => ({ ...slot, exists: false, sizeBytes: null, modifiedAt: null }))))
  }

  useEffect(refreshSources, [])

  async function handleAutoLoad(force = false) {
    setAutoLoading(true)
    setAutoError(null)
    try {
      const res = await fetch(`/api/simulate${force ? '?force=1' : ''}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Échec du chargement automatique.')
      setResult(data.result)
      setRosters(data.rosters)
      setGeneratedAt(data.generatedAt ?? new Date().toISOString())
      setSimulationError(null)
      setPage('dashboard')
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : String(err))
    } finally {
      setAutoLoading(false)
    }
  }

  function handleReset() {
    setResult(null)
    setRosters(null)
    setGeneratedAt(null)
    setSimulationError(null)
    setAutoError(null)
  }

  async function handleFile(id: SlotId, file?: File) {
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: 'invalid', rows: 0, error: 'Le fichier doit être un classeur Excel (.xlsx ou .xls).' } : slot))
      return
    }
    try {
      const worksheet = slots.find(s => s.id === id)!.worksheet
      const rows = await readWorksheetRows(file, worksheet)
      setRawRows(current => ({ ...current, [id]: rows }))
      setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: 'ready', rows: Math.max(0, rows.length - slot.headers), error: null } : slot))
    } catch (err) {
      setRawRows(current => ({ ...current, [id]: undefined }))
      setSlots(current => current.map(slot => slot.id === id ? { ...slot, status: 'invalid', rows: 0, error: err instanceof Error ? err.message : String(err) } : slot))
    }
  }

  function handleSimulate() {
    setSimulationState('running')
    setSimulationError(null)
    setTimeout(() => {
      try {
        const inputs: Inputs = parseWorkbookRows({
          classrooms: rawRows.classrooms!, personnel: rawRows.personnel!, schools: rawRows.schools!, year5: rawRows.year5!,
        })
        const simulation = simulateRotation(inputs)
        const roster = buildSchoolRosters(inputs, simulation)
        setResult(simulation)
        setRosters(roster)
        setGeneratedAt(new Date().toISOString())
        setPage('dashboard')
      } catch (err) {
        setSimulationError(err instanceof Error ? err.message : String(err))
        setResult(null)
        setRosters(null)
      } finally {
        setSimulationState('idle')
      }
    }, 50)
  }

  const canSimulate = slots.every(s => s.status === 'ready') && simulationState === 'idle'

  return <div className="app-shell">
    <div className={`sidebar-dimmer ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />
    <div className={sidebarOpen ? 'sidebar-wrap open' : 'sidebar-wrap'}><Sidebar page={page} setPage={id => { setPage(id); setSidebarOpen(false) }} hasResult={!!result} /></div>
    <main className="main-content">
      <Topbar page={page} onMenu={() => setSidebarOpen(true)} result={result} simulationError={simulationError} />
      <div className="content-area">
        {simulationState === 'running' && <div className="running-banner"><RefreshCw size={16} className="spin" /> Lecture des feuilles et exécution du moteur…</div>}
        {page === 'dashboard' && <Dashboard setPage={setPage} result={result} />}
        {page === 'imports' && <ImportPage slots={slots} onFile={handleFile} onSimulate={handleSimulate} canSimulate={canSimulate} simulationError={simulationError} autoSources={autoSources} autoLoading={autoLoading} autoError={autoError} onAutoLoad={handleAutoLoad} />}
        {page === 'schools' && <SchoolsPage setPage={setPage} result={result} />}
        {page === 'pool' && <PoolPage result={result} setPage={setPage} />}
        {page === 'moves' && <MovesPage result={result} setPage={setPage} />}
        {page === 'roster' && <RosterPage rosters={rosters} setPage={setPage} />}
        {page === 'territory' && <TerritoryPage result={result} setPage={setPage} />}
        {page === 'controls' && <ControlsPage result={result} setPage={setPage} />}
        {page === 'method' && <MethodPage />}
        {page === 'settings' && <SettingsPage result={result} generatedAt={generatedAt} autoSources={autoSources} autoLoading={autoLoading} onForceReload={() => handleAutoLoad(true)} onReset={handleReset} />}
      </div>
    </main>
  </div>
}
