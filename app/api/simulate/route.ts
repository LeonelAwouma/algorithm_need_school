import { NextRequest, NextResponse } from 'next/server'
import { SOURCE_SLOTS, type SlotId } from '@/lib/sources'
import { readWorksheetRowsFromDisk, sourceFileInfo } from '@/lib/read-workbook-node'
import { buildSchoolRosters, ENGINE_VERSION, parseWorkbookRows, simulateRotation } from '@/lib/rotation-engine'

// La lecture des classeurs (surtout le personnel, ~23 Mo) domine le temps de
// réponse. On met en cache le JSON déjà sérialisé, invalidé dès qu'un fichier
// de data/sources/ change de taille ou de date de modification, dès qu'une
// modification du moteur change ENGINE_VERSION, ou par ?force=1.
let cache: { fingerprint: string; body: string } | null = null

export async function POST(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1'
  const infos = SOURCE_SLOTS.map(slot => ({ slot, info: sourceFileInfo(slot.filename) }))
  const missing = infos.filter(({ info }) => !info.exists)
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Fichiers manquants dans data/sources/ : ${missing.map(m => m.slot.filename).join(', ')}` },
      { status: 400 },
    )
  }

  const fingerprint = `${ENGINE_VERSION}|` + infos.map(({ info }) => `${info.sizeBytes}:${info.modifiedAt}`).join('|')
  if (!force && cache && cache.fingerprint === fingerprint) {
    return new NextResponse(cache.body, { headers: { 'content-type': 'application/json' } })
  }

  try {
    const rows = {} as Record<SlotId, unknown[][]>
    for (const slot of SOURCE_SLOTS) rows[slot.id] = readWorksheetRowsFromDisk(slot.filename, slot.worksheet)
    const inputs = parseWorkbookRows(rows)
    const result = simulateRotation(inputs)
    const rosters = buildSchoolRosters(inputs, result)
    const body = JSON.stringify({ result, rosters, generatedAt: new Date().toISOString() })
    cache = { fingerprint, body }
    return new NextResponse(body, { headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error('simulate failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
