const MINUS = '\u2212'

export function formatPct(pct: number): string {
  const p = pct * 100
  const signChar = p < 0 ? MINUS : p > 0 ? '+' : ''
  const abs = Math.abs(p)

  if (abs < 0.0001) return '0%'
  if (abs >= 100) return `${signChar}${abs.toFixed(0)}%`
  if (abs >= 1) return `${signChar}${abs.toFixed(1)}%`
  if (abs < 0.1) return `${signChar}${abs.toFixed(2)}%`

  const missing = 100 - abs
  if (abs > 99.99995) return `${signChar}100%`
  if (missing < 0.004) return `${signChar}${abs.toFixed(4)}%`
  if (missing < 0.04) return `${signChar}${abs.toFixed(3)}%`
  if (missing < 0.4) return `${signChar}${abs.toFixed(2)}%`
  return `${signChar}${abs.toFixed(1)}%`
}

export function formatCompactUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export function formatBtc(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n >= 1) return n.toFixed(2)
  if (n >= 0.001) return n.toPrecision(4)
  return n.toExponential(2).replace('e-', 'e\u2212')
}

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const monthYear = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(date: Date): string {
  return shortDate.format(date)
}

export function formatMonthYear(date: Date): string {
  return monthYear.format(date)
}
