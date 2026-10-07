/**
 * Définition de la navigation.
 *
 * L'arborescence suit §17 du cahier des charges, regroupée en quatre étapes
 * (Collecter, Analyser, Simuler, Restituer), à la manière des catégories
 * « Collect / Manage / Analyze » d'OpenEMIS. Les entrées techniques ne sont
 * proposées qu'en Vue analyste : la Vue simplifiée conserve exactement le même
 * moteur et les mêmes données, mais n'expose que les pages de pilotage.
 */

import {
  ArrowRightLeft,
  BarChart3,
  BookMarked,
  BookOpen,
  Building2,
  ClipboardList,
  Crown,
  Gavel,
  ListOrdered,
  UserPlus,
  TrendingUp,
  Database,
  FileText,
  FlaskConical,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Map,
  ScrollText,
  Sigma,
  SlidersHorizontal,
  Upload,
  UserX,
  Users,
} from 'lucide-react'

export type PageKey =
  | 'import'
  | 'overview'
  | 'diagnostic'
  | 'territoires'
  | 'priorites'
  | 'schools'
  | 'teachers'
  | 'prince'
  | 'voeux'
  | 'arbitrage'
  | 'recrutes'
  | 'projections'
  | 'simulations'
  | 'comparison'
  | 'reports'
  | 'methodology'
  | 'settings'
  | 'engine'
  | 'data'
  | 'pool'
  | 'posts'
  | 'assignments'
  | 'unassigned'
  | 'logs'
  | 'acces'

/** Vue simplifiée (décideurs) ou Vue analyste (détail technique complet). */
export type ViewMode = 'simple' | 'analyste'

/** Rôle de la personne connectée : le DRH voit tout, un délégué régional ne voit que sa région. */
export type RoleAcces = 'drh' | 'delegue'

export interface NavItem {
  id: PageKey
  label: string
  /** Courte explication affichée sous le libellé dans la barre latérale. */
  sousTitre?: string
  icon: typeof LayoutDashboard
  /** `true` si l'entrée n'apparaît qu'en Vue analyste. */
  analysteSeulement?: boolean
  /** `true` si l'entrée est réservée au DRH : décisions et règles qui engagent tout le pays. */
  drhSeulement?: boolean
  /** L'entrée exige qu'un diagnostic ait été calculé. */
  exigeDonnees?: boolean
  /** L'entrée exige qu'une simulation ait été exécutée. */
  exigeSimulation?: boolean
}

