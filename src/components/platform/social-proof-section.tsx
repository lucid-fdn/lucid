'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'

const providers = [
  'OpenAI', 'Anthropic', 'Google', 'Hugging Face', 'Replicate',
  'Solana', 'Base', 'Ethereum', 'Arbitrum', 'Optimism', 'Polygon', 'Sui',
]

const badges = [
  '99.9% SLA',
  'SSO / SAML',
  'Audit Trails',
  'Multi-Region',
]

export function SocialProofSection() {
  return (
    <section className="bg-[#0f0f14] py-24">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-[3px] text-white/40 mb-4">
            Trusted Infrastructure
          </p>
        </motion.div>

        {/* Provider logos as text */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
        >
          {providers.map((name) => (
            <span key={name} className="text-sm font-medium text-white/25 transition-colors hover:text-white/50">
              {name}
            </span>
          ))}
        </motion.div>

        {/* Enterprise badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-3"
        >
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/50"
            >
              {badge}
            </span>
          ))}
        </motion.div>
      </Container>
    </section>
  )
}
