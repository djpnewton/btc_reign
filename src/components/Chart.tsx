import { memo, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_DAY,
  START,
  STEP,
  coins,
  dateAt,
  dayOf,
  priceBtcAt,
  valueAt,
  type CoinView,
} from '../lib/data'
import { formatBtc, formatDate, formatPct } from '../lib/format'
import { POS_SPAN, Y_TICKS, yNorm } from '../lib/scales'
import { useElementSize } from '../lib/useElementSize'

type Path = { coin: CoinView; d: string }

type Probe = { x: number; y: number; day: number; symbol: string | null }

type Props = {
  day: number
  onDay: (day: number) => void
  hovered: string | null
  onHover: (symbol: string | null) => void
  pinned: string | null
  onPin: (symbol: string | null) => void
  dimmed: Set<string> | null
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const LineLayer = memo(function LineLayer({
  paths,
  hovered,
  dimmed,
  clipId,
}: {
  paths: Path[]
  hovered: string | null
  dimmed: Set<string> | null
  clipId: string
}) {
  return (
    <g clipPath={`url(#${clipId})`}>
      {paths.map(({ coin, d }) => {
        const isHovered = coin.symbol === hovered
        const isDimmed = dimmed?.has(coin.symbol)
        const opacity = isDimmed ? 0.045 : isHovered ? 0.12 : coin.dagger ? 0.34 : 0.58
        return (
          <path
            key={coin.symbol}
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
          key={coin.symbol}
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

export function Chart({ day, onDay, hovered, onHover, pinned, onPin, dimmed }: Props) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>()
  const [probe, setProbe] = useState<Probe | null>(null)
  const drag = useRef<{ x: number; moved: boolean; symbol: string | null } | null>(null)
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

  const xOfDay = (d: number) => margin.left + (d / MAX_DAY) * iw
  const yOfPct = (pct: number) =>
    margin.top + ((POS_SPAN - yNorm(pct)) / (POS_SPAN + 1)) * ih

  const paths = useMemo<Path[]>(() => {
    if (!iw || !ih) return []
    return coins.map((coin) => {
      const parts: string[] = []
      for (let i = 0; i < coin.vals.length; i++) {
        const x = margin.left + ((i * STEP) / MAX_DAY) * iw
        const y = margin.top + ((POS_SPAN - yNorm(coin.vals[i] - 1)) / (POS_SPAN + 1)) * ih
        parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      }
      return { coin, d: parts.join('') }
    })
  }, [iw, ih, margin.left, margin.top])

  const ticks = useMemo(() => {
    if (!iw) return []
    const years =
      iw < 480
        ? [2017, 2020, 2023, 2026]
        : iw < 760
          ? [2017, 2019, 2021, 2023, 2026]
          : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
    return years
      .map((year) => {
        const date = year === 2017 ? START : new Date(Date.UTC(year, 5, 1))
        return { year, day: dayOf(date) }
      })
      .filter((t) => t.day >= 0 && t.day <= MAX_DAY)
  }, [iw])

  const highlight =
    (pinned && coins.find((coin) => coin.symbol === pinned)) ||
    (hovered && coins.find((coin) => coin.symbol === hovered)) ||
    null

  const highlightPath = highlight ? paths.find((p) => p.coin.symbol === highlight.symbol) : null
  const cursorX = xOfDay(day)
  const tipCoin = probe?.symbol ? coins.find((coin) => coin.symbol === probe.symbol) ?? null : null

  function dayFromX(x: number) {
    return clamp(((x - margin.left) / iw) * MAX_DAY, 0, MAX_DAY)
  }

  function probeAt(event: ReactPointerEvent<SVGSVGElement>) {
    if (!iw || !ih) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, margin.left, margin.left + iw)
    const y = event.clientY - rect.top
    const hoverDay = dayFromX(x)

    let best: CoinView | null = null
    let bestDistance = narrow ? 18 : 24
    for (const coin of coins) {
      if (dimmed?.has(coin.symbol)) continue
      const distance = Math.abs(yOfPct(valueAt(coin, hoverDay) - 1) - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = coin
      }
    }

    const next = { x, y, day: hoverDay, symbol: best?.symbol ?? null }
    setProbe(next)
    onHover(next.symbol)
    return next
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
    drag.current = { x: event.clientX, moved: false, symbol: next?.symbol ?? null }
  }

  function handleUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current && !drag.current.moved) {
      onPin(drag.current.symbol)
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
          aria-label="Line chart of the top 100 cryptocurrencies of June 2017, measured against bitcoin"
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

          {ticks.map((tick) => (
            <text
              key={tick.year}
              x={xOfDay(tick.day)}
              y={margin.top + ih + (narrow ? 15 : 18)}
              textAnchor={tick.year === 2017 ? 'start' : 'middle'}
              className="axis-label"
            >
              Jun {tick.year}
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
                cy={yOfPct(valueAt(highlight, day) - 1)}
                r={4.2}
                fill={highlight.color}
                stroke="#fffdf8"
                strokeWidth={2}
              />
            )}

            {probe && tipCoin && (
              <circle
                cx={probe.x}
                cy={yOfPct(valueAt(tipCoin, probe.day) - 1)}
                r={3.2}
                fill={tipCoin.color}
                stroke="#fffdf8"
                strokeWidth={1.5}
              />
            )}
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
              <div className="tip-value">
                {formatPct(valueAt(tipCoin, probe.day) - 1)}
              </div>
              <div className="tip-meta">
                {formatBtc(priceBtcAt(tipCoin, probe.day))} BTC
                {tipCoin.dagger ? ' · delisted' : ''}
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
