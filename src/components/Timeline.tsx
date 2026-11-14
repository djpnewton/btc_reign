import { formatMonthYear } from '../lib/format'
import { dateAt } from '../lib/data'

type Props = {
  day: number
  baseDay: number
  maxDay: number
  playing: boolean
  onDay: (day: number) => void
  onTogglePlay: () => void
}

export function Timeline({ day, baseDay, maxDay, playing, onDay, onTogglePlay }: Props) {
  const span = Math.max(1, maxDay - baseDay)
  const progress = Math.min(100, Math.max(0, ((day - baseDay) / span) * 100))

  return (
    <div className="timeline">
      <button
        type="button"
        className="play-button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause animation' : 'Play animation'}
      >
        {playing ? (
          <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
            <rect x="1" y="1" width="3" height="10" rx="0.5" fill="currentColor" />
            <rect x="7" y="1" width="3" height="10" rx="0.5" fill="currentColor" />
          </svg>
        ) : (
          <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
            <path d="M2 1.2c0-.6.6-1 1.1-.7l7 4.8c.4.3.4.9 0 1.2l-7 4.8c-.5.3-1.1 0-1.1-.7V1.2Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="track">
        <input
          type="range"
          min={baseDay}
          max={maxDay}
          step={0.5}
          value={Math.min(Math.max(day, baseDay), maxDay)}
          onChange={(event) => onDay(Number(event.target.value))}
          aria-label="Timeline date"
          style={{ ['--progress' as string]: `${progress}%` }}
        />
        <div className="track-labels" aria-hidden="true">
          <span>{formatMonthYear(dateAt(baseDay))}</span>
          <span>{formatMonthYear(dateAt(maxDay))}</span>
        </div>
      </div>

      <button
        type="button"
        className="latest-button"
        onClick={() => onDay(maxDay)}
        disabled={day >= maxDay - 0.5}
      >
        Latest
      </button>
    </div>
  )
}
