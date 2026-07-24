import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'
import { ASNAF } from '@/lib/asnaf'
import { round2 } from '@/lib/zakat'

// The distribution ledger — append-only. Every disbursement names a recipient,
// inherits their asnaf category, and is checked against the undistributed
// zakat pool so the organization can never pay out more than was assessed.
//
// GET  /api/distributions — ledger + per-category totals + pool balance
// POST /api/distributions — { recipientId, amount, note? }

async function poolBalance(): Promise<{ assessed: number; distributed: number; available: number }> {
  const row = await queryOne<{ assessed: string; distributed: string }>(
    `SELECT
       (SELECT COALESCE(SUM(zakat_due), 0) FROM (
          SELECT DISTINCT ON (payer_id) zakat_due
          FROM zakat_calculations ORDER BY payer_id, created_at DESC
       ) latest) AS assessed,
       (SELECT COALESCE(SUM(amount), 0) FROM distributions) AS distributed`
  )
  const assessed = round2(Number(row?.assessed ?? 0))
  const distributed = round2(Number(row?.distributed ?? 0))
  return { assessed, distributed, available: round2(assessed - distributed) }
}

export async function GET() {
  const [ledger, byCategory, pool] = await Promise.all([
    query(
      `SELECT d.*, r.name AS recipient_name, r.verified
       FROM distributions d JOIN recipients r ON r.id = d.recipient_id
       ORDER BY d.distributed_at DESC, d.created_at DESC LIMIT 100`
    ),
    query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM distributions GROUP BY category ORDER BY total DESC`
    ),
    poolBalance(),
  ])
  return NextResponse.json({ ledger, byCategory, pool, categories: ASNAF })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const recipientId = String(body.recipientId ?? '')
  const amount = round2(Number(body.amount))

  if (!recipientId) return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const recipient = await queryOne<{ id: string; name: string; category: keyof typeof ASNAF }>(
    `SELECT id, name, category FROM recipients WHERE id = $1`, [recipientId]
  )
  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })

  const pool = await poolBalance()
  if (amount > pool.available) {
    await audit('admin', 'distribution.denied',
      `${recipient.name}: ${amount} exceeds available pool ${pool.available}`)
    return NextResponse.json(
      { error: `Amount ${amount} exceeds the undistributed zakat pool (${pool.available} available). Assess more zakat first.`, pool },
      { status: 409 }
    )
  }

  const rows = await query(
    `INSERT INTO distributions (recipient_id, category, amount, note)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [recipientId, recipient.category, amount, body.note ?? null]
  )
  await audit('admin', 'distribution.create',
    `${recipient.name} (${ASNAF[recipient.category].name}): ${amount}`)

  return NextResponse.json({ distribution: rows[0], pool: await poolBalance() }, { status: 201 })
}
