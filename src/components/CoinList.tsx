import { useEffect, useRef } from 'react'
import { hasStopped, type CoinView } from '../lib/data'
import { formatPct } from '../lib/format'

export type Row = { coin: CoinView; value: number; rank: number; active: boolean }

const ROW_HEIGHT = 26

type Props = {
  rows: Row[]
  pinned: number | null
  hovered: number | null
  onHover: (id: number | null) => void
  onPin: (id: number) => void
}

export function CoinList({ rows, pinned, hovered, onHover, onPin }: Props) {
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
        {rows.map((row, index) => {
          const { coin, active } = row
          const retired = hasStopped(coin)
          return (
            <button
              key={coin.id}
              type="button"
              data-id={coin.id}
              className={`row${retired ? ' is-dagger' : ''}${
                hovered === coin.id ? ' is-hovered' : ''
              }${active ? '' : ' is-inactive'}`}
              style={{
                transform: `translateY(${index * ROW_HEIGHT}px)`,
                height: ROW_HEIGHT,
              }}
              aria-pressed={pinned === coin.id}
              title={`${coin.name} (${coin.symbol})`}
              onMouseEnter={() => onHover(coin.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(coin.id)}
              onBlur={() => onHover(null)}
              onClick={() => onPin(coin.id)}
            >
              <span className="row-rank">{active ? row.rank : '—'}</span>
              <span className="row-swatch" style={{ background: coin.color }} />
              <span className="row-name" style={{ color: coin.ink }}>
                {coin.name}
                {coin.note ? <em> ({coin.note})</em> : null}
                {retired ? <span className="row-dagger">†</span> : null}
                <span className="row-symbol">{coin.symbol}</span>
              </span>
              <span className="row-value" style={{ color: coin.ink }}>
                {active ? formatPct(row.value) : 'untracked'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
