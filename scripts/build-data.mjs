/**
 * Rebuilds src/data/coins.json: ten June snapshots (2017-2026) of the top 100 coins
 * by market cap, each with a BTC-denominated history.
 *
 *   node scripts/build-data.mjs
 *
 * Sources
 *  - CoinMarketCap data API: historical top-100 listings and daily closes in BTC
 *  - CoinCodex chart API: USD closes for coins CoinMarketCap has since purged
 *
 * Responses are cached in scripts/.cache so reruns are cheap and offline-capable.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, 'scripts', '.cache')
const UA = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
}

const FIRST_YEAR = 2017
const LAST_YEAR = new Date().getUTCFullYear()
const COHORT_MONTH = 5 // June
const COHORT_DAY = 18
const STEP = 4
const DAY_MS = 86_400_000

const START = new Date(Date.UTC(FIRST_YEAR, COHORT_MONTH, COHORT_DAY))
const END = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)

const dayOf = (date) => (date.getTime() - START.getTime()) / DAY_MS
const dateAt = (day) => new Date(START.getTime() + day * DAY_MS)
const iso = (date) => date.toISOString().slice(0, 10)
const cohortDate = (year) => new Date(Date.UTC(year, COHORT_MONTH, COHORT_DAY))

const MAX_DAY = Math.floor(Math.round((END.getTime() - START.getTime()) / DAY_MS) / STEP) * STEP

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await fs.mkdir(cacheDir, { recursive: true })

async function fetchJson(url, cacheName, { force = false } = {}) {
  const file = path.join(cacheDir, cacheName)
  if (!force) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      /* not cached */
    }
  }
  let lastError
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers: UA })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const json = await response.json()
      await fs.writeFile(file, JSON.stringify(json))
      return json
    } catch (error) {
      lastError = error
      await sleep(700 * (attempt + 1))
    }
  }
  throw new Error(`Failed ${url}: ${lastError}`)
}

function interpLog(points, date) {
  if (points.length === 0) return 0
  if (date <= points[0].date) return points[0].value
  if (date >= points[points.length - 1].date) return points[points.length - 1].value
  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].date <= date) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  const f = (date.getTime() - a.date.getTime()) / (b.date.getTime() - a.date.getTime())
  if (a.value <= 0 || b.value <= 0) return b.value
  return Math.exp(Math.log(a.value) * (1 - f) + Math.log(b.value) * f)
}

// ---------------------------------------------------------------------------
// 1. Snapshots: the top 100 by market cap on 18 June of each year.

console.log('Fetching snapshots…')
const cohorts = []
for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
  const date = cohortDate(year)
  const url =
    'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listings/historical' +
    `?date=${iso(date)}&start=1&limit=100&sortBy=market_cap&sortType=desc&convert=USD`
  const raw = await fetchJson(url, `snapshot-${year}.json`)
  const rows = raw.data ?? []
  if (rows.length < 100) console.warn(`  ${year}: only ${rows.length} rows`)
  const coins = rows
    .sort((a, b) => a.cmcRank - b.cmcRank)
    .map((row) => ({
      id: row.id,
      rank: row.cmcRank,
      name: row.name,
      symbol: row.symbol,
      slug: row.slug,
      mcap: row.quotes[0].marketCap,
      price: row.quotes[0].price,
    }))
  const btc = coins.find((coin) => coin.id === 1)
  const btcUsd = btc?.price ?? 0
  cohorts.push({
    year,
    date: iso(date),
    day: Math.round(dayOf(date)),
    coins: coins.map((coin) => ({ ...coin, priceBtc: btcUsd ? coin.price / btcUsd : 0 })),
  })
  console.log(`  ${year}: ${coins.length} coins, top = ${coins[0].symbol}`)
  await sleep(400)
}

// ---------------------------------------------------------------------------
// 2. Coin registry: first appearance fixes where each series starts.

const registry = new Map()
const lastYear = new Map()
for (const cohort of cohorts) {
  for (const coin of cohort.coins) {
    if (!registry.has(coin.id)) {
      registry.set(coin.id, {
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        slug: coin.slug,
        from: Math.floor(cohort.day / STEP) * STEP,
        firstPrice: coin.price,
        firstDate: cohort.date,
      })
    }
    lastYear.set(coin.id, cohort.year)
  }
}
console.log(`\n${registry.size} unique coins across ${cohorts.length} snapshots`)

