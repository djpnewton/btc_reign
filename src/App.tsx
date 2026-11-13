import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './components/Chart'
import { CoinList, type Row } from './components/CoinList'
import { DetailCard } from './components/DetailCard'
import { Timeline } from './components/Timeline'
import { MAX_DAY, coins, dateAt, pctAt } from './lib/data'
import { formatDate, formatPct } from './lib/format'

const PLAY_MS = 24_000

export default function App() {
  const [day, setDay] = useState(MAX_DAY)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hideDelisted, setHideDelisted] = useState(false)

  const dayRef = useRef(day)

  useEffect(() => {
    dayRef.current = day
  }, [day])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    let lastPaint = 0
    let current = dayRef.current >= MAX_DAY - 2 ? 0 : dayRef.current
    const speed = MAX_DAY / PLAY_MS

    const tick = (now: number) => {
      const delta = Math.min(80, now - last)
      last = now
      current = Math.min(MAX_DAY, current + speed * delta)
      if (now - lastPaint > 32 || current >= MAX_DAY) {
        setDay(current)
        lastPaint = now
      }
      if (current < MAX_DAY) {
        frame = requestAnimationFrame(tick)
      } else {
        setDay(MAX_DAY)
        setPlaying(false)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const rows = useMemo<Row[]>(() => {
    return coins
      .map((coin) => ({ coin, value: pctAt(coin, day) }))
      .sort((a, b) => b.value - a.value)
      .map((row, index) => ({ ...row, rank: index + 1 }))
  }, [day])

  const needle = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (hideDelisted && row.coin.dagger) return false
      if (!needle) return true
      return (
        row.coin.name.toLowerCase().includes(needle) ||
        row.coin.symbol.toLowerCase().includes(needle)
      )
    })
  }, [rows, needle, hideDelisted])

  const dimmed = useMemo(() => {
    if (!needle) return null
    const set = new Set<string>()
    for (const coin of coins) {
      if (
        !coin.name.toLowerCase().includes(needle) &&
        !coin.symbol.toLowerCase().includes(needle)
      ) {
        set.add(coin.symbol)
      }
    }
    return set
  }, [needle])

  const selected = pinned ? coins.find((coin) => coin.symbol === pinned) ?? null : null
  const selectedRank = selected
    ? rows.find((row) => row.coin.symbol === selected.symbol)?.rank ?? 0
    : 0

  const alts = rows.filter((row) => row.coin.symbol !== 'BTC')
  const above = alts.filter((row) => row.value > 0).length
  const ascending = [...alts].sort((a, b) => a.value - b.value)
  const median = ascending.length ? ascending[Math.floor(ascending.length / 2)].value : 0
  const best = alts[0]

  const seek = (value: number) => {
    setPlaying(false)
    setDay(value)
  }

  const pin = (symbol: string | null) => {
    setPinned((current) => (symbol && current !== symbol ? symbol : null))
  }

  return (
    <div className="page">
      <header className="masthead">
        <div className="eyebrow">
          <span className="brand">
            <i aria-hidden="true" /> BTC Reign
          </span>
          <span className="rule" aria-hidden="true" />
          <span>An interactive chart</span>
          <span className="eyebrow-right">Measured in bitcoin</span>
        </div>

        <h1>
          Top 100 cryptocurrencies of 2017 <span className="vs">vs</span> bitcoin
        </h1>

        <p className="lede">
          Every coin in the top 100 by market cap on 18 June 2017, priced in bitcoin instead of
          dollars. Drag the timeline to watch the field fall away.
        </p>

        <div className="stats">
          <div className="stat">
            <span className="stat-label">Altcoins beating bitcoin</span>
            <span className="stat-value">
              {above}
              <em> / 99</em>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Median altcoin</span>
            <span className="stat-value">{formatPct(median)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Best altcoin</span>
            <span
              className="stat-value stat-best"
              title={best ? `${best.coin.name} ${formatPct(best.value)}` : undefined}
            >
              {best ? `${best.coin.name} ${formatPct(best.value)}` : '—'}
            </span>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="chart-panel" aria-label="Chart of the top 100 coins of 2017 against bitcoin">
          <div className="chart-head">
            <div>
              <div className="chart-label">Performance vs bitcoin</div>
              <div className="chart-date">As of {formatDate(dateAt(day))}</div>
            </div>
            <div className="chart-hint">Hover to inspect · drag to scrub · click to pin</div>
          </div>

          <Chart
            day={day}
            onDay={seek}
            hovered={hovered}
            onHover={setHovered}
            pinned={pinned}
            onPin={pin}
            dimmed={dimmed}
          />

          <Timeline
            day={day}
            maxDay={MAX_DAY}
            playing={playing}
            onDay={seek}
            onTogglePlay={() => setPlaying((value) => !value)}
          />
        </section>

        <aside className="sidebar">
          {selected && (
            <DetailCard coin={selected} day={day} rank={selectedRank} onClose={() => setPinned(null)} />
          )}

          <div className="list-card">
            <div className="list-head">
              <div className="list-title">
                <h2>Ranking</h2>
                <span>
                  {filtered.length} of {rows.length}
                </span>
              </div>

              <div className="search-row">
                <label className="search">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M7.6 7.6 11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find a coin"
                    aria-label="Find a coin"
                  />
                </label>

                <label className="switch">
                  <input
                    type="checkbox"
                    checked={hideDelisted}
                    onChange={(event) => setHideDelisted(event.target.checked)}
                  />
                  <span>Active only</span>
                </label>
              </div>
            </div>

            <CoinList
              rows={filtered}
              pinned={pinned}
              hovered={hovered}
              onHover={setHovered}
              onPin={pin}
            />
          </div>
        </aside>
      </main>

      <footer className="footer">
        <p>
          <b>Method.</b> Prices from{' '}
          <a href="https://coinmarketcap.com/historical/20170618/" target="_blank" rel="noreferrer">
            CoinMarketCap's 18 June 2017 snapshot
          </a>
          , converted to bitcoin at that day's close. Historical series from{' '}
          <a href="https://coinmarketcap.com/" target="_blank" rel="noreferrer">
            CoinMarketCap
          </a>{' '}
          and{' '}
          <a href="https://coincodex.com/" target="_blank" rel="noreferrer">
            CoinCodex
          </a>
          . † Coins CoinMarketCap no longer tracks are frozen at their last recorded value. Data
          through {formatDate(dateAt(MAX_DAY))}.
        </p>
        <p className="credit">
          Inspired by{' '}
          <a href="https://river.com/" target="_blank" rel="noreferrer">
            River Financial
          </a>
          's print chart. Not investment advice.
        </p>
      </footer>
    </div>
  )
}
