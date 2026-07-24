'use client'

import { useCallback, useEffect, useState } from 'react'

type Tab = 'overview' | 'payers' | 'calculate' | 'recipients' | 'distributions' | 'learn'

type Stats = {
  counts: { payers: number; assets: number; recipients: number; calculations: number }
  pool: { assessed: number; distributed: number; available: number }
  byCategory: Array<{ category: string; total: string; count: string }>
  recentAudit: Array<{ id: string; actor: string; action: string; detail: string; created_at: string }>
}

type Payer = {
  id: string; name: string; email: string | null; hawl_started_at: string | null
  asset_count: string; liability_count: string
  latest_calculation: { calc_date: string; zakatable_wealth: string; meets_nisab: boolean; hawl_complete: boolean; zakat_due: string } | null
}

type SettingsPayload = {
  settings: { gold_price_per_gram: number; silver_price_per_gram: number; currency: string; nisab_basis: 'gold' | 'silver' }
  nisab: {
    current: { basis: string; grams: number; value: number }
    goldThreshold: { grams: number; value: number }
    silverThreshold: { grams: number; value: number }
  }
}

type Recipient = { id: string; name: string; category: string; contact: string | null; notes: string | null; verified: boolean; total_received: string; disbursement_count: string }

type DistributionsPayload = {
  ledger: Array<{ id: string; recipient_name: string; category: string; amount: string; note: string | null; distributed_at: string }>
  byCategory: Array<{ category: string; total: string; count: string }>
  pool: { assessed: number; distributed: number; available: number }
  categories: Record<string, { name: string; arabic: string; description: string }>
}

type CalcResult = {
  payer: { id: string; name: string }
  result: {
    currency: string
    lines: Array<{ type: string; label: string; assets: number; totalValue: number; zakatableValue: number }>
    totalAssets: number; excludedValue: number; deductibleLiabilities: number; zakatableWealth: number
    nisab: { basis: string; grams: number; value: number }
    meetsNisab: boolean
    hawl: { startedAt: string | null; daysElapsed: number; daysRequired: number; dueDate: string | null; complete: boolean }
    payable: boolean; zakatDue: number; zakatDueIfPayable: number
  }
  hawlNote: string | null
}

const fmt = (n: number | string, currency = 'USD') =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency })

