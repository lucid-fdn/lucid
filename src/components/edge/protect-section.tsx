'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'
import {
  ShieldCheckIcon,
  ClockIcon,
  ChartBarIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'

const features = [
  {
    icon: ShieldCheckIcon,
    title: 'Rate Limiting',
    description: 'Per-key, per-model, per-tenant. Configurable burst and sustained limits.',
  },
  {
    icon: ClockIcon,
    title: 'Quota Enforcement',
    description: 'Daily, weekly, monthly caps. Hard and soft limits with alerts.',
  },
  {
    icon: ChartBarIcon,
    title: 'Usage Metering',
    description: 'Token-level tracking per request. Export via API or dashboard.',
  },
  {
    icon: BoltIcon,
    title: 'Edge Acceleration',
    description: 'Runs on Cloudflare\'s edge network. Sub-50ms routing worldwide.',
  },
]

export function ProtectSection() {
  return (
    <section className="bg-[#0f0f14] py-24">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-[3px] text-blue-400">
            Protect
          </p>
          <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
            Enterprise-grade at every layer.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-6"
            >
              <feature.icon className="h-6 w-6 text-blue-400/60" />
              <h3 className="mt-3 text-sm font-bold text-white">{feature.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/40">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  )
}
