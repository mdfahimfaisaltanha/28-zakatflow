import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'
import { computeZakat, AssetInput, LiabilityInput, Settings } from '@/lib/zakat'

// POST /api/calculate — { payerId } run the zakat engine, persist a snapshot
// GET  /api/calculate — recent calculations across all payers

export async function POST(req: NextRequest) {
  const body = await req.json()
  const payerId = String(body.payerId ?? '')
  if (!payerId) return NextResponse.json({ error: 'payerId is required' }, { status: 400 })

  const payer = await queryOne<{ id: string; name: string; hawl_started_at: string | null }>(
    `SELECT id, name, hawl_started_at FROM payers WHERE id = $1`, [payerId]
  )
  if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 })

  const s = await queryOne<Settings>(
    `SELECT gold_price_per_gram, silver_price_per_gram, currency, nisab_basis FROM settings WHERE id = 1`
  )
  if (!s) return NextResponse.json({ error: 'Settings not initialized' }, { status: 500 })
  const settings: Settings = {
    gold_price_per_gram: Number(s.gold_price_per_gram),
    silver_price_per_gram: Number(s.silver_price_per_gram),
    currency: s.currency,
    nisab_basis: s.nisab_basis,
  }

  const assetRows = await query(`SELECT * FROM assets WHERE payer_id = $1`, [payerId])
  const liabilityRows = await query(`SELECT * FROM liabilities WHERE payer_id = $1`, [payerId])

  const assets: AssetInput[] = assetRows.map(a => ({
    id: String(a.id),
    type: a.type as AssetInput['type'],
    label: String(a.label),
    quantity: Number(a.quantity),
    value_per_unit: Number(a.value_per_unit),
    zakatable: Boolean(a.zakatable),
  }))
  const liabilities: LiabilityInput[] = liabilityRows.map(l => ({
    id: String(l.id),
    label: String(l.label),
    amount: Number(l.amount),
    due_within_year: Boolean(l.due_within_year),
  }))

  const result = computeZakat(assets, liabilities, settings, payer.hawl_started_at)

  // Hawl bookkeeping: if wealth reaches nisab and no hawl is running, start it
  // today. If wealth fell below nisab, the hawl breaks (restarts when wealth
  // reaches nisab again) — the classical rule.
  let hawlNote: string | null = null
  if (result.meetsNisab && !payer.hawl_started_at) {
    const today = new Date().toISOString().slice(0, 10)
    await query(`UPDATE payers SET hawl_started_at = $1 WHERE id = $2`, [today, payerId])
    hawlNote = `Wealth reached nisab — hawl started today (${today}). Zakat becomes due after one lunar year.`
  } else if (!result.meetsNisab && payer.hawl_started_at) {
    await query(`UPDATE payers SET hawl_started_at = NULL WHERE id = $1`, [payerId])
    hawlNote = 'Wealth fell below nisab — hawl broken. It will restart when wealth reaches nisab again.'
  }

  const saved = await query(
    `INSERT INTO zakat_calculations
       (payer_id, calc_date, total_assets, total_liabilities, zakatable_wealth,
        nisab_value, nisab_basis, meets_nisab, hawl_complete, zakat_due, breakdown)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      payerId,
      result.totalAssets,
      result.deductibleLiabilities,
      result.zakatableWealth,
      result.nisab.value,
      result.nisab.basis,
      result.meetsNisab,
      result.hawl.complete,
      result.zakatDue,
      JSON.stringify(result),
    ]
  )

  await audit('admin', 'zakat.calculate',
    `${payer.name}: wealth ${result.zakatableWealth} ${result.currency}, ` +
    `nisab ${result.meetsNisab ? 'met' : 'not met'}, hawl ${result.hawl.complete ? 'complete' : 'incomplete'}, ` +
    `due ${result.zakatDue}`)

  return NextResponse.json({
    calculationId: (saved[0] as { id: string }).id,
    payer: { id: payer.id, name: payer.name },
    result,
    hawlNote,
  }, { status: 201 })
}

export async function GET() {
  const calculations = await query(
    `SELECT zc.*, p.name AS payer_name
     FROM zakat_calculations zc JOIN payers p ON p.id = zc.payer_id
     ORDER BY zc.created_at DESC LIMIT 50`
  )
  return NextResponse.json({ calculations })
}