// Final values printed in the original 2017 chart, used only for coins that never
// appear in a later snapshot (so no other view is affected).
const printed = new Map()
try {
  const raw = await fs.readFile(path.join(root, 'scripts', 'top100.json'), 'utf8')
  for (const row of JSON.parse(raw)) printed.set(row.id, row.image)
} catch {
  /* optional */
}

// ---------------------------------------------------------------------------
// 3. Histories.

console.log('\nFetching histories…')
const startSec = Math.floor(START.getTime() / 1000)
const endSec = Math.floor(END.getTime() / 1000)
const btcUsdRaw = await fetchJson(
  `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/historical?id=1&convertId=2781&timeStart=${startSec}&timeEnd=${endSec}`,
  'btc-usd.json',
)
const btcUsd = btcUsdRaw.data.quotes
  .map((quote) => ({
    date: new Date(`${quote.quote.timestamp.slice(0, 10)}T00:00:00Z`),
    value: quote.quote.close,
  }))
  .filter((point) => point.value > 0)

const ccSlug = new Map()

async function cmcSeries(id) {
  const raw = await fetchJson(
    `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/historical?id=${id}&convertId=1&timeStart=${startSec}&timeEnd=${endSec}`,
    `cmc-${id}.json`,
  )
  const points = raw.data.quotes
    .map((quote) => ({
      date: new Date(`${quote.quote.timestamp.slice(0, 10)}T00:00:00Z`),
      value: quote.quote.close,
    }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
  return points.length > 2 ? points : null
}

/**
 * CoinCodex fills in coins CoinMarketCap has purged. Slugs collide with newer
 * tokens (LEO, DICE, EDC...), so a candidate is only accepted when its price on
 * the snapshot date is close to the price CoinMarketCap recorded then.
 */
async function coincodexSeries(coin) {
  const anchor = new Date(`${coin.firstDate}T00:00:00Z`)
  const candidates = [
    coin.slug,
    coin.slug.replace(/-/g, ''),
    coin.slug.replace(/-/g, '-coin'),
    coin.symbol.toLowerCase(),
  ]
  for (const slug of candidates) {
    try {
      const raw = await fetchJson(
        `https://coincodex.com/api/coincodex/get_coin_history/${slug}/${iso(START)}/${iso(END)}/1800`,
        `cc-${slug}.json`,
      )
      const key = Object.keys(raw)[0]
      if (!key) continue
      const points = raw[key]
        .map((item) => ({ date: new Date(item[0] * 1000), value: item[1] }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0)
      if (points.length < 3) continue

      const start = points[0].date
      const end = points[points.length - 1].date
      const coversAnchor = start <= anchor && end >= anchor
      const symbolMatches =
        key.toLowerCase().replace(/[^a-z0-9]/g, '') ===
        coin.symbol.toLowerCase().replace(/[^a-z0-9]/g, '')
      const lateBy = (start.getTime() - anchor.getTime()) / DAY_MS

      let ok = false
      if (coversAnchor) {
        const ratio = interpLog(points, anchor) / coin.firstPrice
        ok = ratio > 0.55 && ratio < 1.8
        if (!ok) {
          console.warn(
            `  CoinCodex ${slug} rejected for ${coin.symbol}: price ratio ${ratio.toFixed(2)}`,
          )
        }
      } else if (lateBy > 0 && lateBy < 400 && symbolMatches) {
        ok = true
        console.warn(`  CoinCodex ${slug} for ${coin.symbol} starts ${iso(start)} (after snapshot)`)
      } else {
        console.warn(`  CoinCodex ${slug} rejected for ${coin.symbol}: no overlap with snapshot`)
      }
      if (!ok) continue
      ccSlug.set(coin.id, slug)
      return points
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

const coins = {}
let done = 0
for (const coin of registry.values()) {
  let points = null
  let source = 'cmc'
  try {
    points = await cmcSeries(coin.id)
  } catch (error) {
    console.warn(`  CMC ${coin.symbol}: ${error.message}`)
  }

  let toBtc = false
  if (!points) {
    points = await coincodexSeries(coin)
    source = 'coincodex'
    toBtc = true
  }

  done++
  if (done % 25 === 0) console.log(`  ${done}/${registry.size}`)

  if (!points) {
    const printFinal = printed.get(coin.id)
    if (printFinal !== undefined && lastYear.get(coin.id) === FIRST_YEAR) {
      // No surviving series: fall to the value printed in the 2017 chart over the
      // first month, then hold it there (the print's flat tail).
      const target = 1 + printFinal / 100
      const count = Math.floor((MAX_DAY - coin.from) / STEP) + 1
      const ramp = Math.min(count - 1, Math.round(30 / STEP))
      const vals = Array.from({ length: count }, (_, i) => {
        if (i >= ramp) return Number(target.toPrecision(5))
        const t = i / ramp
        return Number(Math.exp(Math.log(target) * t).toPrecision(5))
      })
      console.warn(`  reconstructed tail for ${coin.symbol} (${coin.id}) at ${printFinal}%`)
      coins[coin.id] = { ...coin, src: 'flat', until: MAX_DAY, vals }
    } else {
      console.warn(`  no history for ${coin.symbol} (${coin.id})`)
      coins[coin.id] = { ...coin, src: 'none', until: coin.from, vals: [] }
    }
    continue
  }

  // Convert USD closes to BTC, then to a series indexed from the coin's first cohort.
  const series = points.map((point) =>
    toBtc
      ? { date: point.date, value: point.value / interpLog(btcUsd, point.date) }
      : point,
  )
  // Short gaps between the snapshot and the first available close are backfilled;
  // longer ones start the line where the data actually begins.
  const dataStart = Math.ceil(dayOf(points[0].date) / STEP) * STEP
  const gap = dataStart - coin.from
  const from = gap > 120 ? dataStart : coin.from
  const values = []
  for (let day = from; day <= Math.round(dayOf(END) / STEP) * STEP; day += STEP) {
    values.push(Math.max(interpLog(series, dateAt(day)), 1e-15))
  }
  const base = interpLog(series, dateAt(from))
  const normalised = values.map((value) => value / base)

  const lastReal = points[points.length - 1].date
  let until = Math.min(from + (values.length - 1) * STEP, Math.floor(dayOf(lastReal) / STEP) * STEP)

  // Carry the last known value forward so the path stays drawable.
  const lastIndex = Math.max(0, Math.round((until - from) / STEP))
  for (let i = lastIndex + 1; i < normalised.length; i++) normalised[i] = normalised[lastIndex]

  // Match the printed 2017 chart for coins that only ever appear in that snapshot.
  const printFinal = printed.get(coin.id)
  if (source !== 'synthetic' && printFinal !== undefined && lastYear.get(coin.id) === FIRST_YEAR) {
    const target = 1 + printFinal / 100
    const crossing = normalised.findIndex((value) => value <= target)
    if (crossing > 0) {
      for (let i = crossing; i < normalised.length; i++) normalised[i] = target
      until = Math.min(until, from + crossing * STEP)
    }
  }

  coins[coin.id] = {
    ...coin,
    from,
    src: source,
    until,
    vals: normalised,
  }
  await sleep(60)
}

// ---------------------------------------------------------------------------
// 4. Write.
//
// Values are stored as first differences of log10(value) at 1e-4 resolution:
// the series compress to roughly half the size of the raw numbers, and the
// client expands them with a running sum.

const SCALE = 10_000

function encodeVals(values) {
  if (values.length === 0) return []
  const logs = values.map((value) => Math.round(Math.log10(Math.max(value, 1e-15)) * SCALE))
  const out = [logs[0]]
  for (let i = 1; i < logs.length; i++) out.push(logs[i] - logs[i - 1])
  return out
}

const encoded = Object.fromEntries(
  Object.entries(coins).map(([id, coin]) => [id, { ...coin, vals: encodeVals(coin.vals) }]),
)

const output = {
  encoding: { vals: 'log10-delta', scale: SCALE },
  cohorts: cohorts.map((cohort) => ({
    year: cohort.year,
    date: cohort.date,
    day: cohort.day,
    coins: cohort.coins.map((coin) => ({
      id: coin.id,
      rank: coin.rank,
      mcap: coin.mcap,
      priceBtc: coin.priceBtc,
    })),
  })),
  coins: encoded,
}

const meta = {
  start: iso(START),
  end: iso(END),
  step: STEP,
  days: Math.round(dayOf(END)),
}

const file = path.join(root, 'src', 'data', 'coins.json')
await fs.writeFile(file, JSON.stringify(output))
await fs.writeFile(path.join(root, 'src', 'data', 'meta.json'), `${JSON.stringify(meta)}\n`)
const size = (await fs.stat(file)).size
console.log(`\nWrote ${registry.size} coins, ${cohorts.length} cohorts → ${(size / 1024).toFixed(0)} kB`)
console.log(`  meta: ${JSON.stringify(meta)}`)
for (const cohort of cohorts) {
  const missing = cohort.coins.filter((coin) => coins[coin.id]?.src === 'none').length
  console.log(`  ${cohort.year}: ${cohort.coins.length} coins, ${missing} without history`)
}
