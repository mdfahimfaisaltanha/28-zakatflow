import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'
import { hawlState } from '@/lib/zakat'

// GET    /api/payers/{id} — payer detail: assets, liabilities, hawl state, calculation history
// PATCH  /api/payers/{id} — { hawlStartedAt } set/reset the hawl start date
// DELETE /api/payers/{id}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const payer = await queryOne(`SELECT * FROM payers WHERE id = $1`, [params.id])
  if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 })

  const [assets, liabilities, calculations] = await Promise.all([
    query(`SELECT * FROM assets WHERE payer_id = $1 ORDER BY created_at`, [params.id]),
    query(`SELECT * FROM liabilities WHERE payer_id = $1 ORDER BY created_at`, [params.id]),
    query(`SELECT * FROM zakat_calculations WHERE payer_id = $1 ORDER BY calc_date DESC, created_at DESC LIMIT 20`, [params.id]),
  ])

  return NextResponse.json({
    payer,
    assets,
    liabilities,
    calculations,
    hawl: hawlState((payer as { hawl_started_at: string | null }).hawl_started_at),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const payer = await queryOne(`SELECT id, name FROM payers WHERE id = $1`, [params.id])
  if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 })

  const body = await req.json()
  if (!('hawlStartedAt' in body)) {
    return NextResponse.json({ error: 'hawlStartedAt is required (ISO date, or null to reset)' }, { status: 400 })
  }
  const value = body.hawlStartedAt === null ? null : String(body.hawlStartedAt)

  await query(`UPDATE payers SET hawl_started_at = $1 WHERE id = $2`, [value, params.id])
  await audit('admin', 'payer.hawl', `${(payer as { name: string }).name}: hawl start → ${value ?? 'reset'}`)
  return NextResponse.json({ ok: true, hawl: hawlState(value) })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const payer = await queryOne(`SELECT id, name FROM payers WHERE id = $1`, [params.id])
  if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 })

  await query(`DELETE FROM payers WHERE id = $1`, [params.id]) // assets/liabilities cascade
  await audit('admin', 'payer.delete', (payer as { name: string }).name)
  return NextResponse.json({ ok: true })
}