export interface NavGroup {
  titre: string | null
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    titre: 'Collecter',
    items: [{ id: 'import', label: 'Ajouter les données', sousTitre: 'Import et contrôle qualité', icon: Upload }],
  },
  {
    titre: 'Analyser',
    items: [
      { id: 'overview', label: "Vue d'ensemble", sousTitre: 'Indicateurs et synthèse', icon: LayoutDashboard, exigeDonnees: true },
      { id: 'diagnostic', label: 'Situation nationale', icon: BarChart3, exigeDonnees: true },
      { id: 'territoires', label: 'Territoires', sousTitre: 'Carte et exploration', icon: Map, exigeDonnees: true },
      { id: 'priorites', label: 'Écoles prioritaires', icon: ListChecks, exigeDonnees: true },
      { id: 'schools', label: 'Écoles', icon: Building2, exigeDonnees: true },
      { id: 'teachers', label: 'Enseignants', icon: Users, exigeDonnees: true },
    ],
  },
  {
    titre: 'Simuler',
    items: [
      { id: 'prince', label: 'Fait de Prince', sousTitre: 'Redéploiements décidés par la DRH', icon: Crown, exigeDonnees: true, drhSeulement: true },
      { id: 'simulations', label: 'Scénarios', sousTitre: 'Créer et exécuter', icon: FlaskConical, exigeDonnees: true },
      { id: 'voeux', label: 'Vœux des enseignants', sousTitre: 'Demandes, recevabilité, scores et issue', icon: ListOrdered, exigeSimulation: true },
      { id: 'arbitrage', label: 'Commission d’arbitrage', sousTitre: 'Valider, rejeter ou corriger les propositions', icon: Gavel, exigeSimulation: true },
      { id: 'recrutes', label: 'Nouveaux recrutés', sousTitre: 'Déploiement sur les postes restés vacants', icon: UserPlus, exigeDonnees: true },
      { id: 'projections', label: 'Projections N+1 → N+3', sousTitre: 'Retraites, besoins et recrutement à prévoir', icon: TrendingUp, exigeSimulation: true },
      { id: 'comparison', label: 'Comparaison', sousTitre: 'Avant / après et scénarios', icon: ArrowRightLeft, exigeDonnees: true },
    ],
  },
  {
    titre: 'Restituer',
    items: [
      { id: 'reports', label: 'Rapports', sousTitre: 'Synthèse décisionnelle', icon: FileText, exigeDonnees: true },
      { id: 'methodology', label: 'Méthodologie', icon: BookOpen },
    ],
  },
  {
    titre: 'Vue analyste',
    items: [
      { id: 'engine', label: 'Configuration du moteur', sousTitre: 'Barème, poids et phases', icon: SlidersHorizontal, analysteSeulement: true, drhSeulement: true },
      { id: 'data', label: 'Qualité des données', sousTitre: 'Colonnes reconnues et contrôles', icon: Database, analysteSeulement: true, exigeDonnees: true },
      { id: 'pool', label: 'Vivier', icon: GraduationCap, analysteSeulement: true, exigeSimulation: true },
      { id: 'posts', label: 'Postes', icon: ClipboardList, analysteSeulement: true, exigeSimulation: true },
      { id: 'assignments', label: 'Affectations', icon: Sigma, analysteSeulement: true, exigeSimulation: true },
      { id: 'unassigned', label: 'Non affectés', icon: UserX, analysteSeulement: true, exigeSimulation: true },
      { id: 'logs', label: 'Journal de simulation', icon: ScrollText, analysteSeulement: true, exigeSimulation: true },
    ],
  },
]

/**
 * Entrée toujours visible, placée en bas de la barre latérale. Elle s'appelle
 * « Référentiel » et non « Paramètres » : ce qu'on y règle, ce sont les règles
 * de l'analyse, pas des options techniques.
 */
export const PAGE_SETTINGS: NavItem = {
  id: 'settings',
  label: 'Référentiel',
  sousTitre: "Règles utilisées pour l'analyse",
  icon: BookMarked,
  drhSeulement: true,
}

/** Gestion des accès : codes des délégués régionaux et validation de leurs entrées. */
export const PAGE_ACCES: NavItem = {
  id: 'acces',
  label: 'Accès des délégués',
  sousTitre: "Codes d'accès par région et validation des entrées",
  icon: KeyRound,
  drhSeulement: true,
}

const TOUTES = [...NAVIGATION.flatMap(g => g.items), PAGE_SETTINGS, PAGE_ACCES]

/** Titre de page affiché dans l'en-tête. */
export function titreDePage(page: PageKey): string {
  return TOUTES.find(i => i.id === page)?.label ?? "Vue d'ensemble"
}

/** Sous-titre de page, quand il existe. */
export function sousTitreDePage(page: PageKey): string | undefined {
  return TOUTES.find(i => i.id === page)?.sousTitre
}

/** Nom du groupe de navigation d'une page, pour le fil d'Ariane. */
export function groupeDePage(page: PageKey): string | undefined {
  if (page === PAGE_SETTINGS.id || page === PAGE_ACCES.id) return 'Configuration'
  return NAVIGATION.find(g => g.items.some(i => i.id === page))?.titre ?? undefined
}

/** Vrai si la page est réservée au DRH : un délégué ne doit ni la voir dans le menu ni l'ouvrir. */
export function pageReserveeAuDrh(page: PageKey): boolean {
  return TOUTES.some(i => i.id === page && i.drhSeulement)
}

/** Groupes visibles dans le mode d'affichage courant, pour le rôle connecté. */
export function navigationVisible(mode: ViewMode, role: RoleAcces): NavGroup[] {
  return NAVIGATION.map(groupe => ({
    ...groupe,
    items: groupe.items.filter(
      item => (mode === 'analyste' || !item.analysteSeulement) && (role === 'drh' || !item.drhSeulement),
    ),
  })).filter(groupe => groupe.items.length > 0)
}
