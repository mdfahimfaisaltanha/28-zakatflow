import { Pool, PoolClient } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var _zakatPool: Pool | undefined
}

export function getPool(): Pool {
  if (!global._zakatPool) {
    global._zakatPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    })
  }
  return global._zakatPool
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await getPool().query(sql, params)
  return res.rows as T[]
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function audit(actor: string, action: string, detail: string): Promise<void> {
  await query(`INSERT INTO audit_log (actor, action, detail) VALUES ($1,$2,$3)`, [actor, action, detail])
}
