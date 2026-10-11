/**
 * Serveur de référence — contexte « Données » : dictionnaire des colonnes,
 * jeu de démonstration, qualité, validation, établissements et enseignants.
 */

import { trierParPriorite } from '../../lib/analytics/diagnostic'
import { SCHOOL_FIELDS, TEACHER_FIELDS } from '../../lib/data/column-aliases'
import { detectColumns } from '../../lib/data/column-mapping'
import { COLONNES_RECRUES } from '../../lib/data/recrues'
import { normaliserSituation, libelleSituation } from '../../lib/data/situation-familiale'
import { estEligibleAdministrativement } from '../../lib/simulation/pool'
import { calculerBaremeIndividuel, detaillerBareme, pointsSituation } from '../../lib/simulation/scoring'
import { buildDataQualityReport } from '../../lib/validation/data-quality'
import type { SchoolDiagnostic, Teacher } from '../../types/education'
import type { ColumnMappingReport } from '../../types/data-quality'
import type { SimulationResult } from '../../types/simulation'
import type {
  ColonneAttendue,
  ControleValidation,
  EnseignantDetail,
  EnseignantResume,
  EtablissementDetail,
  FichierImporte,
  JeuDeDonnees,
  QualiteJeu,
  TypeFichier,
  ValidationJeu,
} from '../../../frontend/components/shared/api/contrat'
import { JEU, REFERENCE_ISO, type Contexte } from './contexte'
import { json, type Catalogue } from './outils'

const F = 'donnees'

/** Dictionnaire des colonnes attendues, par nature de classeur. */
function colonnesAttendues(): Record<'etablissements' | 'enseignants' | 'recrues', ColonneAttendue[]> {
  return {
    etablissements: SCHOOL_FIELDS.map(c => ({ ...c })),
    enseignants: TEACHER_FIELDS.map(c => ({ ...c })),
    recrues: COLONNES_RECRUES.map(c => ({
      champ: String(c.champ),
      label: c.label,
      requis: c.requis,
      consequence: c.requis ? 'Sans cette colonne, la ligne de la recrue est écartée.' : 'Information facultative.',
      alias: c.alias,
    })),
  }
}

/** Description du jeu de démonstration. */
export function jeuDemonstration(ctx: Contexte): JeuDeDonnees {
  return {
    id: JEU,
    demonstration: true,
    importeLe: REFERENCE_ISO,
    fichiersSource: { etablissements: null, enseignants: null },
    anneeScolaire: ctx.settings.anneeScolaire,
    statut: 'brouillon',
    nbEtablissements: ctx.dataset.schools.length,
    nbEnseignants: ctx.dataset.teachers.length,
    nbUnitesCalcul: ctx.diagnostic.schools.length,
    scenarioRetenuId: null,
    nbFaitsPrinceActifs: 0,
    donneesElevesDisponibles: ctx.diagnostic.donneesElevesDisponibles,
  }
}

/**
 * Classeur tel que le serveur le décrirait après lecture : en-têtes canoniques,
 * reconnaissance des colonnes par le moteur et cinq lignes d'aperçu.
 */
function fichierImporte(ctx: Contexte, type: TypeFichier): { fichier: FichierImporte; mapping: ColumnMappingReport } {
  const champs = type === 'etablissements' ? SCHOOL_FIELDS : TEACHER_FIELDS
  const enTetes = champs.map(c => c.champ)
  const mapping = detectColumns(type, enTetes)
  const lignes: Record<string, unknown>[] =
    type === 'etablissements' ? ctx.dataset.schools.map(s => ({ ...s })) : ctx.dataset.teachers.map(t => ({ ...t }))
  const apercu = lignes.slice(0, 5).map(ligne => {
    const valeurs: Record<string, string | number | boolean | null> = {}
    for (const champ of enTetes) {
      const v = ligne[champ]
      valeurs[champ] =
        v == null
          ? null
          : typeof v === 'number' || typeof v === 'boolean'
            ? v
            : v instanceof Date
              ? v.toISOString()
              : String(v)
    }
    return valeurs
  })
  return {
    mapping,
    fichier: {
      id: `fichier-${type}`,
      type,
      nomFichier: `demonstration-${type}.xlsx`,
      feuilles: ['Feuille1'],
      feuilleLue: 'Feuille1',
      lignes: lignes.length,
      apercu,
      correspondances: json(mapping),
    },
  }
}

