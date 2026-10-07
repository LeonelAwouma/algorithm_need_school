/**
 * Reconnaissance locale des colonnes d'un classeur (§10 étape 3).
 *
 * L'ordre de résolution est strictement celui imposé par le cahier des charges :
 *   1. nom exact ;
 *   2. dictionnaire local d'alias ;
 *   3. normalisation des caractères (accents, ponctuation, casse) ;
 *   4. comparaison locale de chaînes (distance de Levenshtein) ;
 *   5. confirmation manuelle de l'utilisateur en cas d'ambiguïté.
 *
 * Les étapes 1 à 4 sont déterministes et hors ligne ; l'étape 5 est rendue
 * possible par `applyManualMapping`.
 */

import type { ColumnMappingReport, ColumnMatch } from '../../types/data-quality'
import { normalizeKey, normalizeLabel, similarity } from './normalize'
import { SCHOOL_FIELDS, TEACHER_FIELDS, type FieldDefinition } from './column-aliases'

/** En dessous de ce seuil, une correspondance approchante n'est pas proposée. */
const SEUIL_APPROCHANT = 0.82
/** En dessous de ce seuil de confiance, l'UI demande une confirmation manuelle. */
export const SEUIL_CONFIRMATION = 0.85

export type DatasetKind = 'etablissements' | 'enseignants'

export function fieldsFor(dataset: DatasetKind): FieldDefinition[] {
  return dataset === 'etablissements' ? SCHOOL_FIELDS : TEACHER_FIELDS
}

interface Candidate {
  enTete: string
  methode: ColumnMatch['methode']
  confiance: number
}

/** Mots vides ignorés lors de la comparaison par mots d'un en-tête. */
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'par', 'au', 'aux', 'a', 'et', 'pour', 'dans', 'nombre', 'nb', 'nbre'])

/** Mots significatifs d'un en-tête ou d'un alias, normalisés et dédoublonnés. */
function motsSignificatifs(valeur: string): string[] {
  const mots = normalizeLabel(valeur.replace(/_/g, ' '))
    .split(' ')
    .filter(m => m.length > 0 && !MOTS_VIDES.has(m))
  return [...new Set(mots)]
}

/**
 * Cherche, pour un champ donné, le meilleur en-tête disponible du fichier.
 * `exactSeulement` : nom exact ou alias du dictionnaire uniquement (premier passage).
 */
function meilleurCandidat(field: FieldDefinition, enTetes: string[], dejaPris: Set<string>, exactSeulement = false): Candidate | null {
  const libres = enTetes.filter(h => h !== '' && !dejaPris.has(h))
  if (libres.length === 0) return null

  // 1 — nom exact (champ canonique ou alias écrits à l'identique).
  const nomsExacts = new Set<string>([field.champ, ...field.alias])
  for (const h of libres) {
    if (nomsExacts.has(h)) return { enTete: h, methode: 'exact', confiance: 1 }
  }

  // 2 — dictionnaire d'alias, comparé sur la forme normalisée.
  const clesAlias = new Set(field.alias.map(normalizeKey))
  for (const h of libres) {
    if (clesAlias.has(normalizeKey(h))) return { enTete: h, methode: 'alias', confiance: 0.98 }
  }
  if (exactSeulement) return null

  // 3 — normalisation du nom canonique lui-même.
  const cleChamp = normalizeKey(field.champ)
  for (const h of libres) {
    if (normalizeKey(h) === cleChamp) return { enTete: h, methode: 'normalise', confiance: 0.95 }
  }

  // 3 bis — comparaison par mots significatifs : « Nom de l'école » reconnaît
  // l'alias « nom_ecole » alors que la distance de caractères les sépare trop.
  const refsTokens = [field.champ, ...field.alias].map(motsSignificatifs).filter(t => t.length >= 2)
  let parMots: Candidate | null = null
  for (const h of libres) {
    const htok = motsSignificatifs(h)
    if (htok.length === 0) continue
    for (const rtok of refsTokens) {
      if (!rtok.every(t => htok.includes(t))) continue
      const confiance = rtok.length === htok.length ? 0.93 : 0.88
      if (!parMots || confiance > parMots.confiance) parMots = { enTete: h, methode: 'normalise', confiance }
    }
  }
  if (parMots) return parMots

  // 4 — comparaison locale approchante, contre le champ et chacun de ses alias.
  const references = [field.champ, ...field.alias].map(normalizeKey)
  let meilleur: Candidate | null = null
  for (const h of libres) {
    const cle = normalizeKey(h)
    if (cle.length < 3) continue
    let score = 0
    for (const ref of references) score = Math.max(score, similarity(cle, ref))
    if (score >= SEUIL_APPROCHANT && (!meilleur || score > meilleur.confiance)) {
      meilleur = { enTete: h, methode: 'approchant', confiance: Math.round(score * 100) / 100 }
    }
  }
  return meilleur
}

