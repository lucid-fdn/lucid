'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { Container } from '@/components/container'
import { cn } from '@/lib/utils'

export interface PillarConfig {
  label: string
  headline: string
  body: string
  metric: string
  accentColor: string
  accentBg: string
  accentBorder: string
  codeSnippet: string
  codeLang?: string
  visual?: React.ReactNode
  link?: { text: string; href: string }
  reverse?: boolean
}

export function PillarSection({ pillar }: { pillar: PillarConfig }) {
  const contentOrder = pillar.reverse ? 'md:order-2' : 'md:order-1'
  const visualOrder = pillar.reverse ? 'md:order-1' : 'md:order-2'

  return (
    <section className="scroll-mt-20 bg-[#0a0a0f] py-24">
      <Container>
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          {/* Copy side */}
          <motion.div
            initial={{ opacity: 0, x: pillar.reverse ? 30 : -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className={contentOrder}
          >
            <p className={cn('text-xs font-semibold uppercase tracking-[3px]', pillar.accentColor)}>
              {pillar.label}
            </p>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              {pillar.headline}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/50">
              {pillar.body}
            </p>

            <span
              className={cn(
                'mt-6 inline-block rounded-full px-4 py-1.5 text-xs font-medium',
                pillar.accentBg,
                pillar.accentColor,
                'border',
                pillar.accentBorder,
              )}
            >
              {pillar.metric}
            </span>

            {pillar.link && (
              <div className="mt-6">
                <Link href={pillar.link.href} className={cn('text-sm font-medium hover:underline', pillar.accentColor)}>
                  {pillar.link.text}
                </Link>
              </div>
            )}
          </motion.div>

          {/* Visual side */}
          <motion.div
            initial={{ opacity: 0, x: pillar.reverse ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={visualOrder}
          >
            {pillar.visual ? (
              pillar.visual
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111118]">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="ml-2 text-xs text-white/30">{pillar.codeLang ?? 'terminal'}</span>
                </div>
                <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
                  <code className="font-mono text-white/70">{pillar.codeSnippet}</code>
                </pre>
              </div>
            )}
          </motion.div>
        </div>
      </Container>
    </section>
  )
}
