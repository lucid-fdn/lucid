# Platform Overview Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-converting `/platform` product page with storyteller narrative arc (Problem → Vision → Proof) showcasing Lucid's full stack: Build, Route, Monetize, Launch.

**Architecture:** 8 section components composed in a single page route. Each section is a `'use client'` component using `motion/react` for scroll-driven animations. Follows existing `(marketing)/lucid-ai` page patterns exactly.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, `motion/react` (NOT framer-motion), `@heroicons/react`, shadcn/ui components, existing `Container`/`Heading`/`Subheading` system.

**Spec:** `docs/superpowers/specs/2026-03-10-platform-overview-page-design.md`

---

## File Structure

| File | Purpose |
|------|---------|
| `src/app/(marketing)/platform/page.tsx` | Page route — metadata + section composition |
| `src/components/platform/hero.tsx` | Cinematic hero with dual CTA + stats strip |
| `src/components/platform/problem-section.tsx` | Three-card problem confrontation |
| `src/components/platform/vision-section.tsx` | Full-width vision statement |
| `src/components/platform/pillar-section.tsx` | Reusable pillar component (Build/Route/Monetize/Launch) |
| `src/components/platform/stats-section.tsx` | Animated counter dashboard |
| `src/components/platform/quickstart-section.tsx` | 3-step developer quickstart |
| `src/components/platform/social-proof-section.tsx` | Logo strip + enterprise badges |
| `src/components/platform/final-cta-section.tsx` | Closing CTA with dual buttons |

---

## Chunk 1: Page Shell + Hero + Problem

### Task 1: Create page route and hero section

**Files:**
- Create: `src/app/(marketing)/platform/page.tsx`
- Create: `src/components/platform/hero.tsx`

- [ ] **Step 1: Create the hero component**

Create `src/components/platform/hero.tsx`:

```tsx
'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import { Container } from '@/components/container'

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
    >
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        {value}{suffix}
      </motion.span>
    </motion.span>
  )
}

export function PlatformHero() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0a0a0f] via-[#0B1D3A] to-[#0a0a0f]">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,132,243,0.12)_0%,transparent_70%)]" />

      <Container className="relative z-10 py-32">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-sm font-semibold uppercase tracking-[3px] text-[#0B84F3] mb-6"
          >
            The Internet of AI
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]"
          >
            One platform.
            <br />
            Every AI.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg text-white/60 max-w-xl mx-auto leading-relaxed"
          >
            Build, route, monetize, and launch AI agents across any model, any chain, any scale.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex items-center justify-center gap-4"
          >
            <Link
              href="/signup"
              className="rounded-lg bg-[#0B84F3] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B84F3]/90 transition-colors"
            >
              Start Building
            </Link>
            <Link
              href="#quickstart"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
            >
              Watch Demo
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-12 flex items-center justify-center gap-8 text-sm text-white/40"
          >
            <span><AnimatedCounter value={850} suffix="+" /> AI agents</span>
            <span className="w-px h-4 bg-white/20" />
            <span><AnimatedCounter value={10} /> chains</span>
            <span className="w-px h-4 bg-white/20" />
            <span>$0 gas payments</span>
          </motion.div>
        </div>
      </Container>
    </div>
  )
}
```

- [ ] **Step 2: Create the page route**

Create `src/app/(marketing)/platform/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { PlatformHero } from '@/components/platform/hero'

export const metadata: Metadata = {
  title: 'Lucid — The Internet of AI',
  description:
    'Build, route, monetize, and launch AI agents across any model, any chain, any scale. The complete AI infrastructure stack.',
}

export default function PlatformPage() {
  return (
    <div className="overflow-hidden">
      <PlatformHero />
    </div>
  )
}
```

- [ ] **Step 3: Verify hero renders**

Run: `cd C:\LucidMerged && npm run dev -- --turbopack`
Open: `http://localhost:3000/platform`
Expected: Full-screen dark hero with "One platform. Every AI." headline, dual CTAs, stats strip. Marketing navbar and footer auto-applied.

- [ ] **Step 4: Commit**

```bash
cd C:\LucidMerged
git add src/app/\(marketing\)/platform/page.tsx src/components/platform/hero.tsx
git commit -m "feat: add /platform page with cinematic hero section"
```

### Task 2: Problem section

**Files:**
- Create: `src/components/platform/problem-section.tsx`
- Modify: `src/app/(marketing)/platform/page.tsx`

