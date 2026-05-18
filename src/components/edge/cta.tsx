'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { Container } from '@/components/container'
import { ShimmerButton } from '@/ui/components/shimmer-button'
import { CheckCircleIcon, ClipboardIcon } from '@heroicons/react/24/outline'

function CopyLine({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-[#111118]">
      <pre className="overflow-x-auto px-4 py-3 text-sm">
        <code className="font-mono text-white/60">{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md p-1 text-white/20 opacity-0 transition-opacity hover:text-white/50 group-hover:opacity-100"
        aria-label="Copy"
      >
        {copied ? (
          <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
        ) : (
          <ClipboardIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}

export function EdgeCta() {
  return (
    <section className="bg-[#0a0a0f] py-24">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-lg text-center"
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Start routing in 5 minutes.
          </h2>
          <p className="mt-3 text-sm text-white/40">
            Free tier. No credit card. 10K requests/month included.
          </p>

          <div className="mt-8 space-y-3 text-left">
            <CopyLine code="npm install @lucid-fdn/pay" />
            <CopyLine code='curl https://api.lucid.foundation/v1/chat/completions \
  -H "Authorization: Bearer lk_YOUR_KEY" \
  -d &#39;{"model":"openai/gpt-4.1","messages":[{"role":"user","content":"Hello"}]}&#39;' />
          </div>

          <div className="mt-8 flex items-center justify-center gap-4">
            <ShimmerButton rounded="lg" size="lg" className="font-semibold">
              <Link href="/docs">Get API Key</Link>
            </ShimmerButton>
            <Link
              href="https://raijinlabs.gitbook.io/lucid-ai-layer"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
            >
              Read Docs
            </Link>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
