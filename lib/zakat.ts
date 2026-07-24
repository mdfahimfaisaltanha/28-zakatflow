// ---------------------------------------------------------------------------
// The zakat engine: multi-asset valuation, nisab check, hawl (lunar year)
// tracking, and the 2.5% calculation.
//
// Fiqh basis (documented so every number is defensible):
// - Zakat rate on monetary wealth: 2.5% (rub' al-'ushr) — established sunnah.
// - Nisab: 20 mithqal of gold = 87.48g, or 200 dirhams of silver = 612.36g.
//   (Values per common contemporary standards, e.g. AMJA/Islamic Fiqh Academy.)
// - Default nisab basis is SILVER: it produces the lower threshold, which is
//   the position most beneficial to the poor and adopted by many scholars
//   for mixed wealth (cash + metals). Configurable to gold.
// - Hawl: one lunar year ≈ 354.37 days of continuous possession above nisab.
// - Zakatable: cash, gold, silver, trade inventory, stocks (market value),
//   crypto, strong receivables. NOT zakatable: primary residence, tools of
//   trade, personal effects.
// - Deductible: debts due within the coming year (position of many
//   contemporary scholars; conservative payers may skip deduction — flag).
// ---------------------------------------------------------------------------

export const NISAB_GOLD_GRAMS = 87.48
export const NISAB_SILVER_GRAMS = 612.36
export const ZAKAT_RATE = 0.025
export const LUNAR_YEAR_DAYS = 354.37

export type NisabBasis = 'gold' | 'silver'

export type Settings = {
  gold_price_per_gram: number
  silver_price_per_gram: number
  currency: string
  nisab_basis: NisabBasis
}

export type AssetType =
  | 'cash'
  | 'gold'
  | 'silver'
  | 'stocks'
  | 'crypto'
  | 'business_inventory'
  | 'receivables'

export const ASSET_TYPES: Record<AssetType, { label: string; unit: string; note: string }> = {
  cash: { label: 'Cash & bank balances', unit: 'currency', note: 'Fully zakatable at face value.' },
  gold: { label: 'Gold', unit: 'grams', note: 'Valued at current market price per gram. Jewellery in regular personal use is exempt per Hanafi minority view — majority (and safer) opinion includes it; mark non-zakatable to exclude.' },
  silver: { label: 'Silver', unit: 'grams', note: 'Valued at current market price per gram.' },
  stocks: { label: 'Stocks & funds', unit: 'units', note: 'Held for trading: full market value. Long-term dividend holdings: some scholars allow zakat on underlying zakatable assets only — this engine uses full market value (safer).' },
  crypto: { label: 'Crypto assets', unit: 'units', note: 'Treated as trade goods / currency: full market value.' },
  business_inventory: { label: 'Business inventory', unit: 'currency', note: 'Trade goods valued at current selling price. Fixed assets (equipment, premises) are NOT zakatable.' },
  receivables: { label: 'Receivables (strong debts)', unit: 'currency', note: 'Debts owed to you that you expect to collect. Doubtful debts: zakat once actually received.' },
}

export type AssetInput = {
  id: string
  type: AssetType
  label: string
  quantity: number        // grams for metals, units for stocks/crypto, amount for currency types
  value_per_unit: number  // ignored for gold/silver (settings price is used)
  zakatable: boolean
}

export type LiabilityInput = {
  id: string
  label: string
  amount: number
  due_within_year: boolean
}

export function assetValue(a: AssetInput, s: Settings): number {
  if (a.type === 'gold') return a.quantity * s.gold_price_per_gram
  if (a.type === 'silver') return a.quantity * s.silver_price_per_gram
  if (a.type === 'cash' || a.type === 'business_inventory' || a.type === 'receivables') {
    return a.quantity // quantity IS the amount for currency-denominated types
  }
  return a.quantity * a.value_per_unit // stocks, crypto
}

