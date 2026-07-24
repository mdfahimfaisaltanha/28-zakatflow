import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'

// POST   /api/liabilities            — add a liability (debt owed BY the payer)
// DELETE /api/liabilities?id=<uuid>  — remove

export async function POST(req: NextRequest) {
  const body = await req.json()
  const payerId = String(body.payerId ?? '')
  const label = String(body.label ?? '').trim()
  const amount = Number(body.amount)
  const dueWithinYear = body.dueWithinYear !== false // default: deductible

  if (!payerId) return NextResponse.json({ error: 'payerId is required' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const payer = await queryOne(`SELECT id, name FROM payers WHERE id = $1`, [payerId])
  if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 })

  const rows = await query(
    `INSERT INTO liabilities (payer_id, label, amount, due_within_year)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [payerId, label, amount, dueWithinYear]
  )
  await audit('admin', 'liability.create', `${(payer as { name: string }).name}: ${label}`)
  return NextResponse.json({ liability: rows[0] }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const rows = await query(`DELETE FROM liabilities WHERE id = $1 RETURNING label`, [id])
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await audit('admin', 'liability.delete', (rows[0] as { label: string }).label)
  return NextResponse.json({ ok: true })
}
