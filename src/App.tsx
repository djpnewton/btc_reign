import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './components/Chart'
import { CoinList, type Row } from './components/CoinList'
import { DetailCard } from './components/DetailCard'
import { Timeline } from './components/Timeline'
import {
  MAX_DAY,
  cohorts,
  dateAt,
  isTradingAt,
  loadCohorts,
  relPct,
} from './lib/data'
import { formatDate, formatPct } from './lib/format'
import { useThrottledValue } from './lib/useThrottledValue'

const PLAY_MS = 24_000

function Splash({ failed }: { failed: boolean }) {
  return (
    <div className="page splash">
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
          {failed
            ? 'The chart data could not be loaded. Check your connection and reload the page.'
            : 'Loading ten years of market snapshots…'}
        </p>
      </header>

      <main className="workspace" aria-busy={!failed}>
        <section className="chart-panel">
          <div className="chart-head">
            <div>
              <div className="chart-label">Performance vs bitcoin</div>
              <div className="chart-date blank">&nbsp;</div>
            </div>
          </div>
          <div className="chart-wrap skeleton" />
        </section>

        <aside className="sidebar">
          <div className="list-card skeleton list-skeleton" />
        </aside>
      </main>
    </div>
  )
}

function Workspace() {
  const [cohortIndex, setCohortIndex] = useState(0)
  const cohort = cohorts[cohortIndex]
  const baseDay = cohort.day

  const [day, setDay] = useState(MAX_DAY)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [hideUntracked, setHideUntracked] = useState(false)

  // The ranking trails the chart slightly while scrubbing or playing.
  const listDay = useThrottledValue(day, 100)

  const dayRef = useRef(day)

  useEffect(() => {
    dayRef.current = day
  }, [day])

  useEffect(() => {
    document.title = `BTC Reign — Top 100 cryptocurrencies of ${cohort.year} vs bitcoin`
  }, [cohort.year])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    let lastPaint = 0
    let current = dayRef.current >= MAX_DAY - 2 ? baseDay : dayRef.current
    if (current < baseDay) current = baseDay
    const span = MAX_DAY - baseDay
    const speed = span / Math.min(PLAY_MS, Math.max(6000, (span / MAX_DAY) * PLAY_MS))

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
  }, [playing, baseDay])

  const rows = useMemo<Row[]>(() => {
    const all = cohort.coins.map((coin) => {
      const active = isTradingAt(coin, baseDay)
      const value = relPct(coin, active ? listDay : coin.until, baseDay)
      return { coin, value, active }
    })
    const live = all
      .filter((row) => row.active)
      .sort((a, b) => b.value - a.value)
      .map((row, index) => ({ ...row, rank: index + 1 }))
    const retired = all
      .filter((row) => !row.active)
      .sort((a, b) => b.value - a.value)
      .map((row) => ({ ...row, rank: 0 }))
    return [...live, ...retired]
  }, [cohort, listDay, baseDay])

  const liveCount = useMemo(() => rows.filter((row) => row.active).length, [rows])
  const needle = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (hideUntracked && !row.active) return false
      if (!needle) return true
      return (
        row.coin.name.toLowerCase().includes(needle) ||
        row.coin.symbol.toLowerCase().includes(needle)
      )
    })
  }, [rows, needle, hideUntracked])

  const dimmed = useMemo(() => {
    if (!needle) return null
    const set = new Set<number>()
    for (const coin of cohort.coins) {
      if (
        !coin.name.toLowerCase().includes(needle) &&
        !coin.symbol.toLowerCase().includes(needle)
      ) {
        set.add(coin.id)
      }
    }
    return set
  }, [needle, cohort])

  const selectedRow = pinned !== null ? rows.find((row) => row.coin.id === pinned) ?? null : null
  const selected = selectedRow?.coin ?? null

  const alts = useMemo(() => rows.filter((row) => row.active && row.coin.symbol !== 'BTC'), [rows])
  const above = alts.filter((row) => row.value > 0).length
  const ascending = [...alts].sort((a, b) => a.value - b.value)
  const median = ascending.length ? ascending[Math.floor(ascending.length / 2)].value : 0
  const best = alts[0]

  const seek = useCallback(
    (value: number) => {
      setPlaying(false)
      setDay(Math.min(MAX_DAY, Math.max(baseDay, value)))
    },
    [baseDay],
  )

  const pin = useCallback((id: number | null) => {
    setPinned((current) => (id !== null && current !== id ? id : null))
  }, [])

  const chooseCohort = useCallback((index: number) => {
    setPlaying(false)
    setCohortIndex(index)
    setPinned(null)
    setHovered(null)
    setDay(MAX_DAY)
  }, [])

  const togglePlay = useCallback(() => setPlaying((value) => !value), [])

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
          Top 100 cryptocurrencies of {cohort.year} <span className="vs">vs</span> bitcoin
        </h1>

        <p className="lede">
          Every coin in the top 100 by market cap on 18 June {cohort.year}, priced in bitcoin
          instead of dollars. Drag the timeline to watch the field fall away, or pick another year
          to load that snapshot's coins.
        </p>

        <div className="stats">
          <div className="stat">
            <span className="stat-label">Altcoins beating bitcoin since {cohort.label}</span>
            <span className="stat-value">
              {above}
              <em> / {alts.length}</em>
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
        <section
          className="chart-panel"
          aria-label={`Chart of the top 100 coins of June ${cohort.year} against bitcoin`}
        >
          <div className="chart-head">
            <div>
              <div className="chart-label">
                Performance vs bitcoin
                <span className="chart-since"> · since {cohort.label}</span>
              </div>
              <div className="chart-date">As of {formatDate(dateAt(day))}</div>
            </div>
            <div className="chart-tools">
              <label className="start-select">
                <span>Snapshot</span>
                <select
                  value={cohortIndex}
                  onChange={(event) => chooseCohort(Number(event.target.value))}
                  aria-label="Snapshot year"
                >
                  {cohorts.map((option, index) => (
                    <option key={option.year} value={index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="chart-hint">Hover · drag · click to pin</span>
            </div>
          </div>

          <Chart
            coins={cohort.coins}
            day={day}
            baseDay={baseDay}
            baseLabel={cohort.label}
            onDay={seek}
            hovered={hovered}
            onHover={setHovered}
            pinned={pinned}
            onPin={pin}
            dimmed={dimmed}
          />

          <Timeline
            day={day}
            baseDay={baseDay}
            maxDay={MAX_DAY}
            playing={playing}
            onDay={seek}
            onTogglePlay={togglePlay}
          />
        </section>

        <aside className="sidebar">
          {selected && (
            <DetailCard
              coin={selected}
              day={day}
              baseDay={baseDay}
              cohortLabel={cohort.label}
              rank={selectedRow?.rank ?? 0}
              active={selectedRow?.active ?? false}
              onClose={() => setPinned(null)}
            />
          )}

          <div className="list-card">
            <div className="list-head">
              <div className="list-title">
                <h2>Ranking</h2>
                <span>
                  {liveCount} tracked
                  {liveCount < rows.length ? ` · ${rows.length - liveCount} untracked` : ''}
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
                    checked={hideUntracked}
                    onChange={(event) => setHideUntracked(event.target.checked)}
                  />
                  <span>Tracked only</span>
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
          <b>Method.</b> Top 100 by market cap on 18 June of the selected year, from{' '}
          <a href="https://coinmarketcap.com/historical/" target="_blank" rel="noreferrer">
            CoinMarketCap's historical snapshots
          </a>
          , converted to bitcoin at that day's close. Prices from{' '}
          <a href="https://coinmarketcap.com/" target="_blank" rel="noreferrer">
            CoinMarketCap
          </a>{' '}
          and{' '}
          <a href="https://coincodex.com/" target="_blank" rel="noreferrer">
            CoinCodex
          </a>
          . † Coins no longer tracked are frozen at their last recorded value. Data through{' '}
          {formatDate(dateAt(MAX_DAY))}.
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

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    cohorts.length > 0 ? 'ready' : 'loading',
  )

  useEffect(() => {
    if (status !== 'loading') return
    let alive = true
    loadCohorts().then(
      () => alive && setStatus('ready'),
      () => alive && setStatus('failed'),
    )
    return () => {
      alive = false
    }
  }, [status])

  if (status === 'ready') return <Workspace />
  return <Splash failed={status === 'failed'} />
}
