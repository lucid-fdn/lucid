'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'

const problems = [
  {
    keyword: 'Closed',
    description:
      'Web2 AI is fast. But your data is locked in silos, your agents can\'t talk to each other, and one vendor owns your stack.',
  },
  {
    keyword: 'Slow',
    description:
      'Web3 AI is open. But gas fees eat micro-payments, settlement takes minutes, and the developer experience is painful.',
  },
  {
    keyword: 'Fragmented',
    description:
      'Neither side talks to the other. 3 SDKs to connect 2 models. No shared memory. No fair payouts.',
  },
]

export function ProblemSection() {
  return (
    <section className="bg-[#0f0f14] py-24">
      <Container>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {problems.map((problem, i) => (
            <motion.div
              key={problem.keyword}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm"
            >
              <h3 className="text-2xl font-bold text-white">{problem.keyword}</h3>
              <p className="mt-4 text-sm leading-relaxed text-white/50">
                {problem.description}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 text-center text-2xl font-bold text-[#0B84F3] sm:text-3xl"
        >
          Lucid is both. Fast and open.
        </motion.p>
      </Container>
    </section>
  )
}
