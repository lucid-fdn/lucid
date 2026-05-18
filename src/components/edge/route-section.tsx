'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'
import { BorderBeam } from '@/ui/components/border-beam'

const providers = [
  'OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral', 'Cohere',
  'Hugging Face', 'Replicate', 'Together', 'DeepSeek', 'Groq', 'Perplexity', 'Self-hosted',
]

export function RouteSection() {
  return (
    <section id="route" className="bg-[#0a0a0f] py-24">
      <Container>
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          {/* Copy */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[3px] text-blue-400">
              Route
            </p>
            <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              One API, every model.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/50">
              TrustGate routes inference across {providers.length} providers with automatic failover,
              load balancing, and usage metering. One endpoint, one key, one bill.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {providers.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/40"
                >
                  {name}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Code */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111118]">
              <BorderBeam size={120} duration={6} colorFrom="#0B84F3" colorTo="#0B84F3" borderWidth={1} />
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="ml-2 text-xs text-white/30">bash</span>
              </div>
              <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
                <code className="font-mono">
                  <span className="text-white/40">{'# Same endpoint. Any model. Any provider.'}</span>{'\n'}
                  <span className="text-emerald-400">curl</span><span className="text-white/70"> https://api.lucid.foundation/v1/chat/completions \</span>{'\n'}
                  <span className="text-white/70">{'  '}-H </span><span className="text-amber-300">{'"Authorization: Bearer lk_..."'}</span><span className="text-white/70"> \</span>{'\n'}
                  <span className="text-white/70">{'  '}-d </span><span className="text-amber-300">{"'"}</span><span className="text-blue-300">{'{'}</span>{'\n'}
                  <span className="text-blue-300">{'    "model"'}</span><span className="text-white/70">: </span><span className="text-amber-300">{'"openai/gpt-4.1"'}</span><span className="text-white/70">,</span>{'\n'}
                  <span className="text-blue-300">{'    "messages"'}</span><span className="text-white/70">: [</span><span className="text-blue-300">{'{'}</span><span className="text-white/70">{'"role": "user", "content": "Hello"'}</span><span className="text-blue-300">{'}'}</span><span className="text-white/70">]</span>{'\n'}
                  <span className="text-blue-300">{'  }'}</span><span className="text-amber-300">{"'"}</span>{'\n\n'}
                  <span className="text-white/40">{'# Switch provider — just change the model prefix'}</span>{'\n'}
                  <span className="text-white/40">{'# "anthropic/claude-opus-4-6"'}</span>{'\n'}
                  <span className="text-white/40">{'# "google/gemini-2.0-flash"'}</span>{'\n'}
                  <span className="text-white/40">{'# "deepseek/deepseek-r1"'}</span>
                </code>
              </pre>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  )
}
