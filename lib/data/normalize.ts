/**
 * Primitives de normalisation partagées par la lecture des fichiers, la
 * reconnaissance des colonnes et le contrôle qualité. Fonctions pures, sans
 * dépendance au navigateur : elles sont directement testables.
 */

import type { Zone } from '../../types/education'

export const text = (v: unknown): string => (v == null ? '' : String(v)).trim()
export const lower = (v: unknown): string => text(v).toLowerCase()

/** Supprime les accents, la ponctuation et les espaces : « Nb. Élèves » → « nbeleves ». */
export function normalizeKey(v: unknown): string {
  return text(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Comme normalizeKey mais en conservant les séparations par un espace unique. */
export function normalizeLabel(v: unknown): string {
  return text(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Nombre tolérant : accepte la virgule décimale et les espaces de milliers. */
export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = text(v).replace(/\s/g, '').replace(',', '.')
  if (s === '') return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}

/** Comme `num`, mais renvoie `null` quand la cellule est vide ou illisible. */
export function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = text(v).replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Entier positif ou nul, `null` si la valeur est absente. */
export function intOrNull(v: unknown): number | null {
  const n = numOrNull(v)
  return n == null ? null : Math.trunc(n)
}

/** Système de dates Excel 1900 : le jour 0 correspond au 30 décembre 1899. */
export function excelSerialToDate(n: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000)
}

/** Lit une date au format sériel Excel, ISO (AAAA-MM-JJ) ou français (JJ/MM/AAAA). */
export function parseDateValue(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v < 1 || v > 80000) return null
    return excelSerialToDate(v)
  }
  const s = text(v)
  if (!s) return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Âge en années décimales à la date de référence, `null` sans date de naissance. */
export function ageFromBirthDate(d: Date | null, reference: Date = new Date()): number | null {
  if (!d) return null
  const refUtc = Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate())
  const birthUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const ans = (refUtc - birthUtc) / 86400000 / 365.25
  return ans >= 0 && ans < 120 ? ans : null
}

const ZONE_ALIASES: Record<string, Zone> = {
  urbaine: 'urbaine',
  urbain: 'urbaine',
  urbanie: 'urbaine',
  ville: 'urbaine',
  semiurbaine: 'semi_urbaine',
  semiurbain: 'semi_urbaine',
  periurbaine: 'semi_urbaine',
  periurbain: 'semi_urbaine',
  rurale: 'rurale',
  rural: 'rurale',
  campagne: 'rurale',
}

/** Rattache une zone écrite librement à l'une des trois valeurs du modèle. */
export function parseZone(v: unknown): Zone {
  const key = normalizeKey(v)
  if (!key) return 'inconnue'
  return ZONE_ALIASES[key] ?? 'inconnue'
}

const OUI = new Set(['oui', 'o', 'yes', 'y', '1', 'true', 'vrai', 'etat', 'fonctionnaire'])
const NON = new Set(['non', 'n', 'no', '0', 'false', 'faux'])

/**
 * Lit une réponse binaire. Quand la cellule est vide, `defaut` est renvoyé :
 * les anciens fichiers omettent parfois la colonne `paye_par_etat`, et la
 * version historique du moteur considérait alors l'enseignant comme payé.
 */
export function parseBoolean(v: unknown, defaut: boolean): boolean {
  const key = normalizeKey(v)
  if (!key) return defaut
  if (OUI.has(key)) return true
  if (NON.has(key)) return false
  return defaut
}

/** Arrondi à quatre décimales, utilisé pour tous les scores affichés. */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Arrondi à deux décimales, utilisé pour les ratios affichés. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Division protégée : renvoie `null` plutôt que `Infinity` ou `NaN`. */
export function ratio(numerateur: number | null, denominateur: number | null): number | null {
  if (numerateur == null || denominateur == null) return null
  if (!Number.isFinite(numerateur) || !Number.isFinite(denominateur) || denominateur === 0) return null
  return numerateur / denominateur
}

/**
 * Distance de Levenshtein bornée, utilisée pour la comparaison locale de
 * chaînes lors de la reconnaissance des colonnes. Aucune API externe.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = new Array<number>(b.length + 1)
  let current = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) previous[j] = j
  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cout)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[b.length]
}

/** Similarité 0–1 entre deux chaînes déjà normalisées. */
export function similarity(a: string, b: string): number {
  const longueur = Math.max(a.length, b.length)
  if (longueur === 0) return 1
  return 1 - levenshtein(a, b) / longueur
}

/**
 * Convertit les lignes brutes d'une feuille (en-têtes en première ligne) en
 * objets indexés par en-tête. Les lignes entièrement vides sont ignorées, mais
 * l'index de ligne du classeur est conservé pour pouvoir localiser une erreur.
 */
export interface SheetRecord {
  values: Record<string, unknown>
  ligne: number
}

export function recordsFromRows(rows: unknown[][]): { headers: string[]; records: SheetRecord[] } {
  const headers = (rows[0] ?? []).map(text)
  const records: SheetRecord[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (!row.some(v => v != null && text(v) !== '')) continue
    const values: Record<string, unknown> = {}
    for (let c = 0; c < headers.length; c++) values[headers[c]] = row[c] ?? null
    records.push({ values, ligne: i + 1 })
  }
  return { headers, records }
}
