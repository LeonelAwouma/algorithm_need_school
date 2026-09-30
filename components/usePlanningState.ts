'use client'

/**
 * État central de l'application.
 *
 * Un seul moteur alimente les deux modes d'affichage : la Vue simplifiée et la
 * Vue analyste lisent exactement le même diagnostic et les mêmes simulations,
 * seules les pages proposées diffèrent.
 *
 * Les données importées ne vivent que dans cet état React. Rien n'est écrit sur
 * le disque hormis quelques préférences d'interface, et « Effacer les données
 * de cette session » remet tout à zéro.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SchoolDiagnostic, School, Teacher } from '@/types/education'
import type { FaitPrince } from '@/types/prince'
import type { DataQualityReport } from '@/types/data-quality'
import type { Dataset, EngineSettings, GeographicScope, SimulationResult, SimulationScenario } from '@/types/simulation'
import { runDiagnostic } from '@/lib/analytics/diagnostic'
import {
  FILTRES_VIDES,
  LIBELLE_MANQUANT,
  appliquerFiltres,
  construireArbreTerritorial,
  filtrerParTerritoire,
  selectionLabel,
  selectionLevel,
  territoiresDe,
  trouverNoeud,
  type GlobalFilters,
} from '@/lib/analytics/territory'
import { restreindreARegion } from '@/lib/acces/perimetre'
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/config/settings'
import type { RegionCameroun } from '@/lib/geography/cameroon'
import { construireJeuDemonstration } from '@/lib/data/demo-dataset'
import type { FichierLu } from '@/lib/data/import'
import { runSimulation } from '@/lib/simulation/engine'
import { calculerFlux, restreindreResultat } from '@/lib/simulation/filter'
import { appliquerFaitsPrince, nouveauFaitPrince, verifierFaitPrince } from '@/lib/simulation/prince'
import { SCENARIOS_GEOGRAPHIQUES, scenarioGeographique } from '@/lib/simulation/scenarios'
import { ecrirePreference, effacerPreferences, lirePreference } from '@/lib/storage/session'
import type { PageKey, ViewMode } from './layout/navigation'

/**
 * @param regionImposee Région du délégué connecté, `null` pour le DRH. Quand elle est
 * renseignée, seules les données de cette région entrent dans l'état de l'application.
 */
