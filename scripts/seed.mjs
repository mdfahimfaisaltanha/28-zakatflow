// Seeds demo data: metal prices, three payers in different zakat situations,
// recipients across the asnaf, and sample distributions. Run: npm run seed
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const q = (sql, params = []) => pool.query(sql, params).then(r => r.rows)

async function main() {
  // --- settings: illustrative market prices (per gram, USD) -----------------
  await q(
    `INSERT INTO settings (id, gold_price_per_gram, silver_price_per_gram, currency, nisab_basis)
     VALUES (1, 75.00, 0.95, 'USD', 'silver')
     ON CONFLICT (id) DO UPDATE SET
       gold_price_per_gram = EXCLUDED.gold_price_per_gram,
       silver_price_per_gram = EXCLUDED.silver_price_per_gram,
       currency = EXCLUDED.currency,
       nisab_basis = EXCLUDED.nisab_basis`
  )
  // Nisab (silver basis): 612.36g x $0.95 = $581.74 — the threshold used below.

  // --- payer 1: above nisab, hawl COMPLETE (zakat due) -----------------------
  const hawlDone = new Date(Date.now() - 370 * 86_400_000).toISOString().slice(0, 10)
  const [ahmed] = await q(
    `INSERT INTO payers (name, email, hawl_started_at) VALUES ($1,$2,$3) RETURNING id`,
    ['Ahmed Karim', 'ahmed@example.com', hawlDone]
  )
  await q(
    `INSERT INTO assets (payer_id, type, label, quantity, value_per_unit, zakatable) VALUES
     ($1,'cash','Savings account', 12500, 0, TRUE),
     ($1,'cash','Checking account', 2300, 0, TRUE),
     ($1,'gold','Gold coins (24k)', 60, 0, TRUE),
     ($1,'stocks','Index fund units', 150, 42.50, TRUE),
     ($1,'receivables','Loan to cousin (expected back)', 1000, 0, TRUE)`,
    [ahmed.id]
  )
  await q(
    `INSERT INTO liabilities (payer_id, label, amount, due_within_year) VALUES
     ($1,'Car installments due this year', 2400, TRUE),
     ($1,'Long-term mortgage remainder', 80000, FALSE)`,
    [ahmed.id]
  )

  // --- payer 2: above nisab, hawl IN PROGRESS --------------------------------
  const hawlMid = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10)
  const [fatima] = await q(
    `INSERT INTO payers (name, email, hawl_started_at) VALUES ($1,$2,$3) RETURNING id`,
    ['Fatima Noor', 'fatima@example.com', hawlMid]
  )
  await q(
    `INSERT INTO assets (payer_id, type, label, quantity, value_per_unit, zakatable) VALUES
     ($1,'cash','Savings', 4200, 0, TRUE),
     ($1,'gold','Jewellery in regular use', 30, 0, FALSE),
     ($1,'crypto','BTC holdings', 0.05, 60000, TRUE)`,
    [fatima.id]
  )

  // --- payer 3: below nisab (no zakat) ---------------------------------------
  const [yusuf] = await q(
    `INSERT INTO payers (name, email) VALUES ($1,$2) RETURNING id`,
    ['Yusuf Adel', 'yusuf@example.com']
  )
  await q(
    `INSERT INTO assets (payer_id, type, label, quantity, value_per_unit, zakatable) VALUES
     ($1,'cash','Savings', 350, 0, TRUE)`,
    [yusuf.id]
  )

  // --- recipients across the asnaf -------------------------------------------
  const recipients = await q(
    `INSERT INTO recipients (name, category, contact, notes, verified) VALUES
     ('Umm Salamah (widow, 3 children)', 'fuqara', 'via masjid committee', 'Monthly support case #12', TRUE),
     ('Bilal Hasan (day labourer)', 'masakin', NULL, 'Irregular income, medical costs', TRUE),
     ('New Muslim Support Circle', 'muallafah', 'circle@example.org', 'Local revert support group', TRUE),
     ('Anti-Trafficking Rescue Fund', 'riqab', 'fund@example.org', 'Verified rescue organization', TRUE),
     ('Kareem Aziz (medical debt)', 'gharimin', NULL, 'Hospital debt case #7, documents on file', TRUE),
     ('Stranded Students Fund', 'ibn_sabil', 'aid@example.org', 'International students cut off from funds', FALSE)
     RETURNING id, name, category`
  )

  // --- a completed calculation + distributions for the demo ------------------
  const calc = await q(
    `INSERT INTO zakat_calculations
       (payer_id, calc_date, total_assets, total_liabilities, zakatable_wealth,
        nisab_value, nisab_basis, meets_nisab, hawl_complete, zakat_due, breakdown)
     VALUES ($1, CURRENT_DATE - 7, 26675.00, 2400.00, 24275.00, 581.74, 'silver', TRUE, TRUE, 606.88, '{}')
     RETURNING id`,
    [ahmed.id]
  )
  void calc

  const byName = Object.fromEntries(recipients.map(r => [r.name, r]))
  await q(
    `INSERT INTO distributions (recipient_id, category, amount, note, distributed_at) VALUES
     ($1, 'fuqara', 200.00, 'Monthly support', CURRENT_DATE - 5),
     ($2, 'masakin', 150.00, 'Medical costs', CURRENT_DATE - 5),
     ($3, 'gharimin', 180.00, 'Debt relief instalment', CURRENT_DATE - 3)`,
    [byName['Umm Salamah (widow, 3 children)'].id, byName['Bilal Hasan (day labourer)'].id, byName['Kareem Aziz (medical debt)'].id]
  )

  await q(
    `INSERT INTO audit_log (actor, action, detail) VALUES
     ('seed', 'zakat.calculate', 'Ahmed Karim: wealth 24275.00 USD, nisab met, hawl complete, due 606.88'),
     ('seed', 'distribution.create', 'Umm Salamah (fuqara): 200.00'),
     ('seed', 'distribution.create', 'Bilal Hasan (masakin): 150.00'),
     ('seed', 'distribution.create', 'Kareem Aziz (gharimin): 180.00')`
  )

  console.log('\u2705 Seeded ZakatFlow demo data')
  console.log('   Payers: Ahmed Karim (zakat DUE — hawl complete), Fatima Noor (hawl in progress), Yusuf Adel (below nisab)')
  console.log('   Assessed: $606.88 | Distributed: $530.00 | Pool available: $76.88')
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
