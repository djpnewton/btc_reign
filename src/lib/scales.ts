/**
 * The original chart stays readable by using a log scale above bitcoin and a
 * linear scale below it. +400% and -100% get the same vertical treatment as in
 * the printed chart.
 */
export const POS_SPAN = 0.2183
const LOG_TOP = Math.log10(5)

export function yNorm(pct: number): number {
  return pct >= 0 ? (Math.log10(1 + pct) / LOG_TOP) * POS_SPAN : pct
}

export type Tick = { value: number; label: string }

export const Y_TICKS: Tick[] = [
  { value: 4, label: '+400%' },
  { value: 2, label: '+200%' },
  { value: 1, label: '+100%' },
  { value: 0.5, label: '+50%' },
  { value: 0, label: '0%' },
  { value: -0.25, label: '−25%' },
  { value: -0.5, label: '−50%' },
  { value: -0.75, label: '−75%' },
  { value: -1, label: '−100%' },
]
