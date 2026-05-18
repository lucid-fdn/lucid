import React from 'react'
import { Container } from '@/components/container'
import LogoCloud from '@/components/logo-cloud'
import { Applications } from '@/components/Applications'
import { StarsCanvas } from '@/components/motion-primitives/stars-canvas-client'
import { HeroLoader } from '@/components/hero-loader'
import type { Metadata } from 'next'
import { WhyItMatter } from '@/components/WhyItMatter'
import { Stats } from '@/components/stats'
import NewsletterForm from '@/components/NewsletterForm'
import { ConnectorMarquee } from '@/components/marketplace/connector-marquee'
import { getAssets } from '@/lib/marketplace/marketplace-service'
import { CURATED_SECTIONS, RECOMMENDED_MODELS } from '@/lib/marketplace/curated-content'

export const metadata: Metadata = {
  title: 'Lucid Protocol — The verifiable layer under AgentOps',
  description:
    'Lucid Protocol is the verifiable coordination layer for AI agents. A passport-gated L2 with on-chain identity, payments, and proofs for autonomous agents at scale.',
}

const stats = [
  {
    id: '1',
    name: 'Data Points',
    value: '100M+',
    comment: 'Proofs you can check for every result',
    numericValue: 100,
    suffix: 'M+',
  },
  {
    id: '2',
    name: 'Nodes',
    value: '950+',
    comment: 'All your favorite AIs & Apps',
    numericValue: 850,
    suffix: '+',
  },
  {
    id: '3',
    name: 'Uptime',
    value: '99.99%',
    comment: 'Targeted for human grade AI',
    numericValue: 99.99,
    suffix: '%',
  },
]

function Hero() {
  return (
    <HeroLoader videoSrc="/videos/blackhole.webm">
      <div>
        <div className="mt-14 relative h-[calc(100vh-4rem)]">
          <StarsCanvas className="z-1" />
          <video
            autoPlay
            muted
            loop
            className="absolute left-0 w-full h-full object-cover z-0"
          >
            <source src="/videos/blackholes.webm" type="video/webm" />
          </video>
          <div className="absolute bottom-[0px] left-0 w-full h-full bg-gradient-to-b from-black/0 via-black/70 to-black/80 pointer-events-none" />

          <Container className="relative flex items-center justify-center min-h-screen z-10 py-20">
            <div className="text-center max-w-4xl mx-auto px-4">
              <p className="mb-6 text-xs uppercase tracking-[0.2em] text-white/50">
                Lucid Protocol
              </p>
              <h1 className="bg-gradient-to-b from-white to-gray-300/30 bg-clip-text text-transparent font-display text-5xl/[1.2] xl:text-[5.25rem] font-semibold tracking-tight text-balance sm:text-8xl/[1.15] md:text-7xl/[1.15] mb-8">
                The verifiable layer under AgentOps.
              </h1>
              <p className="mt-4 mx-auto max-w-2xl text-lg/6 text-white/60 text-balance sm:text-xl/7">
                Passports, payments, and proofs for autonomous agents —
                on-chain, open, and built for a world where most traffic
                isn&apos;t human. This is the network layer under the control
                plane.
              </p>
              <div className="mt-10 flex items-center justify-center gap-3">
                <a
                  href="https://raijinlabs.gitbook.io/lucid-ai-layer"
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
                >
                  Read the docs
                </a>
                <a
                  href="#network"
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  Explore the network
                </a>
              </div>
            </div>
          </Container>
          <LogoCloud />
        </div>
      </div>
    </HeroLoader>
  )
}

export default async function ProtocolPage() {
  const connectorsData = await getAssets({
    ids: CURATED_SECTIONS.topConnectors.ids,
    limit: CURATED_SECTIONS.topConnectors.limit,
  })

  return (
    <div className="overflow-hidden" id="network">
      <Hero />
      {RECOMMENDED_MODELS.length > 0 && connectorsData.assets.length > 0 && (
        <section className="bg-white dark:bg-black opacity-70">
          <ConnectorMarquee
            recommendedConnectors={RECOMMENDED_MODELS}
            topConnectors={connectorsData.assets}
          />
        </section>
      )}
      <Stats
        stats={stats}
        className="bg-white dark:bg-black"
        animate={true}
        duration={2500}
        delay={500}
      />

      <main>
        <div className="bg-linear-to-b from-black from-50% to-black pb-32">
          <WhyItMatter />
          <Applications />
        </div>
      </main>
      <NewsletterForm
        title="Get Lucid Protocol updates"
        description="Network milestones, passport rollouts, and protocol research — direct to your inbox."
      />
    </div>
  )
}
