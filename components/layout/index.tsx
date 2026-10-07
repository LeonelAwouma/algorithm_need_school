'use client'

/**
 * Ossature de l'application : bandeau supérieur, barre latérale, titre de page,
 * fil d'Ariane territorial et barre de filtres globaux.
 */

import { useState, type ReactNode } from 'react'
// ACCÈS DÉSACTIVÉ : `LogOut` et `UserRound` ne servent qu'à la personne connectée, à réimporter avec elle.
import { ChevronDown, ChevronRight, Home, Menu, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import type { SchoolSeverity, Zone, ZoneSecurite } from '@/types/education'
import { LIBELLE_ZONE_SECURITE, ZONES_SECURITE } from '@/lib/simulation/libelles'
import type { GlobalFilters, TerritorySelection } from '@/lib/analytics/territory'
import { breadcrumb } from '@/lib/analytics/territory'
import { Pill } from '../common'
import {
  PAGE_ACCES,
  PAGE_SETTINGS,
  groupeDePage,
  navigationVisible,
  sousTitreDePage,
  titreDePage,
  type NavItem,
  type PageKey,
  type RoleAcces,
  type ViewMode,
} from './navigation'

export const LIBELLE_SEVERITE: Record<SchoolSeverity, string> = {
  excedent: 'Excédent mobilisable',
  satisfaisant: 'Situation satisfaisante',
  deficit_faible: 'Déficit faible',
  deficit_important: 'Déficit important',
  deficit_critique: 'Déficit critique',
}

export const LIBELLE_ZONE: Record<Zone, string> = {
  urbaine: 'Urbaine',
  semi_urbaine: 'Semi-urbaine',
  rurale: 'Rurale',
  inconnue: 'Zone non renseignée',
}

/** Barre latérale : navigation seule, regroupée en étapes (Collecter → Restituer). */
export function Sidebar({
  page,
  onNavigate,
  mode,
  role,
  entreesEnAttente,
  ouverte,
  onFermer,
  donneesChargees,
  simulationPrete,
  version,
}: {
  page: PageKey
  onNavigate: (page: PageKey) => void
  mode: ViewMode
  role: RoleAcces
  /** Entrées de délégués que le DRH doit encore valider, rappelées dans le menu. */
  entreesEnAttente: number
  ouverte: boolean
  onFermer: () => void
  donneesChargees: boolean
  simulationPrete: boolean
  /** Version installée, affichée dans l'application de bureau pour faciliter l'assistance. */
  version?: string
}) {
  const estDesactive = (item: NavItem) =>
    (item.exigeDonnees && !donneesChargees) || (item.exigeSimulation && !simulationPrete)

  const bouton = (item: NavItem) => {
    const desactive = estDesactive(item)
    const Icone = item.icon
    return (
      <li key={item.id}>
        <button
          type="button"
          className="nav-item"
          aria-current={page === item.id ? 'page' : undefined}
          disabled={desactive}
          title={desactive ? 'Disponible une fois les données importées et analysées' : undefined}
          onClick={() => {
            onNavigate(item.id)
            onFermer()
          }}
        >
          <Icone size={17} aria-hidden="true" />
          <span>{item.label}</span>
          {item.id === PAGE_ACCES.id && entreesEnAttente > 0 && (
            <span className="nav-badge" aria-label={`${entreesEnAttente} entrée(s) en attente de validation`}>
              {entreesEnAttente}
            </span>
          )}
        </button>
      </li>
    )
  }

  return (
    <aside className={ouverte ? 'sidebar open' : 'sidebar'} aria-label="Navigation principale">
      <nav>
        {navigationVisible(mode, role).map(groupe => (
          <div className="nav-group" key={groupe.titre}>
            {groupe.titre && <p className="nav-group-title">{groupe.titre}</p>}
            <ul className="nav-list">{groupe.items.map(bouton)}</ul>
          </div>
        ))}
        {role === 'drh' && (
          <div className="nav-group">
            <p className="nav-group-title">Configuration</p>
            <ul className="nav-list">
              {bouton(PAGE_SETTINGS)}
              {/* ACCÈS DÉSACTIVÉ (voir app/page.tsx) : {bouton(PAGE_ACCES)} */}
            </ul>
          </div>
        )}
      </nav>

      <p className="privacy-note">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          Traitement entièrement local : aucun fichier n’est envoyé sur un réseau.
          {version && <span className="sidebar-version">AlgoPlanR version {version}</span>}
        </span>
      </p>
    </aside>
  )
}

/**
 * Bandeau supérieur, sur toute la largeur : identité de l'application, contexte
 * de travail (territoire, année, scénario) et réglages de la session. Le titre
 * de la page, lui, est porté par `PageHeader`.
 */
export function Topbar({
  mode,
  onModeChange,
  onOuvrirMenu,
  etat,
  territoire,
  anneeScolaire,
  scenario,
  onEffacer,
  // ACCÈS DÉSACTIVÉ (voir app/page.tsx) :
  // utilisateur,
  // onDeconnexion,
}: {
  mode: ViewMode
  onModeChange: (m: ViewMode) => void
  onOuvrirMenu: () => void
  etat: ReactNode
  territoire: string
  anneeScolaire: string
  scenario: string
  onEffacer: () => void
  // ACCÈS DÉSACTIVÉ :
  // /** Personne connectée : « DRH » ou « Délégué · Centre ». */
  // utilisateur: string
  // onDeconnexion: () => void
}) {
  return (
    <header className="topbar">
      <button type="button" className="mobile-menu" onClick={onOuvrirMenu} aria-label="Ouvrir le menu de navigation">
        <Menu size={19} />
      </button>

      <div className="brand">
        {/* Emblème du logo, décoratif : le nom de la plateforme est écrit à côté. */}
        <img className="brand-logo" src="/logo-mark.png" alt="" width={64} height={38} />
        <span>
          <span className="brand-name">ALGOPLANR</span>
          <span className="brand-sub">Affectation des enseignants</span>
        </span>
        <img
          className="brand-partner"
          src="/logo-parec.png"
          alt="PAREC — Programme d’appui à la réforme de l’éducation au Cameroun"
          title="PAREC — Programme d’appui à la réforme de l’éducation au Cameroun"
          width={42}
          height={42}
        />
      </div>

      <dl className="context">
        <div>
          <dt>Territoire</dt>
          <dd>{territoire}</dd>
        </div>
        <div>
          <dt>Année scolaire</dt>
          <dd>{anneeScolaire}</dd>
        </div>
        <div>
          <dt>Scénario</dt>
          <dd title={scenario}>{scenario}</dd>
        </div>
      </dl>

      <div className="topbar-actions">
        {etat}
        <div className="mode-switch" role="group" aria-label="Mode d’affichage">
          <button type="button" aria-pressed={mode === 'simple'} onClick={() => onModeChange('simple')}>
            Simplifiée
          </button>
          <button type="button" aria-pressed={mode === 'analyste'} onClick={() => onModeChange('analyste')}>
            Analyste
          </button>
        </div>
        <button type="button" className="icon-button" onClick={onEffacer} title="Effacer les données de cette session">
          <Trash2 size={16} aria-hidden="true" />
          <span className="sr-only">Effacer les données de cette session</span>
        </button>
        {/* ACCÈS DÉSACTIVÉ : personne connectée et déconnexion.
        <span className="user-chip" title="Personne connectée">
          <UserRound size={14} aria-hidden="true" />
          {utilisateur}
        </span>
        <button type="button" className="icon-button" onClick={onDeconnexion} title="Se déconnecter">
          <LogOut size={16} aria-hidden="true" />
          <span className="sr-only">Se déconnecter</span>
        </button> */}
      </div>
    </header>
  )
}

/** Titre de la page, précédé d'un fil d'Ariane « Accueil › Étape › Page ». */
export function PageHeader({ page, onAccueil }: { page: PageKey; onAccueil: () => void }) {
  const groupe = groupeDePage(page)
  const sousTitre = sousTitreDePage(page)
  return (
    <div className="page-header no-print">
      <nav aria-label="Fil d’Ariane">
        <ol className="breadcrumb">
          <li>
            <button type="button" onClick={onAccueil}>
              <Home size={13} aria-hidden="true" /> Accueil
            </button>
          </li>
          {groupe && (
            <li>
              <span className="breadcrumb-sep" aria-hidden="true">
                <ChevronRight size={13} />
              </span>
              <span>{groupe}</span>
            </li>
          )}
          <li>
            <span className="breadcrumb-sep" aria-hidden="true">
              <ChevronRight size={13} />
            </span>
            <span aria-current="page">{titreDePage(page)}</span>
          </li>
        </ol>
      </nav>
      <h1>{titreDePage(page)}</h1>
      {sousTitre && <p className="hint">{sousTitre}</p>}
    </div>
  )
}

export function TerritoryBreadcrumb({
  selection,
  onSelect,
}: {
  selection: TerritorySelection
  onSelect: (s: TerritorySelection) => void
}) {
  const items = breadcrumb(selection)
  return (
    <nav aria-label="Fil d’Ariane territorial">
      <ol className="breadcrumb">
        {items.map((item, i) => {
          const dernier = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`}>
              {i > 0 && (
                <span className="breadcrumb-sep" aria-hidden="true">
                  <ChevronRight size={13} />
                </span>
              )}
              {dernier ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <button type="button" onClick={() => onSelect(item.selection)}>
                  {item.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface OptionsFiltres {
  regions: string[]
  departements: string[]
  communes: string[]
  typesEtab: string[]
  zones: Zone[]
}

const SEVERITES: SchoolSeverity[] = ['excedent', 'satisfaisant', 'deficit_faible', 'deficit_important', 'deficit_critique']

export function FilterBar({
  filtres,
  options,
  onChange,
  onReset,
  scenarioActif,
  scenarios,
  onScenarioChange,
}: {
  filtres: GlobalFilters
  options: OptionsFiltres
  onChange: (f: GlobalFilters) => void
  onReset: () => void
  scenarioActif: string
  scenarios: { id: string; nom: string }[]
  onScenarioChange: (id: string) => void
}) {
  const majTerritoire = (patch: Partial<TerritorySelection>) =>
    onChange({ ...filtres, territoire: { ...filtres.territoire, ...patch } })

  const [plusOuvert, setPlusOuvert] = useState(false)
  const nbSecondaires =
    filtres.zones.length + filtres.zonesSecurite.length + filtres.typesEtab.length + filtres.severites.length + (filtres.multigradesUniquement !== null ? 1 : 0)

  const chips: { cle: string; label: string; retirer: () => void }[] = []
  if (filtres.territoire.region) {
    chips.push({
      cle: 'region',
      label: `Région : ${filtres.territoire.region}`,
      retirer: () => majTerritoire({ region: null, departement: null, commune: null }),
    })
  }
  if (filtres.territoire.departement) {
    chips.push({
      cle: 'departement',
      label: `Département : ${filtres.territoire.departement}`,
      retirer: () => majTerritoire({ departement: null, commune: null }),
    })
  }
  if (filtres.territoire.commune) {
    chips.push({ cle: 'commune', label: `Commune : ${filtres.territoire.commune}`, retirer: () => majTerritoire({ commune: null }) })
  }
  for (const zone of filtres.zones) {
    chips.push({
      cle: `zone-${zone}`,
      label: `Zone : ${LIBELLE_ZONE[zone]}`,
      retirer: () => onChange({ ...filtres, zones: filtres.zones.filter(z => z !== zone) }),
    })
  }
  for (const zone of filtres.zonesSecurite) {
    chips.push({
      cle: `securite-${zone}`,
      label: `Sécurité : ${LIBELLE_ZONE_SECURITE[zone]}`,
      retirer: () => onChange({ ...filtres, zonesSecurite: filtres.zonesSecurite.filter(z => z !== zone) }),
    })
  }
  for (const type of filtres.typesEtab) {
    chips.push({
      cle: `type-${type}`,
      label: `Type : ${type}`,
      retirer: () => onChange({ ...filtres, typesEtab: filtres.typesEtab.filter(t => t !== type) }),
    })
  }
  for (const severite of filtres.severites) {
    chips.push({
      cle: `sev-${severite}`,
      label: LIBELLE_SEVERITE[severite],
      retirer: () => onChange({ ...filtres, severites: filtres.severites.filter(s => s !== severite) }),
    })
  }
  if (filtres.multigradesUniquement !== null) {
    chips.push({
      cle: 'multigrade',
      label: filtres.multigradesUniquement ? 'Avec classes multigrades' : 'Sans classes multigrades',
      retirer: () => onChange({ ...filtres, multigradesUniquement: null }),
    })
  }

  return (
    <div className="stack-tight no-print">
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="f-region">Région</label>
          <select
            id="f-region"
            value={filtres.territoire.region ?? ''}
            onChange={e => majTerritoire({ region: e.target.value || null, departement: null, commune: null })}
          >
            <option value="">Toutes les régions</option>
            {options.regions.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-departement">Département</label>
          <select
            id="f-departement"
            value={filtres.territoire.departement ?? ''}
            disabled={!filtres.territoire.region}
            onChange={e => majTerritoire({ departement: e.target.value || null, commune: null })}
          >
            <option value="">Tous les départements</option>
            {options.departements.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-commune">Commune</label>
          <select
            id="f-commune"
            value={filtres.territoire.commune ?? ''}
            disabled={!filtres.territoire.departement}
            onChange={e => majTerritoire({ commune: e.target.value || null })}
          >
            <option value="">Toutes les communes</option>
            {options.communes.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-scenario">Scénario affiché</label>
          <select id="f-scenario" value={scenarioActif} onChange={e => onScenarioChange(e.target.value)}>
            <option value="">Situation actuelle (sans simulation)</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-bar-actions">
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={plusOuvert}
            aria-controls="filtres-secondaires"
            onClick={() => setPlusOuvert(o => !o)}
          >
            <ChevronDown size={13} aria-hidden="true" className={plusOuvert ? 'chevron-open' : undefined} /> Plus de filtres
            {nbSecondaires > 0 && <span className="btn-count">{nbSecondaires}</span>}
          </button>
          <button type="button" className="btn btn-sm" onClick={onReset} disabled={chips.length === 0}>
            <RotateCcw size={13} aria-hidden="true" /> Réinitialiser
          </button>
        </div>

        {plusOuvert && (
          <div className="filter-more" id="filtres-secondaires">
            <div className="field">
              <label htmlFor="f-zone">Zone</label>
              <select
                id="f-zone"
                value={filtres.zones[0] ?? ''}
                onChange={e => onChange({ ...filtres, zones: e.target.value ? [e.target.value as Zone] : [] })}
              >
                <option value="">Toutes les zones</option>
                {options.zones.map(z => (
                  <option key={z} value={z}>
                    {LIBELLE_ZONE[z]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-securite">Zone de sécurité</label>
              <select
                id="f-securite"
                value={filtres.zonesSecurite[0] ?? ''}
                onChange={e =>
                  onChange({ ...filtres, zonesSecurite: e.target.value ? [e.target.value as ZoneSecurite] : [] })
                }
              >
                <option value="">Toutes (verte, jaune, rouge)</option>
                {ZONES_SECURITE.map(z => (
                  <option key={z} value={z}>
                    {LIBELLE_ZONE_SECURITE[z]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-type">Type d’établissement</label>
              <select
                id="f-type"
                value={filtres.typesEtab[0] ?? ''}
                onChange={e => onChange({ ...filtres, typesEtab: e.target.value ? [e.target.value] : [] })}
              >
                <option value="">Tous les types</option>
                {options.typesEtab.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-severite">Niveau de déficit</label>
              <select
                id="f-severite"
                value={filtres.severites[0] ?? ''}
                onChange={e => onChange({ ...filtres, severites: e.target.value ? [e.target.value as SchoolSeverity] : [] })}
              >
                <option value="">Tous les niveaux</option>
                {SEVERITES.map(s => (
                  <option key={s} value={s}>
                    {LIBELLE_SEVERITE[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-multigrade">Classes multigrades</label>
              <select
                id="f-multigrade"
                value={filtres.multigradesUniquement === null ? '' : filtres.multigradesUniquement ? 'oui' : 'non'}
                onChange={e =>
                  onChange({ ...filtres, multigradesUniquement: e.target.value === '' ? null : e.target.value === 'oui' })
                }
              >
                <option value="">Indifférent</option>
                <option value="oui">Avec classes multigrades</option>
                <option value="non">Sans classes multigrades</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="active-filters">
          <Pill tone="info">{chips.length} filtre(s) actif(s)</Pill>
          {chips.map(c => (
            <span className="chip" key={c.cle}>
              {c.label}
              <button type="button" onClick={c.retirer} aria-label={`Retirer le filtre ${c.label}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