/** Contrôles avant validation du jeu comme référence des projections. */
function controlesValidation(ctx: Contexte): ControleValidation[] {
  const enseignants = ctx.dataset.teachers
  const part = (n: number) => (enseignants.length === 0 ? 0 : n / enseignants.length)
  const avecNaissance = part(enseignants.filter(t => t.dateNaissance || t.age != null).length)
  const avecSousSysteme = part(enseignants.filter(t => t.sousSysteme).length)
  const ecolesConnues = new Set(ctx.dataset.schools.map(s => s.id))
  const rattaches = enseignants.filter(t => ecolesConnues.has(t.idEtabAttache)).length
  const pct = (v: number) => `${Math.round(v * 100)} %`
  return [
    {
      code: 'rattachement',
      libelle: 'Enseignants rattachés à une école connue',
      ok: rattaches === enseignants.length,
      bloquant: true,
      detail: `${rattaches} enseignant(s) sur ${enseignants.length} rattaché(s) à une école du fichier.`,
    },
    {
      code: 'date_naissance',
      libelle: 'Âge ou date de naissance renseigné',
      ok: avecNaissance >= 0.9,
      bloquant: false,
      detail: `${pct(avecNaissance)} des enseignants : base des départs à la retraite prévus.`,
    },
    {
      code: 'sous_systeme',
      libelle: 'Sous-système renseigné',
      ok: avecSousSysteme >= 0.9,
      bloquant: false,
      detail: `${pct(avecSousSysteme)} des enseignants : base de la ventilation par sous-système.`,
    },
    {
      code: 'eleves',
      libelle: 'Effectifs d’élèves disponibles',
      ok: ctx.diagnostic.donneesElevesDisponibles,
      bloquant: false,
      detail: `${ctx.diagnostic.ecolesEnRepli} école(s) calculée(s) sans effectif d’élèves.`,
    },
  ]
}

/** Ligne de la liste des enseignants : barème, mobilité et son explication. */
export function enseignantResume(ctx: Contexte, t: Teacher, resultat: SimulationResult | null): EnseignantResume {
  const ecole: SchoolDiagnostic | undefined = ctx.diagnostic.bySchoolId[t.idEtabAttache]
  const eligibilite = estEligibleAdministrativement(t, ctx.settings)
  const dansVivier = new Set(resultat?.pool.teachers.map(p => p.teacher.id) ?? [])

  let mobilisable = false
  let motif: string
  if (t.faitPrinceId) {
    motif = 'Redéployé par fait de Prince (décision de la DRH) : non remis en cause par l’algorithme'
  } else if (!eligibilite.ok) {
    motif = `Non éligible : ${eligibilite.label}`
  } else if (!ecole) {
    motif = 'École de rattachement absente du fichier établissements'
  } else if (ecole.excedentTheorique <= 0) {
    motif = `Son école n’a pas d’excédent (${ecole.enseignantsEtat} enseignants pour un minimum de ${ecole.enseignantsMinimumAConserver})`
  } else if (resultat && !dansVivier.has(t.id)) {
    motif = `Au-delà de l’excédent de son école (${ecole.excedentTheorique} place(s) mobilisable(s))`
  } else {
    mobilisable = true
    motif = `Son école dispose d’un excédent de ${ecole.excedentTheorique} enseignant(s)`
  }

  const reconnue = normaliserSituation(t.situationFamiliale)
  return {
    teacher: json(t),
    nomEtab: ecole?.school.nom || t.idEtabAttache,
    bareme: calculerBaremeIndividuel(t, ctx.settings, ecole?.priorite.niveauDifficulte ?? null),
    mobilisable,
    motif,
    situation: {
      libelle: reconnue ? libelleSituation(reconnue) : t.situationFamiliale,
      reconnue: reconnue !== null,
      points: pointsSituation(t.situationFamiliale, ctx.settings.scoring),
    },
  }
}

