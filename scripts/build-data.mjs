/**
 * Rebuilds src/data/coins.json.
 *
 *   node scripts/build-data.mjs
 *
 * Sources
 *  - CoinMarketCap's public data API (BTC-denominated daily closes)
 *  - CoinCodex's public chart API (USD closes for coins CMC has purged)
 *
 * Raw responses are cached in scripts/.cache so subsequent runs are offline.
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

const START = new Date(Date.UTC(2017, 5, 18))
const STEP = 4
const DAY_MS = 86_400_000
const END = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')

const COINCODEX = {
  BCC: 'bitconnect',
  ICN: 'icn',
  SNGLS: 'sngls',
  BTCD: 'btcd',
  MGO: 'mgo',
  '1ST': '1st',
  ROUND: 'round',
  SJCX: 'sjcx',
  PPY: 'ppy',
  MCAP: 'mcap',
  OBITS: 'obits',
  DICE: 'dice',
  VSL: 'vsl',
  BAY: 'bay',
  IOC: 'ioc',
  GUP: 'gup',
  TAAS: 'taas',
  QAU: 'qau',
  DTB: 'dtb',
  EAC: 'eac',
  MOON: 'moon',
}

const snapshot = JSON.parse(await fs.readFile(path.join(root, 'scripts', 'top100.json'), 'utf8'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await fs.mkdir(cacheDir, { recursive: true })

async function fetchJson(url, cacheName) {
  const file = path.join(cacheDir, cacheName)
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    /* not cached */
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
      await sleep(800 * (attempt + 1))
    }
  }
  throw new Error(`Failed ${url}: ${lastError}`)
}

const dayOf = (date) => (date.getTime() - START.getTime()) / DAY_MS
const dateAt = (day) => new Date(START.getTime() + day * DAY_MS)
const iso = (date) => date.toISOString().slice(0, 10)

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

const startSec = Math.floor(START.getTime() / 1000)
const endSec = Math.floor(END.getTime() / 1000)

console.log('Fetching bitcoin reference prices…')
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

const grid = []
for (let day = 0; day <= dayOf(END); day += STEP) grid.push(dateAt(day))

const coins = []
for (const [index, entry] of snapshot.entries()) {
  let series = null
  let source = 'synthetic'

  try {
    const raw = await fetchJson(
      `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/historical?id=${entry.id}&convertId=1&timeStart=${startSec}&timeEnd=${endSec}`,
      `cmc-${entry.id}.json`,
    )
    const points = raw.data.quotes
      .map((quote) => ({
        date: new Date(`${quote.quote.timestamp.slice(0, 10)}T00:00:00Z`),
        value: quote.quote.close,
      }))
      .filter((point) => Number.isFinite(point.value) && point.value > 0)
    const normalise = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
    const sameCoin = normalise(raw.data.name ?? '') === normalise(entry.name)
    const startsOnTime = points[0] && points[0].date <= new Date(START.getTime() + 45 * DAY_MS)
    if (points.length > 2 && (sameCoin || startsOnTime)) {
      const base = points[0].value
      series = points.map((point) => ({ date: point.date, value: point.value / base }))
      source = 'cmc'
    }
  } catch (error) {
    console.warn(`CMC ${entry.symbol}: ${error.message}`)
  }

  if (!series && COINCODEX[entry.symbol]) {
    try {
      const slug = COINCODEX[entry.symbol]
      const raw = await fetchJson(
        `https://coincodex.com/api/coincodex/get_coin_history/${slug}/${iso(START)}/${iso(END)}/1800`,
        `cc-${slug}.json`,
      )
      const key = Object.keys(raw)[0]
      if (key) {
        const points = raw[key]
          .map((item) => ({ date: new Date(item[0] * 1000), value: item[1] }))
          .filter((point) => Number.isFinite(point.value) && point.value > 0)
        if (points.length > 2) {
          const base = points[0].value / interpLog(btcUsd, points[0].date)
          series = points.map((point) => ({
            date: point.date,
            value: point.value / interpLog(btcUsd, point.date) / base,
          }))
          source = 'coincodex'
        }
      }
    } catch (error) {
      console.warn(`CoinCodex ${entry.symbol}: ${error.message}`)
    }
  }

  if (source !== 'synthetic') {
    let values = grid.map((date) => interpLog(series, date))
    if (series[0].date > START) {
      values = grid.map((date, i) => (date < series[0].date ? 1 : values[i]))
    } else {
      const base = interpLog(series, START) || 1
      values = values.map((value) => value / base)
    }
    coins.push({ entry, source, values: values.map((value) => Math.max(value, 1e-12)) })
  } else {
    coins.push({ entry, source, values: null })
  }

  if (index % 10 === 0) console.log(`  ${index + 1}/${snapshot.length}`)
  await sleep(80)
}

