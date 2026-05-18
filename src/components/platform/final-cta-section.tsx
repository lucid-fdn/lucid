'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { Container } from '@/components/container'

export function FinalCtaSection() {
  return (
    <section className="bg-[#0a0a0f] py-32">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Start building the Internet of AI.
          </h2>
          <p className="mt-4 text-base text-white/50">
            Free to start. Scale when you&apos;re ready.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-[#0B84F3] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B84F3]/90 transition-colors"
            >
              Start Building
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
            >
              Talk to Sales
            </Link>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-white/30">
            <a href="https://docs.lucid.foundation" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors">Docs</a>
            <a href="https://discord.gg/lucid" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors">Discord</a>
            <a href="https://github.com/raijinlabs" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors">GitHub</a>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
