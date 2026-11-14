import { dateAt, extremes, hasStopped, priceBtcAt, relPct, type CoinView } from '../lib/data'
import { formatBtc, formatCompactUsd, formatDate, formatMonthYear, formatPct } from '../lib/format'

type Props = {
  coin: CoinView
  day: number
  baseDay: number
  cohortLabel: string
  rank: number
  active: boolean
  onClose: () => void
}

export function DetailCard({ coin, day, baseDay, cohortLabel, rank, active, onClose }: Props) {
  // Coins that had already stopped trading are quoted over their whole life instead,
  // since re-basing them to the snapshot date would just read 0%.
  const hasData = coin.vals.length > 0
  const anchor = active ? baseDay : coin.from
  const shownDay = active ? day : coin.until
  const value = relPct(coin, shownDay, anchor)
  const { peak, trough } = extremes(coin, anchor)

  return (
    <section className="detail" style={{ ['--coin' as string]: coin.color }}>
      <div className="detail-head">
        <div>
          <div className="detail-kicker">
            {!hasData
              ? 'No price history'
              : active
                ? `Rank ${rank} · ${hasStopped(coin) ? 'no longer tracked' : 'still tracked'}`
                : 'Not tracked in this window'}
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
        {!hasData ? '—' : active ? formatPct(value) : '—'}
      </div>
      <div className="detail-sub">
        {!hasData
          ? 'This coin has no usable price series in our sources.'
          : active
            ? `vs bitcoin · ${formatDate(dateAt(shownDay))}`
            : `final ${formatPct(value)} vs bitcoin · stopped ${formatMonthYear(dateAt(coin.until))}`}
      </div>

      <div className="detail-grid">
        <div>
          <span className="dlabel">Peak</span>
          <span className="dval">{hasData ? formatPct(peak.value) : '—'}</span>
          <span className="dsub">{hasData ? formatMonthYear(dateAt(peak.day)) : 'no data'}</span>
        </div>
        <div>
          <span className="dlabel">Trough</span>
          <span className="dval">{hasData ? formatPct(trough.value) : '—'}</span>
          <span className="dsub">{hasData ? formatMonthYear(dateAt(trough.day)) : 'no data'}</span>
        </div>
        <div>
          <span className="dlabel">Price</span>
          <span className="dval">{formatBtc(priceBtcAt(coin, shownDay, baseDay))} BTC</span>
          <span className="dsub">at this date</span>
        </div>
        <div>
          <span className="dlabel">Market cap</span>
          <span className="dval">{formatCompactUsd(coin.mcap)}</span>
          <span className="dsub">{cohortLabel}</span>
        </div>
      </div>
    </section>
  )
}