/**
 * Construit la table de correspondance d'un fichier, en deux passages : d'abord
 * les noms exacts et les alias du dictionnaire pour tous les champs, puis les
 * rapprochements approchants pour les champs restants. Sans ce premier passage,
 * un champ résolu tôt pouvait capter par approximation l'en-tête exact d'un autre
 * (« Sous_Systeme_Formation » pris pour la formation continue). Les champs requis
 * passent en premier à chaque passage.
 */
export function detectColumns(dataset: DatasetKind, enTetes: string[]): ColumnMappingReport {
  const fields = fieldsFor(dataset)
  const ordonnes = [...fields].sort((a, b) => Number(b.requis) - Number(a.requis))
  const dejaPris = new Set<string>()
  const parChamp = new Map<string, ColumnMatch>()

  const exacts = new Map<string, Candidate>()
  for (const field of ordonnes) {
    const candidat = meilleurCandidat(field, enTetes, dejaPris, true)
    if (candidat) {
      dejaPris.add(candidat.enTete)
      exacts.set(field.champ, candidat)
    }
  }

  for (const field of ordonnes) {
    const candidat = exacts.get(field.champ) ?? meilleurCandidat(field, enTetes, dejaPris)
    if (candidat && !exacts.has(field.champ)) dejaPris.add(candidat.enTete)
    parChamp.set(field.champ, {
      champ: field.champ,
      label: field.label,
      enTete: candidat?.enTete ?? null,
      methode: candidat?.methode ?? 'absent',
      confiance: candidat?.confiance ?? 0,
      requis: field.requis,
    })
  }

  const matches = fields.map(f => parChamp.get(f.champ)!)
  return {
    dataset,
    enTetes,
    matches,
    enTetesInconnus: enTetes.filter(h => h !== '' && !dejaPris.has(h)),
    incomplet: matches.some(m => m.requis && m.enTete === null),
  }
}

/** Applique une correspondance choisie manuellement par l'utilisateur (étape 5). */
export function applyManualMapping(
  report: ColumnMappingReport,
  champ: string,
  enTete: string | null,
): ColumnMappingReport {
  const matches = report.matches.map(m => {
    if (m.champ === champ) {
      return enTete === null
        ? { ...m, enTete: null, methode: 'absent' as const, confiance: 0 }
        : { ...m, enTete, methode: 'manuel' as const, confiance: 1 }
    }
    // Un en-tête ne peut servir qu'une seule fois : on libère l'ancien porteur.
    if (enTete !== null && m.enTete === enTete) {
      return { ...m, enTete: null, methode: 'absent' as const, confiance: 0 }
    }
    return m
  })
  const pris = new Set(matches.map(m => m.enTete).filter((h): h is string => h !== null))
  return {
    ...report,
    matches,
    enTetesInconnus: report.enTetes.filter(h => h !== '' && !pris.has(h)),
    incomplet: matches.some(m => m.requis && m.enTete === null),
  }
}

/** Correspondances dont la confiance est trop faible pour être appliquées sans confirmation. */
export function matchesAConfirmer(report: ColumnMappingReport): ColumnMatch[] {
  return report.matches.filter(m => m.enTete !== null && m.confiance < SEUIL_CONFIRMATION)
}

/** Accès aux valeurs d'une ligne via la table de correspondance. */
export function makeAccessor(report: ColumnMappingReport): (values: Record<string, unknown>, champ: string) => unknown {
  const enTeteParChamp = new Map(report.matches.map(m => [m.champ, m.enTete]))
  return (values, champ) => {
    const enTete = enTeteParChamp.get(champ)
    return enTete == null ? null : values[enTete] ?? null
  }
}

/** Liste des champs métier effectivement résolus dans le fichier. */
export function champsResolus(report: ColumnMappingReport): Set<string> {
  return new Set(report.matches.filter(m => m.enTete !== null).map(m => m.champ))
}
