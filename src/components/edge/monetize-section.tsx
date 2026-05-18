'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'
import { BorderBeam } from '@/ui/components/border-beam'
import { cn } from '@/lib/utils'

const steps = [
  { step: '1', label: 'Request', description: 'Agent calls your API', color: 'text-white/60' },
  { step: '2', label: '402', description: 'Edge returns price + payment options', color: 'text-amber-400' },
  { step: '3', label: 'Pay', description: 'Agent pays — gasless, any chain', color: 'text-emerald-400' },
  { step: '4', label: 'Access', description: 'Proof verified, request fulfilled', color: 'text-blue-400' },
]

const chains = ['Base', 'Ethereum', 'Solana', 'Arbitrum', 'Optimism', 'Polygon', 'Sui', 'Apechain', 'Monad']

export function MonetizeSection() {
  return (
    <section className="bg-[#0a0a0f] py-24">
      <Container>
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          {/* Code side */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="md:order-2"
          >
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111118]">
              <BorderBeam size={120} duration={6} colorFrom="#10b981" colorTo="#0B84F3" borderWidth={1} />
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="ml-2 text-xs text-white/30">payment_config.json</span>
              </div>
              <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
                <code className="font-mono">
                  <span className="text-blue-300">{'{'}</span>{'\n'}
                  <span className="text-blue-300">{'  "enabled"'}</span><span className="text-white/70">: </span><span className="text-emerald-400">true</span><span className="text-white/70">,</span>{'\n'}
                  <span className="text-blue-300">{'  "defaultPrice"'}</span><span className="text-white/70">: </span><span className="text-amber-300">{'"0.01"'}</span><span className="text-white/70">,</span>{'\n'}
                  <span className="text-blue-300">{'  "payoutAddress"'}</span><span className="text-white/70">: </span><span className="text-amber-300">{'"0xYourWallet"'}</span><span className="text-white/70">,</span>{'\n'}
                  <span className="text-blue-300">{'  "acceptedChains"'}</span><span className="text-white/70">: [</span>{'\n'}
                  <span className="text-amber-300">{'    "base"'}</span><span className="text-white/70">, </span><span className="text-amber-300">{'"solana"'}</span><span className="text-white/70">, </span><span className="text-amber-300">{'"ethereum"'}</span>{'\n'}
                  <span className="text-white/70">{'  ],'}</span>{'\n'}
                  <span className="text-blue-300">{'  "acceptedTokens"'}</span><span className="text-white/70">: [</span><span className="text-amber-300">{'"USDC"'}</span><span className="text-white/70">, </span><span className="text-amber-300">{'"USDT"'}</span><span className="text-white/70">]</span>{'\n'}
                  <span className="text-blue-300">{'}'}</span>
                </code>
              </pre>
            </div>
          </motion.div>

          {/* Copy side */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="md:order-1"
          >
            <p className="text-xs font-semibold uppercase tracking-[3px] text-emerald-400">
              Monetize
            </p>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              Your API pays for itself.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/50">
              x402 turns any endpoint into a paid service with one config.
              HTTP 402 — the payment status code the web forgot.
              Gasless for users. Instant for you. Zero payment code required.
            </p>

            {/* x402 flow */}
            <div className="mt-8 space-y-3">
              {steps.map((s, i) => (
                <motion.div
                  key={s.step}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-bold', s.color)}>
                    {s.step}
                  </span>
                  <div>
                    <span className={cn('text-sm font-semibold', s.color)}>{s.label}</span>
                    <span className="ml-2 text-sm text-white/30">{s.description}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Chains */}
            <div className="mt-8 flex flex-wrap gap-2">
              {chains.map((chain) => (
                <span
                  key={chain}
                  className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs text-emerald-400/60"
                >
                  {chain}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  )
}