export function usePlanningState(regionImposee: RegionCameroun | null = null) {
  const [page, setPage] = useState<PageKey>('import')
  const [mode, setMode] = useState<ViewMode>('simple')
  const [menuOuvert, setMenuOuvert] = useState(false)

  const [fichiers, setFichiers] = useState<{ etablissements: FichierLu | null; enseignants: FichierLu | null }>({
    etablissements: null,
    enseignants: null,
  })
  const [datasetImporte, setDatasetImporte] = useState<Dataset | null>(null)
  const [qualite, setQualite] = useState<DataQualityReport | null>(null)
  /**
   * Fait de Prince : décisions de la DRH, conservées en mémoire pour la session
   * (comme toute donnée d'enseignant, elles ne sont jamais écrites sur le disque).
   */
  const [faitsPrince, setFaitsPrince] = useState<FaitPrince[]>([])
  /** Nature du dernier jeu chargé (démonstration ou non), pour savoir si les décisions de la DRH restent valables. */
  const dernierJeuDemo = useRef<boolean | null>(null)

  const [settings, setSettings] = useState<EngineSettings>(DEFAULT_SETTINGS)
  const [filtres, setFiltres] = useState<GlobalFilters>(FILTRES_VIDES)

  const [scenarios, setScenarios] = useState<SimulationScenario[]>([])
  const [resultats, setResultats] = useState<Record<string, SimulationResult>>({})
  const [scenarioActif, setScenarioActif] = useState<string>('')
  const [calculEnCours, setCalculEnCours] = useState(false)
  const [calculAutoDemande, setCalculAutoDemande] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ecoleSelectionnee, setEcoleSelectionnee] = useState<string | null>(null)

  // --- Préférences d'interface (aucune donnée métier n'est persistée) -------
  useEffect(() => {
    setMode(lirePreference<ViewMode>('vue', 'simple'))
    const parametresEnregistres = lirePreference<Partial<EngineSettings> | null>('parametres', null)
    if (parametresEnregistres) setSettings(s => mergeSettings(s, parametresEnregistres))
  }, [])

  const changerMode = useCallback((m: ViewMode) => {
    setMode(m)
    ecrirePreference('vue', m)
  }, [])

  const majSettings = useCallback((maj: (s: EngineSettings) => EngineSettings) => {
    setSettings(courant => {
      const suivant = maj(courant)
      ecrirePreference('parametres', suivant)
      return suivant
    })
  }, [])

  // --- Fait de Prince : appliqué AVANT tout calcul --------------------------
  // Les données importées ne sont jamais modifiées : le jeu « effectif » en est une
  // copie où les redéploiements décidés par la DRH sont déjà acquis. Diagnostic,
  // simulation, pages et rapports lisent tous ce jeu effectif.
  const prince = useMemo(
    () => (datasetImporte ? appliquerFaitsPrince(datasetImporte, faitsPrince) : null),
    [datasetImporte, faitsPrince],
  )
  const dataset = prince?.dataset ?? null
  const faitsPrinceAppliques = useMemo(() => prince?.appliques ?? [], [prince])
  const nbFaitsPrinceActifs = faitsPrinceAppliques.filter(e => e.statut === 'applique').length

  // --- Diagnostic (Moteur A) : recalculé dès que données ou normes changent --
  const diagnostic = useMemo(
    () => (dataset ? runDiagnostic(dataset.schools, settings) : null),
    [dataset, settings],
  )

  /** Diagnostic sans les décisions de la DRH, pour mesurer ce qu'elles changent. */
  const diagnosticSansPrince = useMemo(() => {
    if (!datasetImporte) return null
    if (nbFaitsPrinceActifs === 0) return diagnostic
    return runDiagnostic(datasetImporte.schools, settings)
  }, [datasetImporte, nbFaitsPrinceActifs, diagnostic, settings])

  const arbreComplet = useMemo(
    () => (diagnostic ? construireArbreTerritorial(diagnostic.schools) : null),
    [diagnostic],
  )

  const diagnosticsFiltres = useMemo<SchoolDiagnostic[]>(
    () => (diagnostic ? appliquerFiltres(diagnostic.schools, filtres) : []),
    [diagnostic, filtres],
  )

  const arbreFiltre = useMemo(() => construireArbreTerritorial(diagnosticsFiltres), [diagnosticsFiltres])

  /**
   * Nœud correspondant au niveau territorial sélectionné, et ses enfants
   * directs. Sans cette descente, une page affichant `arbre.children` montrerait
   * toujours des régions, y compris après être entré dans l'une d'elles.
   */
  const noeudCourant = useMemo(
    () => trouverNoeud(arbreFiltre, filtres.territoire) ?? arbreFiltre,
    [arbreFiltre, filtres.territoire],
  )
  const enfantsTerritoriaux = noeudCourant.children

  /** Options des menus de filtres, dépendantes du niveau territorial déjà choisi. */
  const optionsFiltres = useMemo(() => {
    if (!diagnostic || !arbreComplet) {
      return { regions: [], departements: [], communes: [], typesEtab: [], zones: [] }
    }
    const regions = arbreComplet.children.map(c => c.territory.nom)
    const noeudRegion = filtres.territoire.region
      ? trouverNoeud(arbreComplet, { region: filtres.territoire.region, departement: null, commune: null })
      : null
    const departements = noeudRegion ? noeudRegion.children.map(c => c.territory.nom) : []
    const noeudDept =
      filtres.territoire.region && filtres.territoire.departement
        ? trouverNoeud(arbreComplet, {
            region: filtres.territoire.region,
            departement: filtres.territoire.departement,
            commune: null,
          })
        : null
    const communes = noeudDept ? noeudDept.children.map(c => c.territory.nom) : []

    const types = new Set<string>()
    const zones = new Set<SchoolDiagnostic['school']['zone']>()
    for (const d of diagnostic.schools) {
      if (d.school.typeEtab) types.add(d.school.typeEtab)
      zones.add(d.school.zone)
    }

    return {
      regions,
      departements,
      communes,
      typesEtab: [...types].sort((a, b) => a.localeCompare(b, 'fr')),
      zones: [...zones],
    }
  }, [diagnostic, arbreComplet, filtres.territoire.region, filtres.territoire.departement])

  // --- Simulations (Moteur B) ------------------------------------------------

  /** Exécute un scénario sur l'ensemble du jeu de données et conserve son résultat. */
  const executerScenario = useCallback(
    (scenario: SimulationScenario): SimulationResult | null => {
      if (!diagnostic || !dataset) return null
      const resultat = runSimulation({
        diagnostics: diagnostic.schools,
        teachers: dataset.teachers,
        scenario,
        faitsPrince: faitsPrinceAppliques,
      })
      setScenarios(courants => (courants.some(s => s.id === scenario.id) ? courants : [...courants, scenario]))
      setResultats(courants => ({ ...courants, [scenario.id]: resultat }))
      return resultat
    },
    [diagnostic, dataset, faitsPrinceAppliques],
  )

  /** Calcule les trois scénarios géographiques de base, utilisés partout comme repère. */
  const calculerScenariosDeBase = useCallback(() => {
    if (!diagnostic || !dataset) return
    setCalculEnCours(true)
    setErreur(null)
    // Laisse le navigateur peindre l'indicateur d'activité avant le calcul.
    window.setTimeout(() => {
      try {
        const nouveaux: SimulationScenario[] = SCENARIOS_GEOGRAPHIQUES.map(scope => scenarioGeographique(scope, settings))
        const calcules: Record<string, SimulationResult> = {}
        for (const scenario of nouveaux) {
          calcules[scenario.id] = runSimulation({
            diagnostics: diagnostic.schools,
            teachers: dataset.teachers,
            scenario,
            faitsPrince: faitsPrinceAppliques,
          })
        }
        setScenarios(courants => [...courants.filter(s => !s.id.startsWith('geo-')), ...nouveaux])
        setResultats(courants => ({ ...courants, ...calcules }))
        setScenarioActif(courant => courant || 'geo-departement')
      } catch (err) {
        setErreur(err instanceof Error ? err.message : String(err))
      } finally {
        setCalculEnCours(false)
      }
    }, 30)
  }, [diagnostic, dataset, settings, faitsPrinceAppliques])

  /**
   * Lance les scénarios de base dès qu'un jeu de données devient exploitable.
   * Le déclenchement passe par un drapeau plutôt que par un appel direct au
   * chargement : à cet instant, le diagnostic n'est pas encore calculé, et la
   * fonction de calcul capturerait un état vide.
   */
  useEffect(() => {
    if (!calculAutoDemande || !diagnostic || !dataset) return
    setCalculAutoDemande(false)
    calculerScenariosDeBase()
  }, [calculAutoDemande, diagnostic, dataset, calculerScenariosDeBase])

  /**
   * Une décision de la DRH ajoutée ou annulée change les effectifs des écoles : tous
   * les scénarios déjà calculés (prédéfinis comme personnalisés) sont recalculés, avec
   * leurs paramètres figés, pour que l'algorithme en tienne compte immédiatement.
   */
  const signaturePrince = faitsPrinceAppliques.map(e => `${e.fait.id}:${e.statut}`).join('|')
  const signatureVue = useRef(signaturePrince)
  useEffect(() => {
    if (signatureVue.current === signaturePrince) return
    signatureVue.current = signaturePrince
    if (!diagnostic || !dataset || scenarios.length === 0) return
    try {
      const recalcules: Record<string, SimulationResult> = {}
      for (const scenario of scenarios) {
        recalcules[scenario.id] = runSimulation({
          diagnostics: diagnostic.schools,
          teachers: dataset.teachers,
          scenario,
          faitsPrince: faitsPrinceAppliques,
        })
      }
      setResultats(courants => ({ ...courants, ...recalcules }))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }, [signaturePrince, diagnostic, dataset, scenarios, faitsPrinceAppliques])

  /** Les résultats deviennent obsolètes si les paramètres changent après coup. */
  const resultatsObsoletes = useMemo(() => {
    const calcules = Object.values(resultats)
    if (calcules.length === 0) return false
    return calcules.some(r => {
      const scenario = scenarios.find(s => s.id === r.scenarioId)
      if (!scenario) return true
      return (
        scenario.settings.normeEncadrement.enseignantsParClasse !== settings.normeEncadrement.enseignantsParClasse ||
        scenario.settings.minimumAConserver.mode !== settings.minimumAConserver.mode ||
        scenario.settings.minimumAConserver.ratio !== settings.minimumAConserver.ratio ||
        scenario.settings.minimumAConserver.valeurFixe !== settings.minimumAConserver.valeurFixe ||
        scenario.settings.sourceDesPostes !== settings.sourceDesPostes
      )
    })
  }, [resultats, scenarios, settings])

  /** Identifiants des écoles du périmètre filtré, pour relire les résultats. */
  const idsDuPerimetre = useMemo(() => new Set(diagnosticsFiltres.map(d => d.school.id)), [diagnosticsFiltres])

  const resultatComplet = scenarioActif ? (resultats[scenarioActif] ?? null) : null

  /** Résultat tel qu'il doit être lu sur le périmètre courant. */
  const resultatAffiche = useMemo(() => {
    if (!resultatComplet) return null
    if (!diagnostic || idsDuPerimetre.size === diagnostic.schools.length) return resultatComplet
    return restreindreResultat(resultatComplet, idsDuPerimetre)
  }, [resultatComplet, diagnostic, idsDuPerimetre])

  /**
   * Bilan des mouvements du périmètre : reçus, sortants, internes et solde.
   * Indispensable dès qu'un scénario laisse des mouvements franchir la
   * frontière du territoire observé — la seule vue « destination » masquerait
   * alors les enseignants qui en sont partis.
   */
  const fluxTerritorial = useMemo(
    () => (resultatComplet ? calculerFlux(resultatComplet, idsDuPerimetre) : null),
    [resultatComplet, idsDuPerimetre],
  )

  /** Les trois scénarios géographiques, pour la comparaison et la carte. */
  const comparaison = useMemo(() => {
    const ordre: GeographicScope[] = SCENARIOS_GEOGRAPHIQUES
    return ordre
      .map(scope => resultats[`geo-${scope}`])
      .filter((r): r is SimulationResult => !!r)
      .map(r => (idsDuPerimetre.size && diagnostic && idsDuPerimetre.size !== diagnostic.schools.length ? restreindreResultat(r, idsDuPerimetre) : r))
  }, [resultats, idsDuPerimetre, diagnostic])

  // --- Chargement des données ------------------------------------------------

  const chargerDataset = useCallback(
    (recu: Dataset, rapport: DataQualityReport | null): Dataset => {
      // Délégué régional : les autres régions sont écartées ici, avant d'entrer dans
      // l'état. Aucun calcul, aucune page, aucun export ne peut donc les atteindre.
      const nouveau = regionImposee ? restreindreARegion(recu, regionImposee) : recu
      if (regionImposee && nouveau.schools.length === 0) {
        throw new Error(
          `Aucun établissement de la région ${regionImposee} dans ces données. Votre accès est limité à cette région : vérifiez la colonne « Région » du fichier des établissements.`,
        )
      }
      // Les décisions de la DRH survivent à un nouvel import du même fichier (mêmes matricules),
      // mais pas au passage entre le jeu de démonstration et de vraies données.
      if (dernierJeuDemo.current !== null && dernierJeuDemo.current !== nouveau.demonstration) setFaitsPrince([])
      dernierJeuDemo.current = nouveau.demonstration
      setDatasetImporte(nouveau)
      setQualite(rapport)
      setScenarios([])
      setResultats({})
      setScenarioActif('')
      setEcoleSelectionnee(null)
      setFiltres(FILTRES_VIDES)
      setErreur(null)
      setCalculAutoDemande(true)
      return nouveau
    },
    [regionImposee],
  )

  const chargerDemonstration = useCallback(() => {
    try {
      chargerDataset(construireJeuDemonstration(), null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      return
    }
    setFichiers({ etablissements: null, enseignants: null })
    setPage('overview')
  }, [chargerDataset])

  const effacerSession = useCallback(() => {
    setFichiers({ etablissements: null, enseignants: null })
    setDatasetImporte(null)
    setFaitsPrince([])
    dernierJeuDemo.current = null
    setQualite(null)
    setScenarios([])
    setResultats({})
    setScenarioActif('')
    setEcoleSelectionnee(null)
    setFiltres(FILTRES_VIDES)
    setSettings(DEFAULT_SETTINGS)
    setErreur(null)
    setCalculAutoDemande(false)
    setPage('import')
    effacerPreferences()
  }, [])

  // --- Fait de Prince : enregistrement et annulation --------------------------

  /**
   * Enregistre une décision de la DRH. Aucun contrôle de l'algorithme n'est appliqué :
   * seules les impossibilités matérielles (enseignant ou école manquants, même école,
   * enseignant déjà redéployé) sont refusées.
   */
  const ajouterFaitPrince = useCallback(
    (enseignant: Teacher | null, destination: SchoolDiagnostic | null, reference: string): { ok: true } | { ok: false; motif: string } => {
      const verdict = verifierFaitPrince(enseignant, destination, faitsPrince)
      if (!verdict.ok || !enseignant || !destination) return verdict
      const origine: School | null = datasetImporte?.schools.find(e => e.id === enseignant.idEtabAttache) ?? null
      setFaitsPrince(courants => [...courants, nouveauFaitPrince(enseignant, origine, destination.school, reference)])
      return { ok: true }
    },
    [faitsPrince, datasetImporte],
  )

  /** Annule une décision : elle est retirée de la liste, l'enseignant retrouve son école d'origine. */
  const annulerFaitPrince = useCallback((id: string) => {
    setFaitsPrince(courants => courants.filter(e => e.id !== id))
  }, [])

  // --- Aides de navigation ---------------------------------------------------

  const ouvrirEcole = useCallback((id: string) => {
    setEcoleSelectionnee(id)
    setPage('schools')
  }, [])

  const explorerTerritoire = useCallback(
    (region: string) => {
      setFiltres(f => ({ ...f, territoire: { region, departement: null, commune: null } }))
      setPage('territoires')
    },
    [],
  )

  /** Diagnostics d'un territoire donné, indépendamment des filtres non territoriaux. */
  const diagnosticsDuTerritoire = useCallback(
    (region: string | null, departement: string | null, commune: string | null) =>
      diagnostic ? filtrerParTerritoire(diagnostic.schools, { region, departement, commune }) : [],
    [diagnostic],
  )

  const perimetre = selectionLabel(filtres.territoire)
  const donneesChargees = !!dataset
  const simulationPrete = Object.keys(resultats).length > 0

  return {
    // Navigation
    page,
    setPage,
    mode,
    changerMode,
    menuOuvert,
    setMenuOuvert,

    // Données (dataset : jeu effectif, décisions de la DRH appliquées ; datasetImporte : fichier tel quel)
    fichiers,
    setFichiers,
    dataset,
    datasetImporte,
    qualite,
    chargerDataset,
    chargerDemonstration,
    effacerSession,
    donneesChargees,
    regionImposee,

    // Paramètres et filtres
    settings,
    majSettings,
    filtres,
    setFiltres,
    optionsFiltres,
    perimetre,

    // Diagnostic
    diagnostic,
    diagnosticsFiltres,
    diagnosticsDuTerritoire,
    arbreComplet,
    arbreFiltre,
    noeudCourant,
    enfantsTerritoriaux,
    niveauTerritorial: selectionLevel(filtres.territoire),

    // Fait de Prince
    faitsPrince,
    faitsPrinceAppliques,
    nbFaitsPrinceActifs,
    diagnosticSansPrince,
    ajouterFaitPrince,
    annulerFaitPrince,

    // Simulation
    scenarios,
    resultats,
    scenarioActif,
    setScenarioActif,
    executerScenario,
    calculerScenariosDeBase,
    resultatComplet,
    resultatAffiche,
    fluxTerritorial,
    comparaison,
    resultatsObsoletes,
    calculEnCours,
    erreur,
    setErreur,
    simulationPrete,

    // Sélection
    ecoleSelectionnee,
    setEcoleSelectionnee,
    ouvrirEcole,
    explorerTerritoire,

    // Constantes utiles aux pages
    libelleTerritoireManquant: LIBELLE_MANQUANT,
    territoiresDe,
  }
}

export type PlanningStore = ReturnType<typeof usePlanningState>
