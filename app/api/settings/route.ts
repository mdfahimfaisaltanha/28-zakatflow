import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, audit } from '@/lib/db'
import { nisabValue, NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS, Settings } from '@/lib/zakat'

// GET /api/settings — current metal prices, currency, nisab basis + computed thresholds
// PUT /api/settings — update prices/basis (organizations refresh prices regularly)

export async function GET() {
  const s = await queryOne<Settings>(`SELECT gold_price_per_gram, silver_price_per_gram, currency, nisab_basis FROM settings WHERE id = 1`)
  if (!s) return NextResponse.json({ error: 'Settings not initialized — run npm run setup' }, { status: 500 })
  const settings: Settings = {
    gold_price_per_gram: Number(s.gold_price_per_gram),
    silver_price_per_gram: Number(s.silver_price_per_gram),
    currency: s.currency,
    nisab_basis: s.nisab_basis,
  }
  return NextResponse.json({
    settings,
    nisab: {
      current: nisabValue(settings),
      goldThreshold: { grams: NISAB_GOLD_GRAMS, value: Math.round(NISAB_GOLD_GRAMS * settings.gold_price_per_gram * 100) / 100 },
      silverThreshold: { grams: NISAB_SILVER_GRAMS, value: Math.round(NISAB_SILVER_GRAMS * settings.silver_price_per_gram * 100) / 100 },
    },
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const gold = Number(body.goldPricePerGram)
  const silver = Number(body.silverPricePerGram)
  const basis = body.nisabBasis
  const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : undefined

  if (body.goldPricePerGram !== undefined && (!Number.isFinite(gold) || gold <= 0)) {
    return NextResponse.json({ error: 'goldPricePerGram must be a positive number' }, { status: 400 })
  }
  if (body.silverPricePerGram !== undefined && (!Number.isFinite(silver) || silver <= 0)) {
    return NextResponse.json({ error: 'silverPricePerGram must be a positive number' }, { status: 400 })
  }
  if (basis !== undefined && basis !== 'gold' && basis !== 'silver') {
    return NextResponse.json({ error: "nisabBasis must be 'gold' or 'silver'" }, { status: 400 })
  }

  await query(
    `UPDATE settings SET
       gold_price_per_gram = COALESCE($1, gold_price_per_gram),
       silver_price_per_gram = COALESCE($2, silver_price_per_gram),
       nisab_basis = COALESCE($3, nisab_basis),
       currency = COALESCE($4, currency),
       updated_at = NOW()
     WHERE id = 1`,
    [
      body.goldPricePerGram !== undefined ? gold : null,
      body.silverPricePerGram !== undefined ? silver : null,
      basis ?? null,
      currency ?? null,
    ]
  )
  await audit('admin', 'settings.update', JSON.stringify(body))
  return GET()
}
