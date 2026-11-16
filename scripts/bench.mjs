/**
 * Hover/scrub benchmark for the chart, run in a real browser.
 *
 *   node scripts/bench.mjs [chromium|firefox] [url]
 */
import { chromium, firefox } from 'playwright-core'

const engine = process.argv[2] ?? 'chromium'
const url = process.argv[3] ?? 'http://127.0.0.1:4173/'

const browser = await (engine === 'firefox' ? firefox : chromium).launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(url)
await page.waitForSelector('.chart-wrap')
await page.waitForFunction(() => document.querySelectorAll('.row').length > 0, null, { timeout: 20000 })
await page.waitForTimeout(600)

const measure = (mode) =>
  page.evaluate(async (mode) => {
    const wrap = document.querySelector('.chart-wrap')
    const rect = wrap.getBoundingClientRect()
    const input = document.querySelector('input[type=range]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    const times = []

    await new Promise((resolve) => {
      const t0 = performance.now()
      let last = t0
      const loop = (now) => {
        times.push(now - last)
        last = now
        const t = now - t0
        if (mode === 'hover') {
          const x = rect.left + 120 + ((t * 0.35) % (rect.width - 240))
          const y = rect.top + 120 + Math.sin(t / 260) * 180
          wrap.dispatchEvent(
            new PointerEvent('pointermove', {
              bubbles: true,
              clientX: x,
              clientY: y,
              pointerType: 'mouse',
            }),
          )
        } else {
          setter.call(input, String(1000 + ((t * 0.45) % 2000)))
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        if (t < 2500) requestAnimationFrame(loop)
        else resolve()
      }
      requestAnimationFrame(loop)
    })

    times.sort((a, b) => a - b)
    const p = (q) => Math.round(times[Math.floor(times.length * q)])
    return { fps: Math.round((times.length / 2500) * 1000), p50: p(0.5), p90: p(0.9), p99: p(0.99) }
  }, mode)

console.log(JSON.stringify({ engine, hover: await measure('hover'), scrub: await measure('scrub') }))
await browser.close()