- [ ] **Step 5: Create problem section component**

Create `src/components/platform/problem-section.tsx`:

```tsx
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
```

- [ ] **Step 6: Add problem section to page**

In `src/app/(marketing)/platform/page.tsx`, add import and render:

```tsx
import type { Metadata } from 'next'
import { PlatformHero } from '@/components/platform/hero'
import { ProblemSection } from '@/components/platform/problem-section'

export const metadata: Metadata = {
  title: 'Lucid — The Internet of AI',
  description:
    'Build, route, monetize, and launch AI agents across any model, any chain, any scale. The complete AI infrastructure stack.',
}

export default function PlatformPage() {
  return (
    <div className="overflow-hidden">
      <PlatformHero />
      <ProblemSection />
    </div>
  )
}
```

- [ ] **Step 7: Verify problem section renders**

Open: `http://localhost:3000/platform`
Expected: Below hero, three glassmorphism cards ("Closed" / "Slow" / "Fragmented"), followed by "Lucid is both. Fast and open." in blue. Cards animate in on scroll.

- [ ] **Step 8: Commit**

```bash
cd C:\LucidMerged
git add src/components/platform/problem-section.tsx src/app/\(marketing\)/platform/page.tsx
git commit -m "feat: add problem confrontation section to platform page"
```

---

## Chunk 2: Vision + Pillar Sections

### Task 3: Vision section

**Files:**
- Create: `src/components/platform/vision-section.tsx`
- Modify: `src/app/(marketing)/platform/page.tsx`

- [ ] **Step 9: Create vision section**

Create `src/components/platform/vision-section.tsx`:

```tsx
'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'

export function VisionSection() {
  return (
    <section className="relative bg-[#0a0a0f] py-32">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_center,rgba(11,132,243,0.06)_0%,transparent_70%)]" />

      <Container className="relative z-10">
        <motion.blockquote
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-3xl text-center text-3xl font-semibold leading-snug text-white sm:text-4xl"
        >
          What if every AI could talk to every other AI — across any model, any chain — and everyone got paid fairly?
        </motion.blockquote>
      </Container>
    </section>
  )
}
```

- [ ] **Step 10: Add to page and verify**

Add import `VisionSection` to page.tsx, render after `ProblemSection`.

Open: `http://localhost:3000/platform`
Expected: Full-width dark section with centered vision quote, subtle glow.

- [ ] **Step 11: Commit**

```bash
cd C:\LucidMerged
git add src/components/platform/vision-section.tsx src/app/\(marketing\)/platform/page.tsx
git commit -m "feat: add vision statement section to platform page"
```

### Task 4: Reusable pillar section component

**Files:**
- Create: `src/components/platform/pillar-section.tsx`

- [ ] **Step 12: Create the reusable pillar component**

Create `src/components/platform/pillar-section.tsx`:

```tsx
'use client'

import { motion } from 'motion/react'
import { Container } from '@/components/container'
import { cn } from '@/ui/lib/utils'

export interface PillarConfig {
  label: string
  headline: string
  body: string
  metric: string
  accentColor: string // tailwind color class e.g. 'text-purple-500'
  accentBg: string // e.g. 'bg-purple-500/10'
  accentBorder: string // e.g. 'border-purple-500/30'
  codeSnippet: string
  codeLang?: string
  visual?: React.ReactNode
  link?: { text: string; href: string }
  reverse?: boolean // flip layout
}

export function PillarSection({ pillar }: { pillar: PillarConfig }) {
  const contentOrder = pillar.reverse ? 'md:order-2' : 'md:order-1'
  const visualOrder = pillar.reverse ? 'md:order-1' : 'md:order-2'

  return (
    <section className="bg-[#0a0a0f] py-24">
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
                <a href={pillar.link.href} className={cn('text-sm font-medium hover:underline', pillar.accentColor)}>
                  {pillar.link.text}
                </a>
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
```

- [ ] **Step 13: Commit pillar component**

```bash
cd C:\LucidMerged
git add src/components/platform/pillar-section.tsx
git commit -m "feat: add reusable pillar section component for platform page"
```

### Task 5: Wire up four pillars on the page

**Files:**
- Modify: `src/app/(marketing)/platform/page.tsx`

- [ ] **Step 14: Add all four pillar configs to page**

