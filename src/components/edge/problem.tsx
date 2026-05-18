'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'
import { MagicCard } from '@/ui/components/magic-card'
import {
  KeyIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

const problems = [
  {
    icon: KeyIcon,
    title: '13 API keys',
    description: 'A different key, SDK, and billing dashboard for every provider. Your infra is a patchwork.',
  },
  {
    icon: CurrencyDollarIcon,
    title: 'Zero monetization',
    description: 'No native way to charge for your AI. You build the product, then build the billing from scratch.',
  },
  {
    icon: ExclamationTriangleIcon,
    title: 'No failover',
    description: 'One provider goes down, your app goes down. No automatic rerouting. No fallback. Just 500s.',
  },
]

export function EdgeProblem() {
  return (
    <section className="bg-[#0f0f14] py-20">
      <Container>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-10 text-center text-sm font-semibold uppercase tracking-[3px] text-white/30"
        >
          The problem
        </motion.p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {problems.map((problem, i) => (
            <motion.div
              key={problem.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <MagicCard
                gradientColor="#0B84F3"
                gradientOpacity={0.08}
                className="h-full rounded-2xl border border-white/10 bg-[#111118] p-8"
              >
                <problem.icon className="h-8 w-8 text-white/30" />
                <h3 className="mt-4 text-lg font-bold text-white">{problem.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/40">
                  {problem.description}
                </p>
              </MagicCard>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  )
}
