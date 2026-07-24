import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ZakatFlow — Zakat Calculation & Distribution',
  description:
    'Multi-asset zakat engine with nisab & hawl (lunar year) tracking, and an append-only distribution ledger across the 8 Quranic categories',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