Update `src/app/(marketing)/platform/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { PlatformHero } from '@/components/platform/hero'
import { ProblemSection } from '@/components/platform/problem-section'
import { VisionSection } from '@/components/platform/vision-section'
import { PillarSection, type PillarConfig } from '@/components/platform/pillar-section'

export const metadata: Metadata = {
  title: 'Lucid — The Internet of AI',
  description:
    'Build, route, monetize, and launch AI agents across any model, any chain, any scale. The complete AI infrastructure stack.',
}

const pillars: PillarConfig[] = [
  {
    label: 'Build',
    headline: 'From prompt to production in minutes.',
    body: 'Visual workflow builder with 500+ integrations. SDKs for JavaScript, Python, C++, and Unreal Engine 5. Deploy to Discord, Telegram, Slack, or any API.',
    metric: '500+ integrations',
    accentColor: 'text-purple-400',
    accentBg: 'bg-purple-500/10',
    accentBorder: 'border-purple-500/30',
    codeSnippet: `import Lucid from '@lucid-fdn/sdk'

const agent = await Lucid.create('My Trading Agent')
await agent.deploy({ target: 'discord' })`,
    codeLang: 'typescript',
    reverse: false,
  },
  {
    label: 'Route',
    headline: 'One API, every model.',
    body: 'TrustGate routes inference across 13 providers — OpenAI, Anthropic, Hugging Face, self-hosted, DePIN — with automatic failover, quota enforcement, and usage metering.',
    metric: '13 LLM providers',
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    codeSnippet: `curl https://api.lucid.foundation/v1/chat/completions \\
  -H "Authorization: Bearer lk_..." \\
  -d '{
    "model": "openai/gpt-4.1",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
    codeLang: 'bash',
    reverse: true,
  },
  {
    label: 'Monetize',
    headline: 'Your AI pays for itself.',
    body: 'x402 turns any API endpoint into a paid service with one config. Gasless payments on 10 chains, session credit for repeat callers, automatic revenue splits. Zero payment code required.',
    metric: '8 facilitators · 10 chains',
    accentColor: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/30',
    codeSnippet: `{
  "enabled": true,
  "defaultPrice": "0.01",
  "payoutAddress": "0x...",
  "acceptedChains": ["base", "solana", "ethereum"],
  "payStreamEnabled": true
}`,
    codeLang: 'json',
    reverse: false,
  },
  {
    label: 'Launch',
    headline: 'Tokenize your AI agent.',
    body: 'Create, deploy, and trade AI agents on Solana. Users pay to use them. Investors buy tokens and earn revenue share. Built-in staking, epoch-based distributions, and Jupiter swap integration.',
    metric: 'Solana-native',
    accentColor: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/30',
    codeSnippet: `// Launch an AI agent token in 3 lines
const agent = await launchpad.create({
  name: 'AlphaTrader',
  category: 'trading',
  initialSupply: 1_000_000,
})

console.log(\`Token: \${agent.mintAddress}\`)`,
    codeLang: 'typescript',
    reverse: true,
    link: { text: 'Explore Lucid Launch →', href: '/discover' },
  },
]

export default function PlatformPage() {
  return (
    <div className="overflow-hidden">
      <PlatformHero />
      <ProblemSection />
      <VisionSection />
      {pillars.map((pillar) => (
        <PillarSection key={pillar.label} pillar={pillar} />
      ))}
    </div>
  )
}
```

- [ ] **Step 15: Verify all pillars render**

Open: `http://localhost:3000/platform`
Expected: After vision, four alternating sections — Build (purple), Route (blue), Monetize (green), Launch (amber). Each has copy on one side, code snippet on the other, with metric badges and scroll animations.

- [ ] **Step 16: Commit**

```bash
cd C:\LucidMerged
git add src/app/\(marketing\)/platform/page.tsx
git commit -m "feat: add four product pillars (Build/Route/Monetize/Launch) to platform page"
```

---

## Chunk 3: Stats + Quickstart + Social Proof + Final CTA

### Task 6: Stats dashboard section

**Files:**
- Create: `src/components/platform/stats-section.tsx`

- [ ] **Step 17: Create stats section with animated counters**

