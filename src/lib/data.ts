import raw from '../data/coins.json'
import { coinColor, inkColor } from './palette'
import type { Coin, Dataset } from './types'

const dataset = raw as unknown as Dataset

export const START = new Date(`${dataset.start}T00:00:00Z`)
export const END = new Date(`${dataset.end}T00:00:00Z`)
export const STEP = dataset.step
export const MAX_DAY = (dataset.coins[0].vals.length - 1) * dataset.step
export const DAY_MS = 86_400_000
/** CMC's close for bitcoin on 18 June 2017, used to express prices in BTC. */
export const BTC_START_USD = 2548.29

const NOTES: Record<string, string> = {
  XZC: 'now Firo',
  BURST: 'now Signum',
  SJCX: 'now Storj',
}

export type CoinView = Coin & {
  color: string
  ink: string
  note?: string
  peak: { value: number; day: number }
  trough: { value: number; day: number }
}

export const coins: CoinView[] = dataset.coins.map((coin, index) => {
  let peak = { value: -Infinity, day: 0 }
  let trough = { value: Infinity, day: 0 }
  coin.vals.forEach((value, i) => {
    if (value > peak.value) peak = { value, day: i * STEP }
    if (value < trough.value) trough = { value, day: i * STEP }
  })
  return {
    ...coin,
    color: coinColor(index),
    ink: inkColor(index),
    note: NOTES[coin.symbol],
    peak,
    trough,
  }
})

export function valueAt(coin: Coin, day: number): number {
  const n = coin.vals.length
  const position = day / STEP
  if (position <= 0) return coin.vals[0]
  if (position >= n - 1) return coin.vals[n - 1]
  const i = Math.floor(position)
  const f = position - i
  return Math.exp(Math.log(coin.vals[i]) * (1 - f) + Math.log(coin.vals[i + 1]) * f)
}

export function pctAt(coin: Coin, day: number): number {
  return valueAt(coin, day) - 1
}

export function priceBtcAt(coin: Coin, day: number): number {
  return (coin.price / BTC_START_USD) * valueAt(coin, day)
}

export function dateAt(day: number): Date {
  return new Date(START.getTime() + day * DAY_MS)
}

export function dayOf(date: Date): number {
  return (date.getTime() - START.getTime()) / DAY_MS
}

export const bitcoin = coins.find((coin) => coin.symbol === 'BTC') ?? coins[0]
