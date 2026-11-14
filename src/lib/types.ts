export type RawCoin = {
  id: number
  name: string
  symbol: string
  slug: string
  /** Day index of the first snapshot the coin appears in. */
  from: number
  /** Day index of the last real observation; the path is flat after this. */
  until: number
  src: string
  vals: number[]
}

export type CohortEntry = { id: number; rank: number; mcap: number; priceBtc: number }

export type CohortRaw = { year: number; date: string; day: number; coins: CohortEntry[] }

export type Dataset = {
  start: string
  end: string
  step: number
  days: number
  cohorts: CohortRaw[]
  coins: Record<string, RawCoin>
}