Create `src/components/platform/stats-section.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'
import { Container } from '@/components/container'

function Counter({ end, suffix = '', label }: { end: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let current = 0
    const step = Math.max(1, Math.floor(end / 40))
    const interval = setInterval(() => {
      current += step
      if (current >= end) {
        setCount(end)
        clearInterval(interval)
      } else {
        setCount(current)
      }
    }, 30)
    return () => clearInterval(interval)
  }, [isInView, end])

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl font-bold text-white sm:text-5xl">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="mt-2 text-sm text-white/40">{label}</div>
    </div>
  )
}

const stats = [
  { end: 850, suffix: '+', label: 'Agents Deployed' },
  { end: 12400, suffix: '+', label: 'Payments Processed' },
  { end: 10, suffix: '', label: 'Chains Connected' },
  { end: 8, suffix: '', label: 'Facilitators Active' },
  { end: 100, suffix: '+', label: 'Models Available' },
  { end: 99, suffix: '.9%', label: 'Uptime' },
]

export function StatsSection() {
  return (
    <section className="bg-black py-24">
      <Container>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 gap-12 sm:grid-cols-3 lg:grid-cols-6"
        >
          {stats.map((stat) => (
            <Counter key={stat.label} {...stat} />
          ))}
        </motion.div>
      </Container>
    </section>
  )
}
```

- [ ] **Step 18: Commit**

```bash
cd C:\LucidMerged
git add src/components/platform/stats-section.tsx
git commit -m "feat: add animated stats dashboard section to platform page"
```

### Task 7: Developer quickstart section

**Files:**
- Create: `src/components/platform/quickstart-section.tsx`

- [ ] **Step 19: Create quickstart section**

Create `src/components/platform/quickstart-section.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { Container } from '@/components/container'
import { CheckCircleIcon, ClipboardIcon } from '@heroicons/react/24/outline'

function CopyBlock({ code, label, step }: { code: string; label: string; step: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
            className="text-sm font-medium text-[#0B84F3] hover:underline"
          >
            Read the docs →
          </a>
        </motion.div>
      </Container>
    </section>
  )
}
```

- [ ] **Step 20: Commit**

```bash
cd C:\LucidMerged
git add src/components/platform/quickstart-section.tsx
git commit -m "feat: add developer quickstart section to platform page"
```

### Task 8: Social proof section

**Files:**
- Create: `src/components/platform/social-proof-section.tsx`

- [ ] **Step 21: Create social proof section**

Create `src/components/platform/social-proof-section.tsx`:

```tsx
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
  'SOC 2',
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

        {/* Provider logos as text (can replace with images later) */}
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
```

- [ ] **Step 22: Commit**

```bash
cd C:\LucidMerged
git add src/components/platform/social-proof-section.tsx
git commit -m "feat: add social proof section to platform page"
```

### Task 9: Final CTA section

**Files:**
- Create: `src/components/platform/final-cta-section.tsx`

- [ ] **Step 23: Create final CTA section**

Create `src/components/platform/final-cta-section.tsx`:

```tsx
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
            <a href="https://docs.lucid.foundation" className="hover:text-white/50 transition-colors">Docs</a>
            <a href="https://discord.gg/lucid" className="hover:text-white/50 transition-colors">Discord</a>
            <a href="https://github.com/raijinlabs" className="hover:text-white/50 transition-colors">GitHub</a>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
```

- [ ] **Step 24: Commit**

```bash
cd C:\LucidMerged
git add src/components/platform/final-cta-section.tsx
git commit -m "feat: add final CTA section to platform page"
```

### Task 10: Compose full page

**Files:**
- Modify: `src/app/(marketing)/platform/page.tsx`

- [ ] **Step 25: Wire all sections into the page**

Final `src/app/(marketing)/platform/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { PlatformHero } from '@/components/platform/hero'
import { ProblemSection } from '@/components/platform/problem-section'
import { VisionSection } from '@/components/platform/vision-section'
import { PillarSection, type PillarConfig } from '@/components/platform/pillar-section'
import { StatsSection } from '@/components/platform/stats-section'
import { QuickstartSection } from '@/components/platform/quickstart-section'
import { SocialProofSection } from '@/components/platform/social-proof-section'
import { FinalCtaSection } from '@/components/platform/final-cta-section'

export const metadata: Metadata = {
  title: 'Lucid — The Internet of AI',
  description:
    'Build, route, monetize, and launch AI agents across any model, any chain, any scale. The complete AI infrastructure stack.',
  openGraph: {
    title: 'Lucid — The Internet of AI',
    description: 'One platform. Every AI. Build, route, monetize, and launch AI agents.',
    type: 'website',
  },
}

const pillars: PillarConfig[] = [
  {
    label: 'Build',
    headline: 'From prompt to production in minutes.',
    body: 'Visual workflow builder with 500+ integrations. SDKs for JavaScript, Python, C++, and Unreal Engine 5. Deploy to Discord, Telegram, Slack, or any API.',
    metric: '500+ integrations',
    accentColor: 'text-purple-400',
    accentBg: 'bg-purple-500/10',
    accentBorder: 'border-purple-500/30',
    codeSnippet: `import Lucid from '@lucid-fdn/sdk'