const real = coins.filter((coin) => coin.values && coin.entry.symbol !== 'BTC')
const market = grid.map((_, i) => {
  const logs = real.map((coin) => Math.log(coin.values[i]))
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length)
})

for (const coin of coins) {
  if (coin.values && coin.entry.symbol !== 'BURST') continue
  coin.source = 'synthetic'
  const target = 1 + coin.entry.image / 100
  const beta = 0.9 + (0.25 * ((coin.entry.id * 37) % 100)) / 100
  let values = grid.map((_, i) => {
    const x = i / (grid.length - 1)
    const shape = market[i] ** beta
    const monotone = target ** Math.min(1, x * 1.6)
    return Math.exp(Math.log(shape) * 0.5 + Math.log(monotone) * 0.5)
  })
  values = values.map((value) => value / values[0])
  values = values.map((value, i) => value * (target / values[values.length - 1]) ** (i / (values.length - 1)))

  if (coin.entry.symbol === 'BCC') {
    const crashStart = dateAt(136)
    const crashEnd = dateAt(213)
    values = grid.map((date, i) => {
      if (date < crashStart) return Math.max(values[i], 0.9)
      if (date < crashEnd) {
        return 0.9 * (1 - (0.7 * (date.getTime() - crashStart.getTime())) / (crashEnd.getTime() - crashStart.getTime()))
      }
      return Math.min(values[i], 0.05 * target ** 0.2)
    })
    values = values.map((value) => value / values[0])
  }
  coin.values = values
}

for (const coin of coins) {
  if (!coin.entry.dagger || coin.source === 'synthetic' || !coin.values) continue
  const target = 1 + coin.entry.image / 100
  const values = coin.values
  if (Math.abs(values[values.length - 1] - target) <= 0.004 * Math.max(Math.abs(target), 0.02)) {
    continue
  }
  const crossing = values.findIndex((value) => value <= target)
  if (crossing !== -1) {
    for (let i = crossing; i < values.length; i++) values[i] = target
  } else {
    let minimum = 0
    for (let i = 1; i < values.length; i++) if (values[i] < values[minimum]) minimum = i
    if (values[minimum] < 1) {
      for (let i = minimum; i < values.length; i++) {
        const f = (i - minimum) / Math.max(1, values.length - 1 - minimum)
        values[i] = Math.exp(Math.log(values[minimum]) * (1 - f) + Math.log(target) * f)
      }
    }
  }
}

const output = coins
  .map((coin) => ({
    id: coin.entry.id,
    name: coin.entry.name,
    symbol: coin.entry.symbol,
    slug: coin.entry.slug,
    mcap: coin.entry.mcap,
    price: coin.entry.price,
    image: coin.entry.image,
    dagger: coin.entry.dagger,
    src: coin.source,
    vals: coin.values.map((value) => Number(value.toPrecision(6))),
  }))
  .sort((a, b) => b.vals[b.vals.length - 1] - a.vals[a.vals.length - 1])

const days = Math.round(dayOf(END))
await fs.writeFile(
  path.join(root, 'src', 'data', 'coins.json'),
  JSON.stringify({
    start: iso(START),
    end: iso(END),
    step: STEP,
    days,
    coins: output,
  }),
)

console.log(`\nWrote ${output.length} coins × ${grid.length} points to src/data/coins.json`)
for (const coin of output) {
  const final = (coin.vals[coin.vals.length - 1] - 1) * 100
  console.log(
    `${coin.symbol.padEnd(7)} ${coin.src.padEnd(10)} ${final.toFixed(2).padStart(9)}%  print ${String(
      coin.image,
    ).padStart(8)}%`,
  )
}

