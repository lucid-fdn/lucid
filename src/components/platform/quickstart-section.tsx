'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { Container } from '@/components/container'
import { CheckCircleIcon, ClipboardIcon } from '@heroicons/react/24/outline'

function CopyBlock({ code, label, step }: { code: string; label: string; step: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: step * 0.15 }}
      className="flex-1"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B84F3]/20 text-xs font-bold text-[#0B84F3]">
          {step}
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#111118]">
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code className="font-mono text-white/70">{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 rounded-md p-1.5 text-white/30 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? (
            <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
          ) : (
            <ClipboardIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </motion.div>
  )
}

export function QuickstartSection() {
  return (
    <section id="quickstart" className="bg-[#0a0a0f] py-24">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm font-semibold uppercase tracking-[3px] text-[#0B84F3] mb-4">
            Developer Quickstart
          </p>
          <h2 className="text-3xl font-bold text-white">Three steps to paid AI.</h2>
        </motion.div>

        <div className="flex flex-col gap-6 md:flex-row">
          <CopyBlock
            step={1}
            label="Install"
            code="npm install @lucid-fdn/pay"
          />
          <CopyBlock
            step={2}
            label="Integrate"
            code={`import { lucidFetch } from '@lucid-fdn/pay'

const res = await lucidFetch(
  'https://api.example.com/ai',
  { method: 'POST',
    body: JSON.stringify({ prompt: 'Hello' }) }
)`}
          />
          <CopyBlock
            step={3}
            label="Monetize"
            code={`curl -X PUT /admin/tenants/:id/payment \\
  -d '{"enabled":true, "defaultPrice":"0.01",
       "payoutAddress":"0x..."}'`}
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <a
            href="https://docs.lucid.foundation"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[#0B84F3] hover:underline"
          >
            Read the docs →
          </a>
        </motion.div>
      </Container>
    </section>
  )
}
