import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'
import { ASSET_TYPES, AssetType } from '@/lib/zakat'

// POST   /api/assets            — add an asset to a payer
// DELETE /api/assets?id=<uuid>  — remove an asset

export async function POST(req: NextRequest) {
  const body = await req.json()
  const payerId = String(body.payerId ?? '')
  const type = String(body.type ?? '') as AssetType
  const label = String(body.label ?? '').trim()
  const quantity = Number(body.quantity)
  const valuePerUnit = Number(body.valuePerUnit ?? 0)
  const zakatable = body.zakatable !== false

  if (!payerId) return NextResponse.json({ error: 'payerId is required' }, { status: 400 })
  if (!(type in ASSET_TYPES)) {
    return NextResponse.json({ error: `type must be one of: ${Object.keys(ASSET_TYPES).join(', ')}` }, { status: 400 })
  }
  if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 })
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
  }
  if ((type === 'stocks' || type === 'crypto') && (!Number.isFinite(valuePerUnit) || valuePerUnit <= 0)) {
    return NextResponse.json({ error: 'valuePerUnit is required for stocks/crypto' }, { status: 400 })
  }

  const payer = await queryOne(`SELECT id, name FROM payers WHERE id = $1`, [payerId])
  if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 })

  const rows = await query(
    `INSERT INTO assets (payer_id, type, label, quantity, value_per_unit, zakatable)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [payerId, type, label, quantity, Number.isFinite(valuePerUnit) ? valuePerUnit : 0, zakatable]
  )
  await audit('admin', 'asset.create', `${(payer as { name: string }).name}: ${label} (${type})`)
  return NextResponse.json({ asset: rows[0] }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const rows = await query(`DELETE FROM assets WHERE id = $1 RETURNING label`, [id])
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await audit('admin', 'asset.delete', (rows[0] as { label: string }).label)
  return NextResponse.json({ ok: true })
}
