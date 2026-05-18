'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'
import { Container } from '@/components/container'

function Counter({ end, suffix = '', label }: { end: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let current = 0
    const step = Math.max(1, Math.floor(end / 40))
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
      <div className="text-4xl font-bold text-white sm:text-5xl">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="mt-2 text-sm text-white/40">{label}</div>
    </div>
  )
}

const stats = [
  { end: 850, suffix: '+', label: 'Agents Deployed' },
  { end: 12400, suffix: '+', label: 'Payments Processed' },
  { end: 10, suffix: '', label: 'Chains Connected' },
  { end: 8, suffix: '', label: 'Facilitators Active' },
  { end: 100, suffix: '+', label: 'Models Available' },
  { end: 99, suffix: '.9%', label: 'Uptime' },
]

export function StatsSection() {
  return (
    <section className="bg-black py-24">
      <Container>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 gap-12 sm:grid-cols-3 lg:grid-cols-6"
        >
          {stats.map((stat) => (
            <Counter key={stat.label} {...stat} />
          ))}
        </motion.div>
      </Container>
    </section>
  )
}