export default function Home() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [payers, setPayers] = useState<Payer[]>([])
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [dist, setDist] = useState<DistributionsPayload | null>(null)
  const [calcPayerId, setCalcPayerId] = useState('')
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [s, p, st, r, d] = await Promise.all([
      fetch('/api/stats').then(x => x.json()),
      fetch('/api/payers').then(x => x.json()),
      fetch('/api/settings').then(x => x.json()),
      fetch('/api/recipients').then(x => x.json()),
      fetch('/api/distributions').then(x => x.json()),
    ])
    setStats(s)
    setPayers(p.payers ?? [])
    setSettings(st)
    setRecipients(r.recipients ?? [])
    setDist(d)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const currency = settings?.settings.currency ?? 'USD'

  async function runCalculation() {
    if (!calcPayerId) return
    setBusy(true); setCalcError(null); setCalcResult(null)
    try {
      const res = await fetch('/api/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerId: calcPayerId }),
      })
      const data = await res.json()
      if (!res.ok) setCalcError(data.error ?? 'Calculation failed')
      else { setCalcResult(data); refresh() }
    } finally { setBusy(false) }
  }

  return (
    <>
      <nav className="nav">
        <div className="logo">☾ Zakat<span>Flow</span></div>
        <div className="subtitle">Multi-asset zakat engine · nisab & hawl tracking · 8-category distribution ledger</div>
      </nav>

      <div className="container">
        <div className="tabs">
          {(['overview', 'payers', 'calculate', 'recipients', 'distributions', 'learn'] as Tab[]).map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'payers' ? 'Payers & Assets' : t === 'calculate' ? 'Calculate' : t === 'recipients' ? 'Recipients' : t === 'distributions' ? 'Distribution Ledger' : 'Fiqh Reference'}
            </button>
          ))}
        </div>

        {tab === 'overview' && stats && (
          <>
            <div className="grid cols-4">
              <div className="card"><h3>Zakat assessed</h3><div className="big gold">{fmt(stats.pool.assessed, currency)}</div><div className="sub">latest calculation per payer</div></div>
              <div className="card"><h3>Distributed</h3><div className="big green">{fmt(stats.pool.distributed, currency)}</div><div className="sub">across {stats.byCategory.length} categories</div></div>
              <div className="card"><h3>Pool available</h3><div className="big blue">{fmt(stats.pool.available, currency)}</div><div className="sub">awaiting distribution</div></div>
              <div className="card"><h3>Payers / Recipients</h3><div className="big">{stats.counts.payers} / {stats.counts.recipients}</div><div className="sub">{stats.counts.assets} assets tracked</div></div>
            </div>

            {settings && (
              <>
                <h2 className="section">Nisab thresholds (current prices)</h2>
                <div className="grid cols-3">
                  <div className="card">
                    <h3>Active basis: {settings.settings.nisab_basis}</h3>
                    <div className="big gold">{fmt(settings.nisab.current.value, currency)}</div>
                    <div className="sub">{settings.nisab.current.grams}g of {settings.nisab.current.basis}</div>
                  </div>
                  <div className="card"><h3>Gold nisab (87.48g)</h3><div className="big">{fmt(settings.nisab.goldThreshold.value, currency)}</div><div className="sub">@ {fmt(settings.settings.gold_price_per_gram, currency)}/g</div></div>
                  <div className="card"><h3>Silver nisab (612.36g)</h3><div className="big">{fmt(settings.nisab.silverThreshold.value, currency)}</div><div className="sub">@ {fmt(settings.settings.silver_price_per_gram, currency)}/g — lower threshold, favours the poor</div></div>
                </div>
              </>
            )}

            <h2 className="section">Recent activity</h2>
            <table>
              <thead><tr><th>Time</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {stats.recentAudit.slice(0, 12).map(a => (
                  <tr key={a.id}>
                    <td className="muted mono">{new Date(a.created_at).toLocaleString()}</td>
                    <td><span className="badge blue">{a.action}</span></td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'payers' && (
          <>
            <h2 className="section">Zakat payers</h2>
            <p className="hint">Each payer tracks assets (gold/silver valued live at settings prices), deductible liabilities, and their own hawl — the lunar year of continuous possession above nisab.</p>
            <table>
              <thead><tr><th>Name</th><th>Assets</th><th>Liabilities</th><th>Hawl started</th><th>Latest assessment</th><th>Zakat due</th></tr></thead>
              <tbody>
                {payers.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="muted">{p.email}</div></td>
                    <td>{p.asset_count}</td>
                    <td>{p.liability_count}</td>
                    <td className="mono">{p.hawl_started_at ?? <span className="badge muted">below nisab</span>}</td>
                    <td>
                      {p.latest_calculation ? (
                        <>
                          <span className="mono">{fmt(p.latest_calculation.zakatable_wealth, currency)}</span>{' '}
                          {p.latest_calculation.meets_nisab ? <span className="badge green">nisab met</span> : <span className="badge muted">below nisab</span>}{' '}
                          {p.latest_calculation.hawl_complete ? <span className="badge gold">hawl complete</span> : <span className="badge blue">hawl running</span>}
                        </>
                      ) : <span className="muted">never assessed</span>}
                    </td>
                    <td>{p.latest_calculation ? <strong className="mono">{fmt(p.latest_calculation.zakat_due, currency)}</strong> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'calculate' && (
          <>
            <h2 className="section">Run a zakat assessment</h2>
            <p className="hint">Values every asset (metals at current prices), deducts liabilities due within the year, checks nisab, checks the hawl, and computes 2.5%. The hawl starts automatically the first time wealth reaches nisab, and breaks if it falls below — the classical rule.</p>
            <div className="form-row">
              <select value={calcPayerId} onChange={e => setCalcPayerId(e.target.value)}>
                <option value="">Select payer…</option>
                {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn gold" onClick={runCalculation} disabled={busy || !calcPayerId}>
                {busy ? 'Calculating…' : 'Calculate zakat'}
              </button>
            </div>

            {calcError && <div className="card" style={{ borderColor: 'var(--danger)' }}>{calcError}</div>}

            {calcResult && (
              <div className={`result-panel ${calcResult.result.payable ? '' : 'not-due'}`}>
                <div className={`headline ${calcResult.result.payable ? '' : 'zero'}`}>
                  {calcResult.payer.name}: {calcResult.result.payable
                    ? `${fmt(calcResult.result.zakatDue, currency)} due now`
                    : calcResult.result.meetsNisab
                      ? `${fmt(calcResult.result.zakatDueIfPayable, currency)} projected — hawl completes ${calcResult.result.hawl.dueDate}`
                      : 'No zakat due — wealth below nisab'}
                </div>
                {calcResult.hawlNote && <p className="hint">{calcResult.hawlNote}</p>}

                <div className="grid cols-4" style={{ margin: '14px 0' }}>
                  <div className="card"><h3>Zakatable wealth</h3><div className="big">{fmt(calcResult.result.zakatableWealth, currency)}</div><div className="sub">after {fmt(calcResult.result.deductibleLiabilities, currency)} liabilities</div></div>
                  <div className="card"><h3>Nisab ({calcResult.result.nisab.basis})</h3><div className="big">{fmt(calcResult.result.nisab.value, currency)}</div><div className="sub">{calcResult.result.meetsNisab ? '✓ met' : 'not met'}</div></div>
                  <div className="card">
                    <h3>Hawl progress</h3>
                    <div className="big">{Math.min(100, Math.round(calcResult.result.hawl.daysElapsed / calcResult.result.hawl.daysRequired * 100))}%</div>
                    <div className={`progress ${calcResult.result.hawl.complete ? 'complete' : ''}`} style={{ marginTop: 8 }}>
                      <div style={{ width: `${Math.min(100, calcResult.result.hawl.daysElapsed / calcResult.result.hawl.daysRequired * 100)}%` }} />
                    </div>
                    <div className="sub">{calcResult.result.hawl.daysElapsed} / {Math.round(calcResult.result.hawl.daysRequired)} days (lunar year)</div>
                  </div>
                  <div className="card"><h3>Excluded assets</h3><div className="big">{fmt(calcResult.result.excludedValue, currency)}</div><div className="sub">marked non-zakatable</div></div>
                </div>

                <table>
                  <thead><tr><th>Asset class</th><th>Items</th><th>Total value</th><th>Zakatable</th></tr></thead>
                  <tbody>
                    {calcResult.result.lines.map(l => (
                      <tr key={l.type}>
                        <td>{l.label}</td>
                        <td>{l.assets}</td>
                        <td className="mono">{fmt(l.totalValue, currency)}</td>
                        <td className="mono">{fmt(l.zakatableValue, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'recipients' && dist && (
          <>
            <h2 className="section">Recipients — the eight asnaf</h2>
            <div className="ayah">
              “Zakat expenditures are only for the poor and for the needy and for those employed to collect [zakat] and for bringing hearts together and for freeing captives and for those in debt and for the cause of Allah and for the stranded traveller — an obligation imposed by Allah.” <span className="ref">— At-Tawbah 9:60</span>
            </div>
            <table>
              <thead><tr><th>Name</th><th>Category</th><th>Verified</th><th>Received</th><th>Notes</th></tr></thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong>{r.contact && <div className="muted">{r.contact}</div>}</td>
                    <td><span className="badge gold">{dist.categories[r.category]?.name ?? r.category}</span></td>
                    <td>{r.verified ? <span className="badge green">verified</span> : <span className="badge muted">pending</span>}</td>
                    <td className="mono">{fmt(r.total_received, currency)} <span className="muted">({r.disbursement_count})</span></td>
                    <td className="muted">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'distributions' && dist && (
          <>
            <div className="grid cols-3">
              <div className="card"><h3>Assessed</h3><div className="big gold">{fmt(dist.pool.assessed, currency)}</div></div>
              <div className="card"><h3>Distributed</h3><div className="big green">{fmt(dist.pool.distributed, currency)}</div></div>
              <div className="card"><h3>Available</h3><div className="big blue">{fmt(dist.pool.available, currency)}</div><div className="sub">disbursements exceeding this are rejected</div></div>
            </div>

            <h2 className="section">By category</h2>
            <table>
              <thead><tr><th>Category</th><th>Disbursements</th><th>Total</th></tr></thead>
              <tbody>
                {dist.byCategory.map(c => (
                  <tr key={c.category}>
                    <td><span className="badge gold">{dist.categories[c.category]?.name ?? c.category}</span> <span className="muted">{dist.categories[c.category]?.arabic}</span></td>
                    <td>{c.count}</td>
                    <td className="mono">{fmt(c.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="section">Ledger (append-only)</h2>
            <table>
              <thead><tr><th>Date</th><th>Recipient</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>
                {dist.ledger.map(d => (
                  <tr key={d.id}>
                    <td className="mono muted">{d.distributed_at}</td>
                    <td>{d.recipient_name}</td>
                    <td><span className="badge gold">{dist.categories[d.category]?.name ?? d.category}</span></td>
                    <td className="mono">{fmt(d.amount, currency)}</td>
                    <td className="muted">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'learn' && dist && (
          <>
            <h2 className="section">Fiqh reference (as implemented)</h2>
            <div className="grid cols-2">
              <div className="card">
                <h3>Nisab</h3>
                <p className="hint">The minimum wealth at which zakat becomes obligatory: 87.48g of gold or 612.36g of silver. This platform defaults to the <strong>silver basis</strong> — the lower threshold, which benefits the poor — and lets organizations switch to gold. Prices are configurable and should be refreshed regularly.</p>
              </div>
              <div className="card">
                <h3>Hawl — the lunar year</h3>
                <p className="hint">Zakat is due after wealth remains at or above nisab for one lunar year (≈354.37 days). The engine starts the hawl automatically when wealth first reaches nisab and breaks it if wealth falls below — it restarts when nisab is reached again.</p>
              </div>
              <div className="card">
                <h3>Rate & base</h3>
                <p className="hint">2.5% (rub‘ al-‘ushr) of zakatable wealth: cash, gold, silver, trade inventory at selling price, stocks and crypto at market value, and strong receivables — minus debts due within the year. Primary residence, tools of trade, and personal effects are not zakatable.</p>
              </div>
              <div className="card">
                <h3>Distribution</h3>
                <p className="hint">Only the eight categories fixed by At-Tawbah 9:60 are valid — enforced at the database level. The ledger is append-only, and disbursements can never exceed assessed zakat. Every action is audit-logged: zakat is an amanah (trust).</p>
              </div>
            </div>

            <h2 className="section">The eight categories</h2>
            <table>
              <thead><tr><th>Category</th><th>Arabic</th><th>Description</th></tr></thead>
              <tbody>
                {Object.entries(dist.categories).map(([key, c]) => (
                  <tr key={key}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.arabic}</td>
                    <td className="muted">{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">⚠ This platform implements widely-held contemporary positions (AMJA / Fiqh Academy standards) and documents each one in code comments. Organizations deploying it should review the settings with their own scholars — fiqh positions on jewellery, long-term stocks, and debt deduction legitimately vary.</p>
          </>
        )}
      </div>
    </>
  )
}
