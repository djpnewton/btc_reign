import raw from '../data/coins.json'
import { coinColor, inkColor } from './palette'
import type { Dataset, RawCoin } from './types'

const dataset = raw as unknown as Dataset

export const START = new Date(`${dataset.start}T00:00:00Z`)
export const END = new Date(`${dataset.end}T00:00:00Z`)
export const STEP = dataset.step
export const MAX_DAY = dataset.days - (dataset.days % dataset.step)
export const DAY_MS = 86_400_000

const NOTES: Record<string, string> = {
  XZC: 'now Firo',
  BURST: 'now Signum',
  SJCX: 'now Storj',
}

export type CoinView = RawCoin & {
  color: string
  ink: string
  note?: string
  rank: number
  mcap: number
  priceBtc: number
}

export type Cohort = {
  year: number
  day: number
  label: string
  coins: CoinView[]
}

const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

/** Stable colour per coin, so a coin keeps its line colour across snapshots. */
function paletteIndex(id: number): number {
  return (Math.imul(id, 2654435761) >>> 0) % 96
}

const views = new Map<number, Omit<CoinView, 'rank' | 'mcap' | 'priceBtc'>>()
for (const coin of Object.values(dataset.coins)) {
  const index = paletteIndex(coin.id)
  views.set(coin.id, {
    ...coin,
    color: coinColor(index),
    ink: inkColor(index),
    note: NOTES[coin.symbol],
  })
}

export const cohorts: Cohort[] = dataset.cohorts.map((cohort) => ({
  year: cohort.year,
  day: cohort.day,
  label: `${monthLabel.format(new Date(`${cohort.date}T00:00:00Z`))} ${cohort.year}`,
  coins: cohort.coins
    .map((entry) => {
      const view = views.get(entry.id)
      if (!view) return null
      return { ...view, rank: entry.rank, mcap: entry.mcap, priceBtc: entry.priceBtc }
    })
    .filter((coin): coin is CoinView => coin !== null),
}))

export const DEFAULT_COHORT = 0

export function valueAt(coin: RawCoin, day: number): number {
  const { vals, from } = coin
  if (vals.length === 0) return 1
  const position = (day - from) / STEP
  if (position <= 0) return vals[0]
  if (position >= vals.length - 1) return vals[vals.length - 1]
  const i = Math.floor(position)
  const f = position - i
  return Math.exp(Math.log(vals[i]) * (1 - f) + Math.log(vals[i + 1]) * f)
}

/** Performance relative to bitcoin, re-based so the snapshot date reads 0%. */
export function relPct(coin: RawCoin, day: number, baseDay: number): number {
  return valueAt(coin, day) / valueAt(coin, baseDay) - 1
}

export function priceBtcAt(coin: CoinView, day: number, baseDay: number): number {
  return coin.priceBtc * (valueAt(coin, day) / valueAt(coin, baseDay))
}

export function dateAt(day: number): Date {
  return new Date(START.getTime() + day * DAY_MS)
}

export function dayOf(date: Date): number {
  return (date.getTime() - START.getTime()) / DAY_MS
}

/** A coin needs at least a month of history past the snapshot to be worth plotting. */
export const MIN_WINDOW = 30

export function isTradingAt(coin: RawCoin, baseDay: number): boolean {
  return coin.vals.length > 0 && coin.until - baseDay > MIN_WINDOW
}

/** True when the coin's series ends well before the chart's last day. */
export function hasStopped(coin: RawCoin): boolean {
  return coin.until < MAX_DAY - STEP * 2
}

export function extremes(coin: RawCoin, baseDay: number) {
  const base = valueAt(coin, baseDay)
  const from = Math.max(coin.from, Math.floor(baseDay / STEP) * STEP)
  const to = Math.max(from, Math.floor(coin.until / STEP) * STEP)
  const at = (day: number) => valueAt(coin, day) / base - 1

  let peak = { value: at(baseDay), day: baseDay }
  let trough = { value: at(baseDay), day: baseDay }
  for (let day = from; day <= to; day += STEP) {
    const value = at(day)
    if (value > peak.value) peak = { value, day }
    if (value < trough.value) trough = { value, day }
  }
  const end = Math.min(MAX_DAY, coin.until)
  const final = at(end)
  if (final > peak.value) peak = { value: final, day: end }
  if (final < trough.value) trough = { value: final, day: end }
  return { peak, trough }
}
