const BASE = [
  '#2f2f2f',
  '#b08a4f',
  '#8d4f45',
  '#77879b',
  '#9db8c4',
  '#6f7680',
  '#8d988c',
  '#a69886',
  '#c5b98f',
  '#6a4f51',
  '#887d9d',
  '#c0a18f',
]

const LIFT = [-0.045, 0.035, -0.08, 0.015, 0.06, -0.02, -0.11, 0.045]

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s, l] as const
}

function hslToHex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** A muted, cycling palette that echoes the original print chart. */
export function coinColor(index: number): string {
  const base = BASE[index % BASE.length]
  const cycle = Math.floor(index / BASE.length)
  const [h, s, l] = rgbToHsl(...hexToRgb(base))
  const lift = LIFT[cycle % LIFT.length]
  const hue = h + ((cycle * 7) % 13) - 6
  const sat = Math.min(0.72, Math.max(0.14, s + (cycle % 3) * 0.012))
  const light = Math.min(0.66, Math.max(0.24, l + lift))
  return hslToHex(hue, sat, light)
}

/** A darker variant that stays legible on the paper background. */
export function inkColor(index: number): string {
  const base = BASE[index % BASE.length]
  const cycle = Math.floor(index / BASE.length)
  const [h, s, l] = rgbToHsl(...hexToRgb(base))
  const hue = h + ((cycle * 7) % 13) - 6
  const sat = Math.min(0.7, Math.max(0.16, s + (cycle % 3) * 0.01))
  const light = Math.min(0.46, Math.max(0.2, l - 0.1 + LIFT[(cycle + 3) % LIFT.length] * 0.35))
  return hslToHex(hue, sat, light)
}
