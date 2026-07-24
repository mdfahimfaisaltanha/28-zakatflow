import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'
import { ASNAF, isAsnafCategory } from '@/lib/asnaf'

// Zakat recipients, each assigned to one of the 8 Quranic categories (asnaf).
//
// GET    /api/recipients            — list with received totals
// POST   /api/recipients            — { name, category, contact?, notes? }
// DELETE /api/recipients?id=<uuid>  — remove (only if they have no disbursements)

export async function GET() {
  const recipients = await query(
    `SELECT r.*, COALESCE(SUM(d.amount), 0) AS total_received, COUNT(d.id) AS disbursement_count
     FROM recipients r LEFT JOIN distributions d ON d.recipient_id = r.id
     GROUP BY r.id ORDER BY r.name`
  )
  return NextResponse.json({ recipients, categories: ASNAF })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = String(body.name ?? '').trim()
  const category = String(body.category ?? '')

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!isAsnafCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of the 8 asnaf: ${Object.keys(ASNAF).join(', ')}` },
      { status: 400 }
    )
  }

  const dup = await queryOne(`SELECT id FROM recipients WHERE LOWER(name) = LOWER($1)`, [name])
  if (dup) return NextResponse.json({ error: `Recipient '${name}' already exists` }, { status: 409 })

  const rows = await query(
    `INSERT INTO recipients (name, category, contact, notes, verified)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, category, body.contact ?? null, body.notes ?? null, body.verified === true]
  )
  await audit('admin', 'recipient.create', `${name} (${ASNAF[category].name})`)
  return NextResponse.json({ recipient: rows[0] }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const used = await queryOne(`SELECT id FROM distributions WHERE recipient_id = $1 LIMIT 1`, [id])
  if (used) {
    return NextResponse.json(
      { error: 'Recipient has disbursements on record — the ledger is append-only, so they cannot be deleted' },
      { status: 409 }
    )
  }

  const rows = await query(`DELETE FROM recipients WHERE id = $1 RETURNING name`, [id])
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await audit('admin', 'recipient.delete', (rows[0] as { name: string }).name)
  return NextResponse.json({ ok: true })
}
