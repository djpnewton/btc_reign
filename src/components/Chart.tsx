import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

/** Flat [x0, y0, x1, y1, …] in CSS pixels. */
type Path = { coin: CoinView; points: Float32Array; faded: boolean }

type Mark = { id: number; cx: number; cy: number; color: string }

type GridTick = {
  key: string
  label: string
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  grid: boolean
}

type Probe = { x: number; y: number; day: number; id: number | null }

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

/**
 * The 100 series, painted into a canvas.
 *
 * Gecko re-rasterises SVG content on every paint (will-change does not promote SVG
 * subtrees the way Blink does), so 100 paths in an <svg> costs ~50 ms per hover frame
 * in Firefox. A canvas is a retained bitmap: repainting it is a blit, not a redraw.
 */
const PathCanvas = memo(function PathCanvas({
  paths,
  marks,
  dimmed,
  width,
  height,
  variant,
  opacity = 1,
}: {
  paths: Path[]
  marks: Mark[]
  dimmed: Set<number> | null
  width: number
  height: number
  variant: 'ghost' | 'crisp'
  opacity?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas || !width || !height) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.lineWidth = 1.05
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const { coin, points, faded } of paths) {
      ctx.globalAlpha =
        variant === 'ghost' ? 0.11 : dimmed?.has(coin.id) ? 0.045 : faded ? 0.34 : 0.58
      ctx.strokeStyle = coin.color
      ctx.beginPath()
      ctx.moveTo(points[0], points[1])
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1])
      ctx.stroke()
    }

    if (variant === 'crisp') {
      ctx.lineWidth = 1
      for (const mark of marks) {
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(mark.cx, mark.cy, 1.9, 0, Math.PI * 2)
        ctx.fillStyle = '#fffdf8'
        ctx.fill()
        ctx.globalAlpha = 0.75
        ctx.strokeStyle = mark.color
        ctx.stroke()
      }
    }
  }, [paths, marks, dimmed, width, height, variant])

  return (
    <canvas
      ref={ref}
      className={`chart-layer chart-${variant}`}
      style={{ width, height, opacity }}
      aria-hidden="true"
    />
  )
})

