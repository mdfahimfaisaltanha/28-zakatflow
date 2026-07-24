// Creates the ZakatFlow schema. Run: npm run setup
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gold_price_per_gram NUMERIC(12,2) NOT NULL,
  silver_price_per_gram NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  nisab_basis TEXT NOT NULL DEFAULT 'silver' CHECK (nisab_basis IN ('gold','silver')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  hawl_started_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payers_name ON payers (LOWER(name));

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id UUID NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cash','gold','silver','stocks','crypto','business_inventory','receivables')),
  label TEXT NOT NULL,
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  value_per_unit NUMERIC(18,6) NOT NULL DEFAULT 0,
  zakatable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_payer ON assets (payer_id);

CREATE TABLE IF NOT EXISTS liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id UUID NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  due_within_year BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_liabilities_payer ON liabilities (payer_id);

CREATE TABLE IF NOT EXISTS zakat_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id UUID NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  calc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_assets NUMERIC(14,2) NOT NULL,
  total_liabilities NUMERIC(14,2) NOT NULL,
  zakatable_wealth NUMERIC(14,2) NOT NULL,
  nisab_value NUMERIC(14,2) NOT NULL,
  nisab_basis TEXT NOT NULL,
  meets_nisab BOOLEAN NOT NULL,
  hawl_complete BOOLEAN NOT NULL,
  zakat_due NUMERIC(14,2) NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calcs_payer ON zakat_calculations (payer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('fuqara','masakin','amilin','muallafah','riqab','gharimin','fi_sabilillah','ibn_sabil')),
  contact TEXT,
  notes TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipients_name ON recipients (LOWER(name));

CREATE TABLE IF NOT EXISTS distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES recipients(id),
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  distributed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distributions_time ON distributions (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at DESC);
`

async function main() {
  await pool.query(SQL)
  console.log('\u2705 ZakatFlow schema created')
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
