# Platform Overview Page — Design Spec

**Goal:** A high-converting product page at `/platform` that tells the complete Lucid story — Build, Route, Monetize, Launch — using a storyteller narrative arc (Problem → Vision → Proof) targeting developers, founders, and crypto-native builders.

**Route:** `/platform` in `(marketing)/` route group

**Primary CTA:** "Start Building" → workspace signup

**Audience:** AI developers, founders/CTOs, crypto-native builders (all three served by narrative structure)

**Competitive positioning:** Lucid sits at the intersection of Web2 AI (Vercel AI, Replicate, Bedrock) and Web3 AI (Bittensor, Fetch.ai, SingularityNET) — the only platform that's both fast AND open.

---

## Section 1: Cinematic Hero

- **Background:** Dark gradient (`#0a0a0f` → `#0B1D3A`) with subtle particle/video animation (reuse `blackhole.webm` or CSS particles)
- **Badge:** "The Internet of AI" — small caps, `#0B84F3`, letter-spacing 3px
- **Headline:** `"One platform. Every AI."` — 56-72px, font-weight 800, white
- **Subhead:** "Build, route, monetize, and launch AI agents across any model, any chain, any scale." — 18px, `rgba(255,255,255,0.6)`, max-width 600px
- **Dual CTA:**
  - Primary: "Start Building" — `bg-lucid` blue, rounded-lg
  - Secondary: "Watch Demo" — ghost button, `border-white/20`
- **Stats strip:** Three metrics below CTAs, small text `rgba(255,255,255,0.4)`:
  - `850+ AI agents` · `10 chains` · `$0 gas payments`
  - Numbers animate up (counter) when section scrolls into view
- **Height:** Full viewport (`min-h-screen`), centered content

## Section 2: The Problem — Direct Confrontation

- **Layout:** Three cards in a row (responsive: stack on mobile)
- **Background:** Slightly lighter dark (`#0f0f14`)
- **Each card:**
  - Bold keyword top: **"Closed"** / **"Slow"** / **"Fragmented"** — 24px, white
  - Body text explaining the pain — 14px, `text-muted-foreground`
  - Subtle border, glassmorphism style (`bg-white/5 border-white/10 backdrop-blur`)

- **Card content:**
  1. **"Closed"** — "Web2 AI is fast. But your data is locked in silos, your agents can't talk to each other, and one vendor owns your stack."
  2. **"Slow"** — "Web3 AI is open. But gas fees eat micro-payments, settlement takes minutes, and the developer experience is painful."
  3. **"Fragmented"** — "Neither side talks to the other. 3 SDKs to connect 2 models. No shared memory. No fair payouts."

- **Punchline:** Centered below cards — **"Lucid is both. Fast and open."** — 28px, `text-lucid` blue, font-weight 700

## Section 3: The Shift — Vision Statement

- **Layout:** Full-width, centered text, generous padding (py-32)
- **Background:** Same dark, subtle radial glow behind text
- **Text:** "What if every AI could talk to every other AI — across any model, any chain — and everyone got paid fairly?" — 32-36px, white, font-weight 600, max-width 800px
- **Visual:** Subtle animated connection graphic below (CSS lines/dots connecting, or Framer Motion node animation) — decorative, not functional
- **No CTA** — this section is pure emotional momentum

## Section 4: Four Pillars — Vertical Storytelling

Each pillar is a full section (`py-24`) with alternating layout. Scroll-driven reveal via Framer Motion `whileInView`.

### 4a. Build (purple accent `#8B5CF6`)
- **Layout:** Screenshot LEFT, copy RIGHT
- **Visual:** Synapse visual builder screenshot or video (`/videos/lucidaiscreenshot.webm`)
- **Copy:**
  - Label: "BUILD" — small caps, purple
  - Headline: "From prompt to production in minutes."
  - Body: "Visual workflow builder with 500+ integrations. SDKs for JavaScript, Python, C++, and Unreal Engine 5. Deploy to Discord, Telegram, Slack, or any API."
  - Metric badge: `500+ integrations` — pill shape, purple bg/10
- **Code snippet:**
  ```typescript
  import Lucid from '@lucid-fdn/sdk'
  const agent = await Lucid.create('My Trading Agent')
  await agent.deploy({ target: 'discord' })
  ```

### 4b. Route (blue accent `#0B84F3`)
- **Layout:** Copy LEFT, diagram RIGHT (alternates)
- **Visual:** Architecture diagram — TrustGate routing across providers (styled, not raw)
- **Copy:**
  - Label: "ROUTE"
  - Headline: "One API, every model."
  - Body: "TrustGate routes inference across 13 providers — OpenAI, Anthropic, Hugging Face, self-hosted, DePIN — with automatic failover, quota enforcement, and usage metering."
  - Metric badge: `13 LLM providers`
- **Code snippet:**
  ```bash
  curl https://api.lucid.foundation/v1/chat/completions \
    -H "Authorization: Bearer lk_..." \
    -d '{"model": "openai/gpt-4.1", "messages": [...]}'
  ```

### 4c. Monetize (green accent `#10B981`)
- **Layout:** Visual LEFT, copy RIGHT
- **Visual:** Payment flow diagram — Request → 402 → Pay USDC → Access granted (styled arrows/nodes)
- **Copy:**
  - Label: "MONETIZE"
  - Headline: "Your AI pays for itself."
  - Body: "x402 turns any API endpoint into a paid service with one config. Gasless payments on 10 chains, session credit for repeat callers, automatic revenue splits. Zero payment code required."
  - Metric badge: `8 facilitators · 10 chains`
