import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'

// Zakat payers (household members or an organization's donors).
//
// GET  /api/payers — list with asset/liability counts and latest calculation
// POST /api/payers — { name, email? }

export async function GET() {
  const payers = await query(
    `SELECT p.id, p.name, p.email, p.hawl_started_at, p.created_at,
            (SELECT COUNT(*) FROM assets a WHERE a.payer_id = p.id) AS asset_count,
            (SELECT COUNT(*) FROM liabilities l WHERE l.payer_id = p.id) AS liability_count,
            (SELECT row_to_json(c) FROM (
               SELECT zc.id, zc.calc_date, zc.zakatable_wealth, zc.meets_nisab, zc.hawl_complete, zc.zakat_due
               FROM zakat_calculations zc WHERE zc.payer_id = p.id ORDER BY zc.calc_date DESC, zc.created_at DESC LIMIT 1
            ) c) AS latest_calculation
     FROM payers p ORDER BY p.name`
  )
  return NextResponse.json({ payers })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const dup = await queryOne(`SELECT id FROM payers WHERE LOWER(name) = LOWER($1)`, [name])
  if (dup) return NextResponse.json({ error: `Payer '${name}' already exists` }, { status: 409 })

  const hawlStartedAt = body.hawlStartedAt ? String(body.hawlStartedAt) : null
  const rows = await query(
    `INSERT INTO payers (name, email, hawl_started_at) VALUES ($1,$2,$3) RETURNING *`,
    [name, body.email ?? null, hawlStartedAt]
  )
  await audit('admin', 'payer.create', name)
  return NextResponse.json({ payer: rows[0] }, { status: 201 })
}
