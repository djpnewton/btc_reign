import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Tracks an element's size. The first measurement is taken synchronously so the
 * chart paints even when the browser throttles ResizeObserver delivery.
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const apply = (width: number, height: number) => {
      const next = { width: Math.round(width), height: Math.round(height) }
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      )
    }

    const rect = element.getBoundingClientRect()
    apply(rect.width, rect.height)

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) apply(box.width, box.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}
