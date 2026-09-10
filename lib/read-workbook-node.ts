// Lecture serveur (Node) des classeurs XLSX depuis data/sources/. Réservé aux
// routes API : dépend de fs/xlsx, ne pas importer depuis un composant client.
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

export const SOURCES_DIR = path.join(process.cwd(), 'data', 'sources')

export interface SourceFileInfo {
  exists: boolean
  sizeBytes: number | null
  modifiedAt: string | null
}

export function sourceFileInfo(filename: string): SourceFileInfo {
  try {
    const stat = fs.statSync(path.join(SOURCES_DIR, filename))
    return { exists: true, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() }
  } catch {
    return { exists: false, sizeBytes: null, modifiedAt: null }
  }
}

export function readWorksheetRowsFromDisk(filename: string, sheetName: string): unknown[][] {
  const filePath = path.join(SOURCES_DIR, filename)
  // XLSX.readFile() mis-detects the fs binding under Turbopack's bundling of
  // this route; reading the buffer ourselves and calling XLSX.read() avoids that.
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, dense: true })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Feuille "${sheetName}" introuvable dans ${filename}. Feuilles disponibles : ${workbook.SheetNames.join(', ')}`)
  }
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]
}
