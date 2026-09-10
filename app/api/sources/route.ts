import { NextResponse } from 'next/server'
import { SOURCE_SLOTS } from '@/lib/sources'
import { sourceFileInfo } from '@/lib/read-workbook-node'

export async function GET() {
  const sources = SOURCE_SLOTS.map(slot => ({ ...slot, ...sourceFileInfo(slot.filename) }))
  return NextResponse.json({ sources })
}
