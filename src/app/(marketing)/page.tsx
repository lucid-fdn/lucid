import type { Metadata } from 'next'
import { Hero } from '@/components/marketing/lucid/components/hero'
import { HeroImage } from '@/components/marketing/lucid/components/hero-image'
import { HowItWorks } from '@/components/marketing/lucid/components/how-it-works'
import { MobileWhatsapp } from '@/components/marketing/lucid/components/mobile-whatsapp'
import { AgenticIntelligence } from '@/components/marketing/lucid/components/agentic-intelligence'
import { LogoMarquee } from '@/components/marketing/lucid/components/logo-marquee'
import { UseCases } from '@/components/marketing/lucid/components/use-cases'
import { Pricing } from '@/components/marketing/lucid/components/pricing'
import { Security } from '@/components/marketing/lucid/components/security'
import { FAQs } from '@/components/marketing/lucid/components/faqs'
import { CTA } from '@/components/marketing/lucid/components/cta'
import { DivideX } from '@/components/marketing/lucid/components/divide'

export const metadata: Metadata = {
  title: 'Lucid — The control plane for AI agents in production',
  description:
    'See every thought, tool call, and dollar your agents spend. Run them on shared, dedicated, or your own compute — one dashboard, one audit log.',
}

export default function Home() {
  return (
    <main className="dark bg-charcoal-900">
      <div
        className="relative"
        style={{
          backgroundImage: 'url(/images/hero-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black pointer-events-none" />
        <div className="relative z-10">
          <DivideX />
          <Hero />
          <DivideX />
          <HeroImage />
          <DivideX />
        </div>
      </div>
      <HowItWorks />
      <DivideX />
      <MobileWhatsapp />
      <DivideX />
      <AgenticIntelligence />
      <DivideX />
      <LogoMarquee />
      <DivideX />
      <UseCases />
      <DivideX />
      <Pricing />
      <DivideX />
      <Security />
      <DivideX />
      <FAQs />
      <DivideX />
      <CTA />
      <DivideX />
    </main>
  )
}