- **Code snippet:**
  ```json
  {
    "enabled": true,
    "defaultPrice": "0.01",
    "payoutAddress": "0x...",
    "acceptedChains": ["base", "solana", "ethereum"]
  }
  ```

### 4d. Launch (amber accent `#F59E0B`)
- **Layout:** Copy LEFT, screenshot RIGHT (alternates)
- **Visual:** Launchpad discover page screenshot (real or high-fidelity mockup)
- **Copy:**
  - Label: "LAUNCH"
  - Headline: "Tokenize your AI agent."
  - Body: "Create, deploy, and trade AI agents on Solana. Users pay to use them. Investors buy tokens and earn revenue share. Built-in staking, epoch-based distributions, and Jupiter swap integration."
  - Metric badge: `Solana-native`
- **Link:** "Explore Lucid Launch →" — links to `/discover`

### Pillar design details:
- Each section has `scroll-margin-top` for potential tab navigation
- Screenshots/visuals have subtle `rounded-xl border border-white/10 shadow-2xl` treatment
- Code snippets use `font-mono` (JetBrains Mono), dark card bg, copy button
- Metric badges are pill-shaped with accent color at 10% opacity bg
- Framer Motion: `initial={{ opacity: 0, y: 40 }}` → `whileInView={{ opacity: 1, y: 0 }}`

## Section 5: Live Proof — Stats Dashboard

- **Layout:** Dark section (`bg-black`), centered grid of 4-6 animated counters
- **Counters (examples):**
  - Agents Deployed: `850+`
  - Payments Processed: `12,400+`
  - Chains Connected: `10`
  - Models Available: `100+`
  - Uptime: `99.9%`
  - Facilitators: `8`
- **Animation:** Numbers count up from 0 when scrolled into view (use `useInView` + counter animation)
- **Data source:** Static for now, can wire to `/api/launchpad/stats` later
- **Visual:** Subtle grid lines or dot pattern background

## Section 6: Developer Quickstart

- **Layout:** Horizontal 3-step flow (stack on mobile)
- **Steps:**
  1. **Install** — `npm install @lucid-fdn/pay`
  2. **Integrate** —
     ```typescript
     import { lucidFetch } from '@lucid-fdn/pay'
     const res = await lucidFetch('https://api.example.com/ai', {
       method: 'POST',
       body: JSON.stringify({ prompt: 'Hello' }),
     })
     ```
  3. **Monetize** — `curl -X PUT .../admin/tenants/:id/payment -d '{"enabled":true,...}'`
- **Each step:** Number badge, title, code block with copy button
- **Below:** "Read the docs →" link to docs site

## Section 7: Social Proof

- **Logo strip:** Scrolling or static row of integration/provider logos
  - OpenAI, Anthropic, Google, Hugging Face, Solana, Base, Ethereum, Arbitrum, etc.
  - Use existing logos from `/public/logos/` or `/public/logo-cluster/`
- **Enterprise badges:** Row of trust signals
  - `99.9% SLA` · `SSO/SAML` · `Audit Trails` · `Multi-region`
  - Pill-shaped, subtle border, small text
- **Optional testimonial:** Single quote card if available (can add later)

## Section 8: Final CTA

- **Layout:** Full-width dark section, centered, generous padding (py-32)
- **Headline:** "Start building the Internet of AI." — 36px, white, font-weight 700
- **Subhead:** "Free to start. Scale when you're ready." — 16px, muted
- **Dual CTA:**
  - Primary: "Start Building" → `/signup` or workspace creation
  - Secondary: "Talk to Sales" → `/contact`
- **Below CTAs:** Small links: `Docs` · `Discord` · `GitHub`

---

## Technical Details

### File Structure
- `src/app/(marketing)/platform/page.tsx` — Server component, metadata
- `src/components/platform/` — Section components:
  - `hero.tsx`
  - `problem-section.tsx`
  - `vision-section.tsx`
  - `pillar-section.tsx` (reusable, takes pillar config as props)
  - `stats-section.tsx`
  - `quickstart-section.tsx`
  - `social-proof-section.tsx`
  - `final-cta-section.tsx`

### Animation
- Framer Motion `whileInView` for scroll reveals
- Counter animation for stats (custom hook or `framer-motion` `animate`)
- Subtle parallax on hero background (optional)

### SEO
- Dynamic metadata: title "Lucid — The Internet of AI", description from subhead
- OpenGraph image (can reuse existing or create new)
- Structured data (Organization, SoftwareApplication)

### Performance
- Video/images lazy-loaded below fold
- Code snippets rendered server-side (no client JS for syntax highlighting — use Shiki)
- Sections use `Suspense` boundaries where needed

### Mobile
- All sections stack vertically
- Hero: single column, smaller text
- Problem cards: full-width stack
- Pillar sections: visual above copy (no alternating on mobile)
- Quickstart: vertical steps
- Stats: 2x3 grid instead of single row

### Navigation
- Add "Platform" link to main navbar under existing "Lucid AI" in the solutions dropdown
- Consider adding to footer navigation

### Design Tokens (from existing tailwind config)
- Font: Inter (body), JetBrains Mono (code)
- Colors: `lucid` (#0B84F3), purple (#8B5CF6), green (#10B981), amber (#F59E0B)
- Spacing: 8px grid
- Shadows: Apple-style (existing config)
- Motion: 200ms reveal, `cubic-bezier(0.2, 0.8, 0.2, 1)` easing
