// Every figure shown on the IPO page carries a source + lastVerified date, the
// same fact-discipline subcue's compare hub uses. All values are from public
// reporting (CNBC and others) as of the dates below — this is commentary, NOT
// investment advice, and not affiliated with SpaceX.

export interface Fact {
  label: string
  value: string
  detail?: string
  source: string
  url: string
  lastVerified: string
}

// Nasdaq regular-session open, 09:30 ET (EDT = UTC-4) on listing day.
export const IPO_OPEN_UTC = '2026-06-12T13:30:00Z'
export const IPO_OPEN_LABEL = 'June 12, 2026 · 9:30 AM ET · Nasdaq open'

const CNBC = 'https://www.cnbc.com/2026/06/03/spacex-ipo-stock-price-roadshow-musk.html'
const CNBC_LIVE = 'https://www.cnbc.com/2026/05/20/spacex-ipo-live-updates.html'

export const HEADLINE_FACTS: Fact[] = [
  {
    label: 'Ticker',
    value: 'SPCX',
    detail: 'Nasdaq',
    source: 'CNBC',
    url: CNBC,
    lastVerified: '2026-06-11',
  },
  {
    label: 'Offer price',
    value: '$135.00',
    detail: 'fixed, per share',
    source: 'CNBC',
    url: CNBC,
    lastVerified: '2026-06-11',
  },
  {
    label: 'Valuation',
    value: '$1.77T',
    detail: '≈ 7th-largest US company',
    source: 'CNBC',
    url: CNBC,
    lastVerified: '2026-06-11',
  },
  {
    label: 'Amount raised',
    value: '$75B',
    detail: '555.6M shares (+$11.2B greenshoe)',
    source: 'CNBC',
    url: CNBC,
    lastVerified: '2026-06-11',
  },
]

// "Largest IPO in history" — capital raised, in $B.
export interface Bar {
  name: string
  sub: string
  amount: number
  unit: string
  highlight?: boolean
}

export const RAISE_BARS: Bar[] = [
  { name: 'SpaceX', sub: '2026 · this listing', amount: 75, unit: '$B', highlight: true },
  { name: 'Saudi Aramco', sub: '2019 · previous record', amount: 25.6, unit: '$B' },
  { name: 'Alibaba', sub: '2014 · largest US IPO to date', amount: 25, unit: '$B' },
]

// Valuation context — market cap, in $T.
export const VALUATION_BARS: Bar[] = [
  { name: 'SpaceX', sub: 'at $135/share', amount: 1.77, unit: '$T', highlight: true },
  { name: 'Tesla', sub: 'for reference', amount: 1.6, unit: '$T' },
]

// Demand vs. the raise.
export const OVERSUBSCRIPTION = {
  demand: 250, // $B+, reported
  raise: 75, // $B sought
  multiple: '3.5-4x',
  source: 'CNBC',
  url: CNBC_LIVE,
  lastVerified: '2026-06-11',
}

export const IPO_CONTEXT =
  'The story underneath the numbers: more orbital launches per year than the rest of the world combined, 9M+ Starlink subscribers, and, after the 2026 merger, xAI inside the same company.'
