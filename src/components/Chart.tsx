import { memo, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  DAY_MS,
  MAX_DAY,
  START,
  STEP,
  dateAt,
  hasStopped,
  isTradingAt,
  priceBtcAt,
  relPct,
  valueAt,
  type CoinView,
} from '../lib/data'
import { formatBtc, formatDate, formatMonthYear, formatPct } from '../lib/format'
import { POS_SPAN, Y_TICKS, yNorm } from '../lib/scales'
import { useElementSize } from '../lib/useElementSize'

type Path = { coin: CoinView; d: string }

type Probe = { x: number; y: number; day: number; symbol: string | null }

type Props = {
  coins: CoinView[]
  day: number
  baseDay: number
  baseLabel: string
  onDay: (day: number) => void
  hovered: number | null
  onHover: (id: number | null) => void
  pinned: number | null
  onPin: (id: number | null) => void
  dimmed: Set<number> | null
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

const LineLayer = memo(function LineLayer({
  paths,
  hovered,
  dimmed,
  clipId,
}: {
  paths: Path[]
  hovered: number | null
  dimmed: Set<number> | null
  clipId: string
}) {
  return (
    <g clipPath={`url(#${clipId})`}>
      {paths.map(({ coin, d }) => {
        const isHovered = coin.id === hovered
        const isDimmed = dimmed?.has(coin.id)
        const faded = hasStopped(coin)
        const opacity = isDimmed ? 0.045 : isHovered ? 0.12 : faded ? 0.34 : 0.58
        return (
          <path
            key={coin.id}
            d={d}
            fill="none"
            stroke={coin.color}
            strokeWidth={isHovered ? 2.4 : 1.05}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}
    </g>
  )
})

const GhostLayer = memo(function GhostLayer({ paths }: { paths: Path[] }) {
  return (
    <g>
      {paths.map(({ coin, d }) => (
        <path
          key={coin.id}
          d={d}
          fill="none"
          stroke={coin.color}
          strokeWidth={1}
          strokeOpacity={0.11}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})

export function Chart({
  coins,
  day,
  baseDay,
  baseLabel,
  onDay,
  hovered,
  onHover,
  pinned,
  onPin,
  dimmed,
}: Props) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>()
  const [probe, setProbe] = useState<Probe | null>(null)
  const drag = useRef<{ x: number; moved: boolean; id: number | null } | null>(null)
  const revealId = 'chart-reveal'

  const { width, height } = size
  const narrow = width > 0 && width < 560
  const margin = {
    top: 18,
    right: 12,
    bottom: narrow ? 24 : 30,
    left: narrow ? 44 : 56,
  }
  const iw = Math.max(0, width - margin.left - margin.right)
  const ih = Math.max(0, height - margin.top - margin.bottom)
  const span = Math.max(1, MAX_DAY - baseDay)

  const xOfDay = (d: number) => margin.left + ((d - baseDay) / span) * iw
  const yOfPct = (pct: number) =>
    margin.top + ((POS_SPAN - yNorm(pct)) / (POS_SPAN + 1)) * ih

  const visible = useMemo(
    () => coins.filter((coin) => isTradingAt(coin, baseDay)),
    [coins, baseDay],
  )

  const paths = useMemo<Path[]>(() => {
    if (!iw || !ih) return []
    return visible.map((coin) => {
      const base = valueAt(coin, baseDay)
      const first = Math.max(0, Math.floor((baseDay - coin.from) / STEP) - 1)
      const parts: string[] = []
      for (let i = first; i < coin.vals.length; i++) {
        const day = coin.from + i * STEP
        const x = margin.left + ((day - baseDay) / span) * iw
        const y =
          margin.top + ((POS_SPAN - yNorm(coin.vals[i] / base - 1)) / (POS_SPAN + 1)) * ih
        parts.push(`${parts.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      }
      return { coin, d: parts.join('') }
    })
  }, [iw, ih, margin.left, margin.top, baseDay, span, visible])

  const ticks = useMemo(() => {
    if (!iw) return []
    const out = [{ key: 'start', day: baseDay, label: baseLabel }]

    // Short windows read better with month ticks than with year ticks.
    if (span < 500) {
      const stepMonths = span < 150 ? 1 : span < 300 ? 2 : 3
      const cursor = dateAt(baseDay)
      for (let i = 1; i < 40; i++) {
        const date = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + i * stepMonths, 1),
        )
        const day = Math.round((date.getTime() - START.getTime()) / DAY_MS)
        if (day > MAX_DAY - 8) break
        out.push({ key: `${date.getUTCFullYear()}-${date.getUTCMonth()}`, day, label: monthShort.format(date) })
      }
      return out
    }

    const baseYear = Number(baseLabel.split(' ').pop())
    const every = iw < 480 ? 3 : iw < 760 ? 2 : 1
    for (let year = baseYear + 1; year <= 2100; year++) {
      const day = Math.round((Date.UTC(year, 0, 1) - START.getTime()) / DAY_MS)
      if (day > MAX_DAY) break
      if (day - baseDay < 90) continue
      if ((year - baseYear) % every !== 0) continue
      out.push({ key: String(year), day, label: String(year) })
    }
    return out
  }, [iw, baseDay, baseLabel, span])

  const highlight =
    (pinned !== null && visible.find((coin) => coin.id === pinned)) ||
    (hovered !== null && visible.find((coin) => coin.id === hovered)) ||
    null

  const highlightPath = highlight ? paths.find((p) => p.coin.id === highlight.id) : null
  const cursorDay = clamp(day, baseDay, MAX_DAY)
  const cursorX = xOfDay(cursorDay)
  const tipCoin = probe?.symbol ? visible.find((coin) => coin.symbol === probe.symbol) ?? null : null

  function dayFromX(x: number) {
    return clamp(baseDay + ((x - margin.left) / iw) * span, baseDay, MAX_DAY)
  }

  function probeAt(event: ReactPointerEvent<SVGSVGElement>) {
    if (!iw || !ih) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, margin.left, margin.left + iw)
    const y = event.clientY - rect.top
    const hoverDay = dayFromX(x)

    let best: CoinView | null = null
    let bestDistance = narrow ? 18 : 24
    for (const coin of visible) {
      if (dimmed?.has(coin.id)) continue
      const distance = Math.abs(yOfPct(relPct(coin, hoverDay, baseDay)) - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = coin
      }
    }

    const next = { x, y, day: hoverDay, symbol: best?.symbol ?? null }
    setProbe(next)
    onHover(best?.id ?? null)
    return { ...next, id: best?.id ?? null }
  }

  function handleMove(event: ReactPointerEvent<SVGSVGElement>) {
    const next = probeAt(event)
    if (drag.current && next) {
      if (Math.abs(event.clientX - drag.current.x) > 3) drag.current.moved = true
      if (drag.current.moved) onDay(next.day)
    }
  }

  function handleLeave() {
    if (drag.current) return
    setProbe(null)
    onHover(null)
  }

  function handleDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = probeAt(event)
    drag.current = { x: event.clientX, moved: false, id: next?.id ?? null }
  }

  function handleUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current && !drag.current.moved) {
      onPin(drag.current.id)
    }
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (event.pointerType === 'touch') {
      setProbe(null)
      onHover(null)
    }
  }

  const tipLeft = probe
    ? clamp(probe.x + 16 + 196 > width ? probe.x - 196 - 16 : probe.x + 16, 8, Math.max(8, width - 204))
    : 0
  const tipTop = probe ? clamp(probe.y - 24, 8, Math.max(8, height - 116)) : 0

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {width > 0 && height > 0 && (
        <svg
          className="chart"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Line chart of the top 100 cryptocurrencies of ${baseLabel}, measured against bitcoin`}
          onPointerMove={handleMove}
          onPointerLeave={handleLeave}
          onPointerDown={handleDown}
          onPointerUp={handleUp}
          onPointerCancel={() => {
            drag.current = null
            setProbe(null)
            onHover(null)
          }}
        >
          <defs>
            <clipPath id="plot-clip">
              <rect x={margin.left} y={margin.top} width={iw} height={ih} />
            </clipPath>
            <clipPath id={revealId}>
              <rect x={margin.left} y={margin.top} width={Math.max(0, cursorX - margin.left)} height={ih} />
            </clipPath>
          </defs>

          {Y_TICKS.map((tick) => {
            const y = yOfPct(tick.value)
            return (
              <g key={tick.value}>
                {tick.value !== 0 && (
                  <line
                    x1={margin.left}
                    x2={margin.left + iw}
                    y1={y}
                    y2={y}
                    stroke="#1c1b18"
                    strokeOpacity={0.055}
                    strokeDasharray="1 5"
                  />
                )}
                <text
                  x={margin.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="axis-label"
                >
                  {tick.label}
                </text>
              </g>
            )
          })}

          <line
            x1={margin.left}
            x2={margin.left}
            y1={margin.top}
            y2={margin.top + ih}
            stroke="#1c1b18"
            strokeOpacity={0.14}
          />
          <line
            x1={margin.left}
            x2={margin.left + iw}
            y1={margin.top + ih}
            y2={margin.top + ih}
            stroke="#1c1b18"
            strokeOpacity={0.14}
          />

          {ticks.map((tick, index) => (
            <text
              key={tick.key}
              x={xOfDay(tick.day)}
              y={margin.top + ih + (narrow ? 15 : 18)}
              textAnchor={index === 0 ? 'start' : 'middle'}
              className="axis-label"
            >
              {tick.label}
            </text>
          ))}

          <g clipPath="url(#plot-clip)">
            {day < MAX_DAY - 0.01 && <GhostLayer paths={paths} />}
            <LineLayer paths={paths} hovered={hovered} dimmed={dimmed} clipId={revealId} />

            <line
              x1={margin.left}
              x2={margin.left + iw}
              y1={yOfPct(0)}
              y2={yOfPct(0)}
              stroke="#dda23a"
              strokeWidth={1.4}
              strokeOpacity={0.95}
            />

            {highlightPath && (
              <g clipPath={`url(#${revealId})`}>
                <path
                  d={highlightPath.d}
                  fill="none"
                  stroke="#fffdf8"
                  strokeWidth={4.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={highlightPath.d}
                  fill="none"
                  stroke={highlightPath.coin.color}
                  strokeWidth={2.3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}

            {highlight && (
              <circle
                cx={cursorX}
                cy={yOfPct(relPct(highlight, cursorDay, baseDay))}
                r={4.2}
                fill={highlight.color}
                stroke="#fffdf8"
                strokeWidth={2}
              />
            )}

            {probe && tipCoin && (
              <circle
                cx={probe.x}
                cy={yOfPct(relPct(tipCoin, probe.day, baseDay))}
                r={3.2}
                fill={tipCoin.color}
                stroke="#fffdf8"
                strokeWidth={1.5}
              />
            )}

            <g clipPath={`url(#${revealId})`}>
              {visible.map((coin) =>
                hasStopped(coin) ? (
                  <circle
                    key={`end-${coin.id}`}
                    cx={xOfDay(coin.until)}
                    cy={yOfPct(relPct(coin, coin.until, baseDay))}
                    r={1.9}
                    fill="#fffdf8"
                    stroke={coin.color}
                    strokeWidth={1}
                    strokeOpacity={0.75}
                  />
                ) : null,
              )}
            </g>
          </g>

          <line
            x1={cursorX}
            x2={cursorX}
            y1={margin.top}
            y2={margin.top + ih}
            stroke="#1c1b18"
            strokeOpacity={0.22}
            strokeDasharray="3 3"
          />
          <circle cx={cursorX} cy={margin.top} r={2.4} fill="#1c1b18" opacity={0.5} />

          {probe && (
            <line
              x1={probe.x}
              x2={probe.x}
              y1={margin.top}
              y2={margin.top + ih}
              stroke="#1c1b18"
              strokeOpacity={0.16}
            />
          )}
        </svg>
      )}

      {probe && (
        <div className="chart-tip" style={{ left: tipLeft, top: tipTop }}>
          <div className="tip-date">{formatDate(dateAt(probe.day))}</div>
          {tipCoin ? (
            <>
              <div className="tip-name">
                <span className="tip-swatch" style={{ background: tipCoin.color }} />
                <span className="tip-label">{tipCoin.name}</span>
                <span className="tip-symbol">{tipCoin.symbol}</span>
              </div>
              <div className="tip-value">{formatPct(relPct(tipCoin, probe.day, baseDay))}</div>
              <div className="tip-meta">
                {formatBtc(priceBtcAt(tipCoin, probe.day, baseDay))} BTC
                {probe.day > tipCoin.until
                  ? ` · stopped ${formatMonthYear(dateAt(tipCoin.until))}`
                  : ''}
              </div>
            </>
          ) : (
            <div className="tip-hint">Move closer to a line</div>
          )}
        </div>
      )}
    </div>
  )
}
