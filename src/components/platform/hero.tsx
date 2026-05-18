'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { Container } from '@/components/container'

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
    >
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        {value}{suffix}
      </motion.span>
    </motion.span>
  )
}

export function PlatformHero() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0a0f] via-[#0B1D3A] to-[#0a0a0f]">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,132,243,0.12)_0%,transparent_70%)]" />

      <Container className="relative z-10 py-32">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-sm font-semibold uppercase tracking-[3px] text-[#0B84F3] mb-6"
          >
            The Internet of AI
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]"
          >
            One platform.
            <br />
            Every AI.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg text-white/60 max-w-xl mx-auto leading-relaxed"
          >
            Build, route, monetize, and launch AI agents across any model, any chain, any scale.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex items-center justify-center gap-4"
          >
            <Link
              href="/signup"
              className="rounded-lg bg-[#0B84F3] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B84F3]/90 transition-colors"
            >
              Start Building
            </Link>
            <Link
              href="#quickstart"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
            >
              See How It Works
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-12 flex items-center justify-center gap-8 text-sm text-white/40"
          >
            <span><AnimatedCounter value={850} suffix="+" /> AI agents</span>
            <span className="w-px h-4 bg-white/20" />
            <span><AnimatedCounter value={10} /> chains</span>
            <span className="w-px h-4 bg-white/20" />
            <span>$0 gas payments</span>
          </motion.div>
        </div>
      </Container>
    </div>
  )
}
