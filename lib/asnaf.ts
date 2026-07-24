// ---------------------------------------------------------------------------
// The eight categories (asnaf) of zakat recipients, fixed by the Quran:
//
//   "Zakat expenditures are only for the poor and for the needy and for those
//    employed to collect [zakat] and for bringing hearts together [for Islam]
//    and for freeing captives [or slaves] and for those in debt and for the
//    cause of Allah and for the [stranded] traveller — an obligation [imposed]
//    by Allah." — At-Tawbah 9:60
//
// Distribution outside these categories is invalid, which is why the ledger
// enforces the category at the database level and every disbursement must
// name one.
// ---------------------------------------------------------------------------

export type AsnafCategory =
  | 'fuqara'
  | 'masakin'
  | 'amilin'
  | 'muallafah'
  | 'riqab'
  | 'gharimin'
  | 'fi_sabilillah'
  | 'ibn_sabil'

export const ASNAF: Record<AsnafCategory, { name: string; arabic: string; description: string }> = {
  fuqara: {
    name: 'The poor',
    arabic: 'الفقراء',
    description: 'Those whose means fall short of their basic needs.',
  },
  masakin: {
    name: 'The needy',
    arabic: 'المساكين',
    description: 'Those in hardship who may not ask — often with some income but not sufficiency.',
  },
  amilin: {
    name: 'Zakat administrators',
    arabic: 'العاملين عليها',
    description: 'Those employed to collect and distribute zakat (bounded compensation, not enrichment).',
  },
  muallafah: {
    name: 'Hearts to be reconciled',
    arabic: 'المؤلفة قلوبهم',
    description: 'New Muslims and those inclined toward Islam who need support.',
  },
  riqab: {
    name: 'Freeing captives',
    arabic: 'في الرقاب',
    description: 'Historically freeing slaves; contemporary application includes freeing captives and victims of bondage/trafficking.',
  },
  gharimin: {
    name: 'Those in debt',
    arabic: 'الغارمين',
    description: 'Overwhelmed by legitimate debt they cannot repay.',
  },
  fi_sabilillah: {
    name: 'In the cause of Allah',
    arabic: 'في سبيل الله',
    description: 'Striving in Allah’s cause; scope varies by scholarly opinion — organizations should follow their advisors.',
  },
  ibn_sabil: {
    name: 'The stranded traveller',
    arabic: 'ابن السبيل',
    description: 'Travellers cut off from their resources, including refugees and the displaced.',
  },
}

export const ASNAF_KEYS = Object.keys(ASNAF) as AsnafCategory[]

export function isAsnafCategory(value: string): value is AsnafCategory {
  return value in ASNAF
}
