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
  /** First differences of log10(value) at `scale` resolution. */
  vals: number[]
}

export type CohortEntry = { id: number; rank: number; mcap: number; priceBtc: number }

export type CohortRaw = { year: number; date: string; day: number; coins: CohortEntry[] }

export type Meta = { start: string; end: string; step: number; days: number }

export type Dataset = {
  encoding: { vals: string; scale: number }
  cohorts: CohortRaw[]
  coins: Record<string, RawCoin>
}
