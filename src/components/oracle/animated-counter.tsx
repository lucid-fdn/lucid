'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  /** Target value to animate to */
  value: number
  /** Duration of animation in ms (default 800) */
  duration?: number
  /** Optional prefix (e.g. "$") */
  prefix?: string
  /** Optional suffix (e.g. "M", "K") */
  suffix?: string
  /** Decimal places (default 0) */
  decimals?: number
  /** CSS class for the number */
  className?: string
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function AnimatedCounter({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const fromRef = useRef<number>(0)

  useEffect(() => {
    if (typeof value !== 'number' || Number.isNaN(value)) return

    fromRef.current = display
    startRef.current = 0

    function animate(timestamp: number) {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)
      const current = fromRef.current + (value - fromRef.current) * eased

      setDisplay(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // We intentionally only animate when `value` changes, not when `display` changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString()

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  )
}

/**
 * Parses a formatted string like "$1.23M" or "450" and returns
 * { value, prefix, suffix, decimals } for use with AnimatedCounter.
 */
export function parseFormattedValue(str: string): {
  value: number
  prefix: string
  suffix: string
  decimals: number
} {
  if (!str || str === '--') return { value: 0, prefix: '', suffix: '', decimals: 0 }

  let prefix = ''
  let suffix = ''
  let numStr = str

  // Extract prefix ($)
  if (numStr.startsWith('$')) {
    prefix = '$'
    numStr = numStr.slice(1)
  }

  // Extract suffix (M, K, B, %)
  const lastChar = numStr.slice(-1)
  if (['M', 'K', 'B', '%'].includes(lastChar)) {
    suffix = lastChar
    numStr = numStr.slice(0, -1)
  }

  const value = parseFloat(numStr) || 0
  const decimalIndex = numStr.indexOf('.')
  const decimals = decimalIndex >= 0 ? numStr.length - decimalIndex - 1 : 0

  return { value, prefix, suffix, decimals }
}
