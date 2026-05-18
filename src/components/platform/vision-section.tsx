'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'

export function VisionSection() {
  return (
    <section className="relative bg-[#0a0a0f] py-32">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_center,rgba(11,132,243,0.06)_0%,transparent_70%)]" />

      <Container className="relative z-10">
        <motion.blockquote
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-3xl text-center text-3xl font-semibold leading-snug text-white sm:text-4xl"
        >
          What if every AI could talk to every other AI — across any model, any
          chain — and everyone got paid fairly?
        </motion.blockquote>
      </Container>
    </section>
  )
}
