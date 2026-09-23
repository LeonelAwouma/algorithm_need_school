/**
 * Chaîne d'import : lecture du classeur, reconnaissance des colonnes,
 * construction des entités métier et contrôle qualité.
 *
 * Tout se passe dans le navigateur de l'utilisateur. Le fichier n'est jamais
 * envoyé nulle part : il est lu via `File.arrayBuffer()` et analysé en mémoire.
 */

import type { ColumnMappingReport } from '../../types/data-quality'
import type { DataQualityReport } from '../../types/data-quality'
import type { Dataset } from '../../types/simulation'
import { buildDataQualityReport } from '../validation/data-quality'
import { detectColumns, type DatasetKind } from './column-mapping'
import { recordsFromRows, type SheetRecord } from './normalize'
import { parseSchools, parseTeachers } from './parse'

/** Un classeur lu, conservé tel quel pour pouvoir être ré-analysé sans relecture. */
export interface FichierLu {
  kind: DatasetKind
  nomFichier: string
  feuilles: string[]
  feuilleLue: string
  headers: string[]
  records: SheetRecord[]
  mapping: ColumnMappingReport
}

const EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.csv']

export function extensionAcceptee(nom: string): boolean {
  const minuscule = nom.toLowerCase()
  return EXTENSIONS.some(ext => minuscule.endsWith(ext))
}

/**
 * Lit un classeur et prépare la table de correspondance des colonnes.
 * La feuille lue est la première du classeur, sauf indication contraire.
 */
export async function lireClasseur(kind: DatasetKind, file: File, feuille?: string): Promise<FichierLu> {
  if (!extensionAcceptee(file.name)) {
    throw new Error("Le fichier doit être un classeur Excel (.xlsx, .xls, .xlsm) ou un fichier CSV.")
  }

  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, dense: true })

  const feuilles = workbook.SheetNames
  const feuilleLue = feuille && feuilles.includes(feuille) ? feuille : feuilles[0]
  if (!feuilleLue) throw new Error(`Aucune feuille de calcul n'a été trouvée dans ${file.name}.`)

  const sheet = workbook.Sheets[feuilleLue]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]
  if (rows.length === 0) throw new Error(`La feuille « ${feuilleLue} » de ${file.name} est vide.`)

  const { headers, records } = recordsFromRows(rows)
  if (headers.every(h => h === '')) {
    throw new Error(`La première ligne de « ${feuilleLue} » ne contient aucun en-tête de colonne.`)
  }

  return {
    kind,
    nomFichier: file.name,
    feuilles,
    feuilleLue,
    headers,
    records,
    mapping: detectColumns(kind, headers),
  }
}

/**
 * Construit le jeu de données et son rapport qualité à partir des deux fichiers
 * lus et de leurs tables de correspondance (éventuellement corrigées à la main).
 */
export function construireDataset(
  etablissements: FichierLu,
  enseignants: FichierLu,
  reference: Date = new Date(),
): { dataset: Dataset; qualite: DataQualityReport } {
  const schools = parseSchools(etablissements.records, etablissements.mapping)
  const teachers = parseTeachers(enseignants.records, enseignants.mapping, schools, reference)

  const qualite = buildDataQualityReport({
    schools,
    teachers,
    schoolMapping: etablissements.mapping,
    teacherMapping: enseignants.mapping,
    lignesEtablissements: etablissements.records.length,
    lignesEnseignants: enseignants.records.length,
  })

  return {
    dataset: {
      schools,
      teachers,
      demonstration: false,
      importedAt: new Date().toISOString(),
      sourceFiles: { etablissements: etablissements.nomFichier, enseignants: enseignants.nomFichier },
    },
    qualite,
  }
}
