'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { Container } from '@/components/container'
import { LightRays } from '@/ui/components/light-rays'
import { ShimmerButton } from '@/ui/components/shimmer-button'
import { TextShimmer } from '@/ui/components/text-shimmer'

export function EdgeHero() {
  return (
    <div className="relative flex min-h-[85vh] items-center justify-center overflow-hidden bg-[#0a0a0f]">
      <LightRays
        count={5}
        color="rgba(11, 132, 243, 0.08)"
        blur={60}
        speed={8}
        className="absolute inset-0"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,132,243,0.06)_0%,transparent_60%)]" />

      <Container className="relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <TextShimmer duration={3} spread={20} className="text-sm font-semibold uppercase tracking-[4px] text-[#0B84F3]/80">
              Lucid Edge
            </TextShimmer>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            The Cloudflare of AI
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-white/50"
          >
            One endpoint. Every model. Payments included.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex items-center justify-center gap-4"
          >
            <ShimmerButton rounded="lg" size="lg" className="font-semibold">
              <Link href="/docs">Get API Key</Link>
            </ShimmerButton>
            <Link
              href="#route"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
            >
              See How It Works
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-14 flex items-center justify-center gap-8 text-sm"
          >
            {[
              { value: '<50ms', label: 'latency' },
              { value: '13', label: 'providers' },
              { value: '10', label: 'chains' },
              { value: '$0', label: 'gas' },
            ].map((stat, i) => (
              <div key={stat.label} className="flex items-center gap-2">
                {i > 0 && <span className="mr-6 h-4 w-px bg-white/15" />}
                <span className="font-bold text-white">{stat.value}</span>
                <span className="text-white/30">{stat.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </Container>
    </div>
  )
}
