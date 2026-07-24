import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

// Dashboard data feed.

export async function GET() {
  const [counts, pool, byCategory, recentAudit] = await Promise.all([
    queryOne<{ payers: string; assets: string; recipients: string; calculations: string }>(
      `SELECT
         (SELECT COUNT(*) FROM payers) AS payers,
         (SELECT COUNT(*) FROM assets) AS assets,
         (SELECT COUNT(*) FROM recipients) AS recipients,
         (SELECT COUNT(*) FROM zakat_calculations) AS calculations`
    ),
    queryOne<{ assessed: string; distributed: string }>(
      `SELECT
         (SELECT COALESCE(SUM(zakat_due), 0) FROM (
            SELECT DISTINCT ON (payer_id) zakat_due
            FROM zakat_calculations ORDER BY payer_id, created_at DESC
         ) latest) AS assessed,
         (SELECT COALESCE(SUM(amount), 0) FROM distributions) AS distributed`
    ),
    query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM distributions GROUP BY category ORDER BY total DESC`
    ),
    query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50`),
  ])

  const assessed = Number(pool?.assessed ?? 0)
  const distributed = Number(pool?.distributed ?? 0)

  return NextResponse.json({
    counts: {
      payers: Number(counts?.payers ?? 0),
      assets: Number(counts?.assets ?? 0),
      recipients: Number(counts?.recipients ?? 0),
      calculations: Number(counts?.calculations ?? 0),
    },
    pool: {
      assessed: Math.round(assessed * 100) / 100,
      distributed: Math.round(distributed * 100) / 100,
      available: Math.round((assessed - distributed) * 100) / 100,
    },
    byCategory,
    recentAudit,
  })
}
