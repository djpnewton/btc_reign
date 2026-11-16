import { useEffect, useRef, useState } from 'react'

/**
 * Follows `value` but commits at most once per `ms`, always ending on the latest
 * value. Used to keep the 100-row ranking from re-rendering on every animation
 * frame while the chart is scrubbing at 60fps.
 */
export function useThrottledValue<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState(value)
  const latest = useRef(value)
  const last = useRef(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    latest.current = value
  }, [value])

  useEffect(() => {
    if (timer.current !== null) return
    const remaining = ms - (performance.now() - last.current)
    if (remaining <= 0) {
      last.current = performance.now()
      setThrottled(latest.current)
      return
    }
    timer.current = window.setTimeout(() => {
      timer.current = null
      last.current = performance.now()
      setThrottled(latest.current)
    }, remaining)
  }, [value, ms])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return throttled
}
