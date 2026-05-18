'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { Container } from '@/components/container'

function Counter({ end, suffix = '', label }: { end: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let current = 0
    const step = Math.max(1, Math.floor(end / 30))
    const interval = setInterval(() => {
      current += step
      if (current >= end) {
        setCount(end)
        clearInterval(interval)
      } else {
        setCount(current)
      }
    }, 30)
    return () => clearInterval(interval)
  }, [isInView, end])

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl font-bold text-white sm:text-4xl">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="mt-1 text-xs text-white/30">{label}</div>
    </div>
  )
}

export function EdgeStats() {
  return (
    <section className="bg-[#0f0f14] py-16">
      <Container>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <Counter end={13} suffix="" label="LLM Providers" />
          <Counter end={10} suffix="" label="Chains" />
          <Counter end={8} suffix="" label="Payment Facilitators" />
          <Counter end={99} suffix=".9%" label="Uptime" />
        </div>
      </Container>
    </section>
  )
}
