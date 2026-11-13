import { dateAt, priceBtcAt, valueAt, type CoinView } from '../lib/data'
import { formatBtc, formatCompactUsd, formatDate, formatMonthYear, formatPct } from '../lib/format'

type Props = {
  coin: CoinView
  day: number
  rank: number
  onClose: () => void
}

export function DetailCard({ coin, day, rank, onClose }: Props) {
  const value = valueAt(coin, day) - 1
  const peak = coin.peak.value - 1
  const trough = coin.trough.value - 1

  return (
    <section className="detail" style={{ ['--coin' as string]: coin.color }}>
      <div className="detail-head">
        <div>
          <div className="detail-kicker">
            Rank {rank} · {coin.dagger ? 'no longer tracked' : 'still tracked'}
          </div>
          <div className="detail-name">
            {coin.name}
            <span>{coin.symbol}</span>
          </div>
          {coin.note ? <div className="detail-note">{coin.note}</div> : null}
        </div>
        <button className="detail-close" type="button" onClick={onClose} aria-label="Clear selection">
          ×
        </button>
      </div>

      <div className="detail-value" style={{ color: coin.ink }}>
        {formatPct(value)}
      </div>
      <div className="detail-sub">vs bitcoin · {formatDate(dateAt(day))}</div>

      <div className="detail-grid">
        <div>
          <span className="dlabel">Peak</span>
          <span className="dval">{formatPct(peak)}</span>
          <span className="dsub">{formatMonthYear(dateAt(coin.peak.day))}</span>
        </div>
        <div>
          <span className="dlabel">Trough</span>
          <span className="dval">{formatPct(trough)}</span>
          <span className="dsub">{formatMonthYear(dateAt(coin.trough.day))}</span>
        </div>
        <div>
          <span className="dlabel">Price</span>
          <span className="dval">{formatBtc(priceBtcAt(coin, day))} BTC</span>
          <span className="dsub">at this date</span>
        </div>
        <div>
          <span className="dlabel">Market cap</span>
          <span className="dval">{formatCompactUsd(coin.mcap)}</span>
          <span className="dsub">18 Jun 2017</span>
        </div>
      </div>
    </section>
  )
}
