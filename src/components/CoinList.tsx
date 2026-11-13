import { useEffect, useRef } from 'react'
import type { CoinView } from '../lib/data'
import { formatPct } from '../lib/format'

export type Row = { coin: CoinView; value: number; rank: number }

const ROW_HEIGHT = 26

type Props = {
  rows: Row[]
  pinned: string | null
  hovered: string | null
  onHover: (symbol: string | null) => void
  onPin: (symbol: string) => void
}

export function CoinList({ rows, pinned, hovered, onHover, onPin }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned) return
    const container = scrollRef.current
    if (!container) return
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-symbol]')).find(
      (element) => element.dataset.symbol === pinned,
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
          const { coin } = row
          return (
            <button
              key={coin.symbol}
              type="button"
              data-symbol={coin.symbol}
              className={`row${coin.dagger ? ' is-dagger' : ''}${
                hovered === coin.symbol ? ' is-hovered' : ''
              }`}
              style={{
                transform: `translateY(${index * ROW_HEIGHT}px)`,
                height: ROW_HEIGHT,
              }}
              aria-pressed={pinned === coin.symbol}
              title={`${coin.name} (${coin.symbol})`}
              onMouseEnter={() => onHover(coin.symbol)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(coin.symbol)}
              onBlur={() => onHover(null)}
              onClick={() => onPin(coin.symbol)}
            >
              <span className="row-rank">{row.rank}</span>
              <span className="row-swatch" style={{ background: coin.color }} />
              <span className="row-name" style={{ color: coin.ink }}>
                {coin.name}
                {coin.note ? <em> ({coin.note})</em> : null}
                {coin.dagger ? <span className="row-dagger">†</span> : null}
                <span className="row-symbol">{coin.symbol}</span>
              </span>
              <span className="row-value" style={{ color: coin.ink }}>
                {formatPct(row.value)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