const agent = await Lucid.create('My Trading Agent')
await agent.deploy({ target: 'discord' })`,
    codeLang: 'typescript',
    reverse: false,
  },
  {
    label: 'Route',
    headline: 'One API, every model.',
    body: 'TrustGate routes inference across 13 providers — OpenAI, Anthropic, Hugging Face, self-hosted, DePIN — with automatic failover, quota enforcement, and usage metering.',
    metric: '13 LLM providers',
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    codeSnippet: `curl https://api.lucid.foundation/v1/chat/completions \\
  -H "Authorization: Bearer lk_..." \\
  -d '{
    "model": "openai/gpt-4.1",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
    codeLang: 'bash',
    reverse: true,
  },
  {
    label: 'Monetize',
    headline: 'Your AI pays for itself.',
    body: 'x402 turns any API endpoint into a paid service with one config. Gasless payments on 10 chains, session credit for repeat callers, automatic revenue splits. Zero payment code required.',
    metric: '8 facilitators · 10 chains',
    accentColor: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/30',
    codeSnippet: `{
  "enabled": true,
  "defaultPrice": "0.01",
  "payoutAddress": "0x...",
  "acceptedChains": ["base", "solana", "ethereum"],
  "payStreamEnabled": true
}`,
    codeLang: 'json',
    reverse: false,
  },
  {
    label: 'Launch',
    headline: 'Tokenize your AI agent.',
    body: 'Create, deploy, and trade AI agents on Solana. Users pay to use them. Investors buy tokens and earn revenue share. Built-in staking, epoch-based distributions, and Jupiter swap integration.',
    metric: 'Solana-native',
    accentColor: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/30',
    codeSnippet: `// Launch an AI agent token in 3 lines
const agent = await launchpad.create({
  name: 'AlphaTrader',
  category: 'trading',
  initialSupply: 1_000_000,
})

console.log(\`Token: \${agent.mintAddress}\`)`,
    codeLang: 'typescript',
    reverse: true,
    link: { text: 'Explore Lucid Launch →', href: '/discover' },
  },
]

export default function PlatformPage() {
  return (
    <div className="overflow-hidden">
      <PlatformHero />
      <ProblemSection />
      <VisionSection />
      {pillars.map((pillar) => (
        <PillarSection key={pillar.label} pillar={pillar} />
      ))}
      <StatsSection />
      <QuickstartSection />
      <SocialProofSection />
      <FinalCtaSection />
    </div>
  )
}
```

- [ ] **Step 26: Full page visual verification**

Open: `http://localhost:3000/platform`
Scroll through all 8 sections. Verify:
- Hero: cinematic gradient, dual CTA, stats strip
- Problem: three cards + "Lucid is both" punchline
- Vision: centered quote with glow
- Pillars: alternating layouts, accent colors, code snippets
- Stats: animated counters
- Quickstart: 3-step flow with copy buttons
- Social proof: providers + enterprise badges
- Final CTA: dual buttons + footer links

- [ ] **Step 27: Commit full page composition**

```bash
cd C:\LucidMerged
git add src/app/\(marketing\)/platform/page.tsx src/components/platform/stats-section.tsx src/components/platform/quickstart-section.tsx src/components/platform/social-proof-section.tsx src/components/platform/final-cta-section.tsx
git commit -m "feat: complete platform overview page — all 8 sections wired"
```

---

## Summary

| Task | Section | Files |
|------|---------|-------|
| 1 | Hero | `hero.tsx`, `page.tsx` |
| 2 | Problem | `problem-section.tsx` |
| 3 | Vision | `vision-section.tsx` |
| 4-5 | Four Pillars | `pillar-section.tsx`, `page.tsx` |
| 6 | Stats | `stats-section.tsx` |
| 7 | Quickstart | `quickstart-section.tsx` |
| 8 | Social Proof | `social-proof-section.tsx` |
| 9 | Final CTA | `final-cta-section.tsx` |
| 10 | Composition | `page.tsx` (final wiring) |