export function nisabValue(s: Settings): { basis: NisabBasis; grams: number; value: number } {
  return s.nisab_basis === 'gold'
    ? { basis: 'gold', grams: NISAB_GOLD_GRAMS, value: NISAB_GOLD_GRAMS * s.gold_price_per_gram }
    : { basis: 'silver', grams: NISAB_SILVER_GRAMS, value: NISAB_SILVER_GRAMS * s.silver_price_per_gram }
}

export type HawlState = {
  startedAt: string | null   // ISO date the wealth first reached nisab
  daysElapsed: number
  daysRequired: number
  dueDate: string | null
  complete: boolean
}

export function hawlState(startedAt: string | null, now = new Date()): HawlState {
  if (!startedAt) {
    return { startedAt: null, daysElapsed: 0, daysRequired: LUNAR_YEAR_DAYS, dueDate: null, complete: false }
  }
  const start = new Date(startedAt)
  const daysElapsed = (now.getTime() - start.getTime()) / 86_400_000
  const due = new Date(start.getTime() + LUNAR_YEAR_DAYS * 86_400_000)
  return {
    startedAt,
    daysElapsed: Math.floor(daysElapsed),
    daysRequired: LUNAR_YEAR_DAYS,
    dueDate: due.toISOString().slice(0, 10),
    complete: daysElapsed >= LUNAR_YEAR_DAYS,
  }
}

export type ZakatBreakdownLine = {
  type: AssetType
  label: string
  assets: number          // count of asset rows
  totalValue: number
  zakatableValue: number  // excludes rows marked non-zakatable
}

export type ZakatResult = {
  currency: string
  lines: ZakatBreakdownLine[]
  totalAssets: number
  excludedValue: number          // value of rows marked non-zakatable
  deductibleLiabilities: number  // due within the year
  zakatableWealth: number        // max(0, zakatable - deductible)
  nisab: { basis: NisabBasis; grams: number; value: number }
  meetsNisab: boolean
  hawl: HawlState
  payable: boolean               // meetsNisab && hawl.complete
  zakatDue: number               // 2.5% if payable, else 0 (but zakatDueIfPayable always shown)
  zakatDueIfPayable: number
}

export function computeZakat(
  assets: AssetInput[],
  liabilities: LiabilityInput[],
  settings: Settings,
  hawlStartedAt: string | null,
  now = new Date()
): ZakatResult {
  const byType = new Map<AssetType, ZakatBreakdownLine>()
  let totalAssets = 0
  let zakatableTotal = 0
  let excludedValue = 0

  for (const a of assets) {
    const value = round2(assetValue(a, settings))
    totalAssets += value
    const line = byType.get(a.type) ?? {
      type: a.type,
      label: ASSET_TYPES[a.type].label,
      assets: 0,
      totalValue: 0,
      zakatableValue: 0,
    }
    line.assets += 1
    line.totalValue = round2(line.totalValue + value)
    if (a.zakatable) {
      line.zakatableValue = round2(line.zakatableValue + value)
      zakatableTotal += value
    } else {
      excludedValue += value
    }
    byType.set(a.type, line)
  }

  const deductibleLiabilities = round2(
    liabilities.filter(l => l.due_within_year).reduce((sum, l) => sum + Number(l.amount), 0)
  )

  const zakatableWealth = round2(Math.max(0, zakatableTotal - deductibleLiabilities))
  const nisab = nisabValue(settings)
  const meetsNisab = zakatableWealth >= nisab.value
  const hawl = hawlState(hawlStartedAt, now)
  const payable = meetsNisab && hawl.complete
  const zakatDueIfPayable = round2(zakatableWealth * ZAKAT_RATE)

  return {
    currency: settings.currency,
    lines: [...byType.values()].sort((a, b) => b.zakatableValue - a.zakatableValue),
    totalAssets: round2(totalAssets),
    excludedValue: round2(excludedValue),
    deductibleLiabilities,
    zakatableWealth,
    nisab: { ...nisab, value: round2(nisab.value) },
    meetsNisab,
    hawl,
    payable,
    zakatDue: payable ? zakatDueIfPayable : 0,
    zakatDueIfPayable,
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