/** Enregistre les routes du contexte « Données » et renvoie l'état initial qui en dépend. */
export function routesDonnees(ctx: Contexte, catalogue: Catalogue) {
  const colonnes = colonnesAttendues()
  for (const type of ['etablissements', 'enseignants', 'recrues'] as const) {
    catalogue.ajouter(F, 'fichiers/colonnes/', { type }, colonnes[type])
  }

  const jeu = jeuDemonstration(ctx)
  catalogue.ajouter(F, 'jeux/', {}, [jeu])
  catalogue.ajouter(F, `jeux/${JEU}/`, {}, jeu)

  const etab = fichierImporte(ctx, 'etablissements')
  const ens = fichierImporte(ctx, 'enseignants')
  const qualite = buildDataQualityReport({
    schools: ctx.dataset.schools,
    teachers: ctx.dataset.teachers,
    schoolMapping: etab.mapping,
    teacherMapping: ens.mapping,
    lignesEtablissements: ctx.dataset.schools.length,
    lignesEnseignants: ctx.dataset.teachers.length,
  })
  // Le jeu de démonstration est produit par l'application : pas de rapport de qualité d'import.
  const qualiteJeu: QualiteJeu = { rapport: null, correspondances: { etablissements: null, enseignants: null } }
  catalogue.ajouter(F, `jeux/${JEU}/qualite/`, {}, qualiteJeu)

  const validation: ValidationJeu = {
    statut: 'brouillon',
    valideLe: null,
    validePar: null,
    controles: controlesValidation(ctx),
  }

  // Établissements : liste complète classée par priorité, puis une fiche par école.
  const diagnostics = trierParPriorite(ctx.diagnostic.schools)
  catalogue.ajouterListe(F, `jeux/${JEU}/etablissements/`, {}, json(diagnostics))
  catalogue.ajouterListe(F, `jeux/${JEU}/recherche/etablissements/`, {}, json(diagnostics))
  for (const d of ctx.diagnostic.schools) {
    const fiche: EtablissementDetail = {
      diagnostic: json(d),
      enseignants: json(ctx.dataset.teachers.filter(t => t.idEtabAttache === d.school.id)),
      structure: d.school.estStructure,
    }
    catalogue.ajouter(F, `jeux/${JEU}/etablissements/${encodeURIComponent(d.school.id)}/`, {}, fiche)
  }

  // Enseignants : sans scénario (règle d'excédent seule), puis pour chaque scénario calculé.
  const variantes: [Record<string, string>, SimulationResult | null][] = [
    [{}, null],
    ...ctx.scenarios.map(s => [{ scenario: s.scenario.id }, s.resultat] as [Record<string, string>, SimulationResult]),
  ]
  for (const [query, resultat] of variantes) {
    const lignes = ctx.dataset.teachers.map(t => enseignantResume(ctx, t, resultat))
    catalogue.ajouterListe(F, `jeux/${JEU}/enseignants/`, query, lignes)
  }
  catalogue.ajouterListe(F, `jeux/${JEU}/recherche/enseignants/`, {}, json(ctx.dataset.teachers))
  for (const t of ctx.dataset.teachers) {
    const ecole = ctx.diagnostic.bySchoolId[t.idEtabAttache]
    const detail: EnseignantDetail = {
      ...enseignantResume(ctx, t, null),
      ecole: ecole ? json(ecole.school) : null,
      detailBareme: detaillerBareme(t, ctx.settings, ecole?.priorite.niveauDifficulte ?? null),
    }
    catalogue.ajouter(F, `jeux/${JEU}/enseignants/${encodeURIComponent(t.id)}/`, {}, detail)
  }

  return {
    jeu,
    qualite: json(qualite),
    validation,
    fichiers: { etablissements: etab.fichier, enseignants: ens.fichier },
  }
}
