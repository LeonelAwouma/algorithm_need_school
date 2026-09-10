import * as XLSX from 'xlsx'

/**
 * Lit une feuille d'un classeur Excel dans le navigateur et la renvoie sous
 * forme de tableau de lignes (cellule vide -> null, nombres natifs conservés),
 * exactement la forme attendue par parseWorkbookRows du moteur de rotation.
 */
export async function readWorksheetRows(file: File, sheetName: string): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, dense: true })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Feuille "${sheetName}" introuvable dans ${file.name}. Feuilles disponibles : ${workbook.SheetNames.join(', ')}`)
  }
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]
}

export function listWorksheetNames(file: File): Promise<string[]> {
  return file.arrayBuffer().then(buffer => {
    const workbook = XLSX.read(buffer, { type: 'array', bookSheets: true })
    return workbook.SheetNames
  })
}

/** Lit la première feuille d'un classeur, quel que soit son nom. */
export async function readFirstWorksheetRows(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, dense: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error(`Aucune feuille trouvée dans ${file.name}.`)
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]
}