const Grid = memo(function Grid({
  yTicks,
  xTicks,
  axis,
}: {
  yTicks: GridTick[]
  xTicks: GridTick[]
  axis: { left: number; right: number; top: number; bottom: number }
}) {
  return (
    <g>
      {yTicks.map((tick) => (
        <g key={tick.key}>
          {tick.grid && (
            <line
              x1={axis.left}
              x2={axis.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#1c1b18"
              strokeOpacity={0.055}
              strokeDasharray="1 5"
            />
          )}
          <text x={axis.left - 8} y={tick.y} textAnchor="end" dominantBaseline="middle" className="axis-label">
            {tick.label}
          </text>
        </g>
      ))}

      <line x1={axis.left} x2={axis.left} y1={axis.top} y2={axis.bottom} stroke="#1c1b18" strokeOpacity={0.14} />
      <line x1={axis.left} x2={axis.right} y1={axis.bottom} y2={axis.bottom} stroke="#1c1b18" strokeOpacity={0.14} />

      {xTicks.map((tick) => (
        <text key={tick.key} x={tick.x} y={tick.y} textAnchor={tick.anchor} className="axis-label">
          {tick.label}
        </text>
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
  const frame = useRef(0)
  const pending = useRef<{ clientX: number; clientY: number; rect: DOMRect } | null>(null)

  const { width, height } = size
  const narrow = width > 0 && width < 560
  const margin = useMemo(
    () => ({ top: 18, right: 12, bottom: narrow ? 24 : 30, left: narrow ? 44 : 56 }),
    [narrow],
  )
  const iw = Math.max(0, width - margin.left - margin.right)
  const ih = Math.max(0, height - margin.top - margin.bottom)
  const span = Math.max(1, MAX_DAY - baseDay)

  const yOfPct = useCallback(
    (pct: number) => margin.top + ((POS_SPAN - yNorm(pct)) / (POS_SPAN + 1)) * ih,
    [margin.top, ih],
  )

  const visible = useMemo(
    () => coins.filter((coin) => isTradingAt(coin, baseDay)),
    [coins, baseDay],
  )

  const paths = useMemo<Path[]>(() => {
    if (!iw || !ih) return []
    return visible.map((coin) => {
      const base = valueAt(coin, baseDay)
      const first = Math.max(0, Math.floor((baseDay - coin.from) / STEP) - 1)
      const count = coin.vals.length - first
      const points = new Float32Array(count * 2)
      let k = 0
      for (let i = first; i < coin.vals.length; i++) {
        points[k++] = margin.left + ((coin.from + i * STEP - baseDay) / span) * iw
        points[k++] =
          margin.top + ((POS_SPAN - yNorm(coin.vals[i] / base - 1)) / (POS_SPAN + 1)) * ih
      }
      return { coin, points, faded: hasStopped(coin) }
    })
  }, [iw, ih, margin.left, margin.top, baseDay, span, visible])

  const marks = useMemo<Mark[]>(() => {
    if (!iw || !ih) return []
    return visible
      .filter(hasStopped)
      .map((coin) => ({
        id: coin.id,
        cx: margin.left + ((coin.until - baseDay) / span) * iw,
        cy: yOfPct(relPct(coin, coin.until, baseDay)),
        color: coin.color,
      }))
  }, [visible, iw, ih, margin.left, baseDay, span, yOfPct])

  const xTicks = useMemo<GridTick[]>(() => {
    if (!iw) return []
    const labelY = margin.top + ih + (narrow ? 15 : 18)
    const out: GridTick[] = [
      { key: 'start', label: baseLabel, x: margin.left, y: labelY, anchor: 'start', grid: false },
    ]

    // Short windows read better with month ticks than with year ticks.
    if (span < 500) {
      const stepMonths = span < 150 ? 1 : span < 300 ? 2 : 3
      const cursor = dateAt(baseDay)
      for (let i = 1; i < 40; i++) {
        const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + i * stepMonths, 1))
        const tickDay = Math.round((date.getTime() - START.getTime()) / DAY_MS)
        if (tickDay > MAX_DAY - 8) break
        out.push({
          key: `m${date.getUTCFullYear()}-${date.getUTCMonth()}`,
          label: monthShort.format(date),
          x: margin.left + ((tickDay - baseDay) / span) * iw,
          y: labelY,
          anchor: 'middle',
          grid: false,
        })
      }
      return out
    }

    const baseYear = Number(baseLabel.split(' ').pop())
    const every = iw < 480 ? 3 : iw < 760 ? 2 : 1
    for (let year = baseYear + 1; year <= 2100; year++) {
      const tickDay = Math.round((Date.UTC(year, 0, 1) - START.getTime()) / DAY_MS)
      if (tickDay > MAX_DAY) break
      if (tickDay - baseDay < 90) continue
      if ((year - baseYear) % every !== 0) continue
      out.push({
        key: `y${year}`,
        label: String(year),
        x: margin.left + ((tickDay - baseDay) / span) * iw,
        y: labelY,
        anchor: 'middle',
        grid: false,
      })
    }
    return out
  }, [iw, ih, margin.left, margin.top, baseDay, baseLabel, span, narrow])

  const yTicks = useMemo<GridTick[]>(
    () =>
      Y_TICKS.map((tick) => ({
        key: `y${tick.value}`,
        label: tick.label,
        x: 0,
        y: yOfPct(tick.value),
        anchor: 'end',
        grid: tick.value !== 0,
      })),
    [yOfPct],
  )

  const axis = useMemo(
    () => ({ left: margin.left, right: margin.left + iw, top: margin.top, bottom: margin.top + ih }),
    [margin.left, margin.top, iw, ih],
  )

  const highlight =
    (pinned !== null && visible.find((coin) => coin.id === pinned)) ||
    (hovered !== null && visible.find((coin) => coin.id === hovered)) ||
    null

  const highlightPath = useMemo(() => {
    if (!highlight) return null
    const path = paths.find((p) => p.coin.id === highlight.id)
    if (!path) return null
    const { points } = path
    let d = ''
    for (let i = 0; i < points.length; i += 2) {
      d += `${i === 0 ? 'M' : 'L'}${points[i].toFixed(1)} ${points[i + 1].toFixed(1)}`
    }
    return d
  }, [highlight, paths])

  const cursorDay = clamp(day, baseDay, MAX_DAY)
  const cursorX = margin.left + ((cursorDay - baseDay) / span) * iw
  const probeCoin = probe?.id != null ? visible.find((coin) => coin.id === probe.id) ?? null : null

  const applyProbe = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const x = clamp(clientX - rect.left, margin.left, margin.left + iw)
      const y = clientY - rect.top
      const hoverDay = clamp(baseDay + ((x - margin.left) / iw) * span, baseDay, MAX_DAY)

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

      setProbe({ x, y, day: hoverDay, id: best?.id ?? null })
      onHover(best?.id ?? null)
      if (drag.current?.moved) onDay(hoverDay)
      return best?.id ?? null
    },
    [margin.left, iw, narrow, visible, dimmed, yOfPct, baseDay, span, onHover, onDay],
  )

  // Coalesce pointer events into one probe update per frame.
  const schedule = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pending.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        rect: event.currentTarget.getBoundingClientRect(),
      }
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const next = pending.current
        pending.current = null
        if (next) applyProbe(next.clientX, next.clientY, next.rect)
      })
    },
    [applyProbe],
  )

  function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!iw || !ih) return
    if (drag.current && Math.abs(event.clientX - drag.current.x) > 3) drag.current.moved = true
    schedule(event)
  }

  function handleLeave() {
    if (drag.current) return
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    pending.current = null
    setProbe(null)
    onHover(null)
  }

  function handleDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const id = applyProbe(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    drag.current = { x: event.clientX, moved: false, id }
  }

  function handleUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current && !drag.current.moved) onPin(drag.current.id)
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (event.pointerType === 'touch') {
      setProbe(null)
      onHover(null)
    }
  }

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const tipLeft = probe
    ? clamp(probe.x + 16 + 196 > width ? probe.x - 196 - 16 : probe.x + 16, 8, Math.max(8, width - 204))
    : 0
  const tipTop = probe ? clamp(probe.y - 24, 8, Math.max(8, height - 116)) : 0
  const revealInset = Math.max(0, width - cursorX)

  return (
    <div
      className="chart-wrap"
      ref={wrapRef}
      role="img"
      aria-label={`Line chart of the top 100 cryptocurrencies of ${baseLabel}, measured against bitcoin`}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleLeave}
    >
      {width > 0 && height > 0 && (
        <>
          <svg className="chart-layer chart-grid" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <Grid yTicks={yTicks} xTicks={xTicks} axis={axis} />
          </svg>

          <PathCanvas
            variant="ghost"
            paths={paths}
            marks={marks}
            dimmed={dimmed}
            width={width}
            height={height}
            opacity={day < MAX_DAY - 0.01 ? 1 : 0}
          />

          <div
            className="chart-layer chart-reveal"
            style={{ width, height, clipPath: `inset(0 ${revealInset}px 0 0)` }}
          >
            <PathCanvas
              variant="crisp"
              paths={paths}
              marks={marks}
              dimmed={dimmed}
              width={width}
              height={height}
            />
          </div>

          <svg className="chart-layer chart-overlay" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <clipPath id="overlay-plot">
                <rect x={margin.left} y={margin.top} width={iw} height={ih} />
              </clipPath>
              <clipPath id="overlay-reveal">
                <rect x={margin.left} y={margin.top} width={Math.max(0, cursorX - margin.left)} height={ih} />
              </clipPath>
            </defs>

            <g clipPath="url(#overlay-plot)">
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
                <g clipPath="url(#overlay-reveal)">
                  <path
                    d={highlightPath}
                    fill="none"
                    stroke="#fffdf8"
                    strokeWidth={4.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={highlightPath}
                    fill="none"
                    stroke={highlight?.color}
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

              {probe && probeCoin && (
                <circle
                  cx={probe.x}
                  cy={yOfPct(relPct(probeCoin, probe.day, baseDay))}
                  r={3.2}
                  fill={probeCoin.color}
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
        </>
      )}

      {probe && (
        <div className="chart-tip" style={{ transform: `translate3d(${tipLeft}px, ${tipTop}px, 0)` }}>
          <div className="tip-date">{formatDate(dateAt(probe.day))}</div>
          {probeCoin ? (
            <>
              <div className="tip-name">
                <span className="tip-swatch" style={{ background: probeCoin.color }} />
                <span className="tip-label">{probeCoin.name}</span>
                <span className="tip-symbol">{probeCoin.symbol}</span>
              </div>
              <div className="tip-value">{formatPct(relPct(probeCoin, probe.day, baseDay))}</div>
              <div className="tip-meta">
                {formatBtc(priceBtcAt(probeCoin, probe.day, baseDay))} BTC
                {probe.day > probeCoin.until
                  ? ` · stopped ${formatMonthYear(dateAt(probeCoin.until))}`
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
