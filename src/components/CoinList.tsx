import { memo, useEffect, useRef } from 'react'
import { hasStopped, type CoinView } from '../lib/data'
import { formatPct } from '../lib/format'

export type Row = { coin: CoinView; value: number; rank: number; active: boolean }

const ROW_HEIGHT = 26

type RowProps = {
  coin: CoinView
  value: number
  rank: number
  active: boolean
  index: number
  hovered: boolean
  pinned: boolean
  onHover: (id: number | null) => void
  onPin: (id: number) => void
}

const CoinRow = memo(function CoinRow({
  coin,
  value,
  rank,
  active,
  index,
  hovered,
  pinned,
  onHover,
  onPin,
}: RowProps) {
  const retired = hasStopped(coin)
  return (
    <button
      type="button"
      data-id={coin.id}
      className={`row${retired ? ' is-dagger' : ''}${hovered ? ' is-hovered' : ''}${
        active ? '' : ' is-inactive'
      }`}
      style={{ transform: `translateY(${index * ROW_HEIGHT}px)`, height: ROW_HEIGHT }}
      aria-pressed={pinned}
      title={`${coin.name} (${coin.symbol})`}
      onMouseEnter={() => onHover(coin.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(coin.id)}
      onBlur={() => onHover(null)}
      onClick={() => onPin(coin.id)}
    >
      <span className="row-rank">{active ? rank : '—'}</span>
      <span className="row-swatch" style={{ background: coin.color }} />
      <span className="row-name" style={{ color: coin.ink }}>
        {coin.name}
        {coin.note ? <em> ({coin.note})</em> : null}
        {retired ? <span className="row-dagger">†</span> : null}
        <span className="row-symbol">{coin.symbol}</span>
      </span>
      <span className="row-value" style={{ color: coin.ink }}>
        {active ? formatPct(value) : 'untracked'}
      </span>
    </button>
  )
})

type Props = {
  rows: Row[]
  pinned: number | null
  hovered: number | null
  onHover: (id: number | null) => void
  onPin: (id: number) => void
}

export const CoinList = memo(function CoinList({ rows, pinned, hovered, onHover, onPin }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pinned === null) return
    const container = scrollRef.current
    if (!container) return
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-id]')).find(
      (element) => element.dataset.id === String(pinned),
    )
    if (!row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < container.scrollTop) container.scrollTop = top - 4
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight + 4
    }
  }, [pinned])

  if (rows.length === 0) {
    return <div className="list-empty">No coins match that search.</div>
  }

  return (
    <div className="coin-list" ref={scrollRef}>
      <div className="coin-list-inner" style={{ height: rows.length * ROW_HEIGHT }}>
        {rows.map((row, index) => (
          <CoinRow
            key={row.coin.id}
            coin={row.coin}
            value={row.value}
            rank={row.rank}
            active={row.active}
            index={index}
            hovered={hovered === row.coin.id}
            pinned={pinned === row.coin.id}
            onHover={onHover}
            onPin={onPin}
          />
        ))}
      </div>
    </div>
  )
})
