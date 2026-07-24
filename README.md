# ZakatFlow — Zakat Calculation & Distribution Platform

An enterprise-grade platform for calculating and distributing zakat: a **multi-asset
valuation engine**, **nisab and hawl (lunar year) tracking**, and an **append-only
distribution ledger** restricted to the eight Quranic recipient categories — with a
full audit trail, because zakat is an amanah (trust).

Built with Next.js 14 (App Router) + TypeScript + PostgreSQL. **Zero domain libraries
— every rule is implemented and documented from primary fiqh standards.**

---

## Why this project is interesting

Most “zakat calculators” are a single form with a multiply-by-0.025 button. Real zakat
accounting is a **temporal, multi-asset, threshold-based system**:

| Problem | What ZakatFlow does |
|---|---|
| Wealth is heterogeneous | 7 asset classes — metals valued live by grams × price, stocks/crypto at market, inventory at selling price, receivables by collectability |
| The threshold moves daily | Nisab computed from configurable gold/silver prices; silver basis by default (lower threshold — favours the poor); switchable to gold |
| Zakat is due after a *lunar* year above nisab | Per-payer hawl state machine: starts automatically when wealth reaches nisab, breaks when it falls below, restarts on recovery (≈354.37 days) |
| Not all wealth is zakatable | Per-asset `zakatable` flag (e.g. jewellery in regular use per some opinions), liabilities due within the year deducted |
| Distribution is legally constrained | Only the 8 asnaf of At-Tawbah 9:60 — enforced with a DB-level CHECK constraint |
| Trust requires accounting | Append-only ledger; disbursements exceeding the assessed pool are rejected with 409; recipients with history cannot be deleted; every action audit-logged |

## Quick start

```bash
cp .env.example .env.local   # set DATABASE_URL
npm install
npm run setup                # create schema
npm run seed                 # demo data: 3 payers in different zakat situations
npm run dev                  # http://localhost:3000
```

The seed creates three payers that demonstrate the full state space:

- **Ahmed Karim** — above nisab, hawl complete → **zakat due** ($606.88 on $24,275)
- **Fatima Noor** — above nisab, hawl in progress → projected amount + due date
- **Yusuf Adel** — below nisab → no zakat, no hawl

## Architecture

```
lib/zakat.ts        — the engine: valuation, nisab, hawl state machine, 2.5% calc
lib/asnaf.ts        — the 8 recipient categories with Quranic basis
lib/db.ts           — pg pool, transactions, audit helper
app/api/settings    — metal prices, currency, nisab basis
app/api/payers      — payers + per-payer hawl management
app/api/assets      — multi-class asset registry
app/api/liabilities — deductible debts
app/api/calculate   — run + persist an assessment (auto hawl bookkeeping)
app/api/recipients  — asnaf-constrained recipient registry
app/api/distributions — append-only ledger with pool-balance enforcement
app/api/stats       — dashboard feed
```

## Design

1. **Domain modelling under real constraints** — the rules come from 1,400-year-old
   jurisprudence with genuine scholarly variation. Every implemented position is
   documented in code comments (nisab weights, silver-basis default, debt deduction),
   and points of legitimate difference are surfaced in the UI rather than hidden.
2. **A state machine driven by time** — the hawl is a lunar-year timer per payer that
   starts, breaks, and restarts based on wealth crossing a moving threshold. The
   calculate endpoint does this bookkeeping transactionally as a side effect of
   assessment.
3. **Ledger integrity** — append-only distributions, pool-balance enforcement (can't
   distribute more than was assessed), no deletion of recipients with history, and a
   DB CHECK constraint on the 8 categories: correctness pushed to the database layer.
4. **The engine is a pure function** — `computeZakat(assets, liabilities, settings,
   hawlStart)` has no I/O, making the core trivially unit-testable; persistence is a
   thin shell around it.

## Fiqh notes & disclaimer

Constants: nisab = 87.48g gold / 612.36g silver; rate = 2.5%; lunar year ≈ 354.37
days. Positions follow widely-held contemporary standards (AMJA / Islamic Fiqh
Academy). Organizations deploying this should review configuration with their own
scholars — opinions legitimately vary on jewellery in use, long-term equity
holdings, and debt deduction.
