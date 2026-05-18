'use client'

import React from 'react'
import { Container } from '@/components/container'
import { Subheading, Heading, Topheading } from '@/components/text-marketing'
import { BentoCard } from '@/components/bento-card'
import { AnimatedBeamDemo } from '@/components/animated-beam-demo'
import { PromptInputDemo } from '@/components/prompt-input-demo'
import { AuroraText } from '@/ui/components/aurora-text'

export const Applications = React.memo(() => {
  return (
    <div id="applications" className="rounded-4xl pb-32">
      <Container>
        <Topheading dark className="text-center">
          THE BUILDER FOR THE LUCID LAYER
        </Topheading>
        <Heading as="h3" dark className="mt-2 max-w-3xl font-semibold text-center mx-auto">
          Meet <AuroraText>Lucid AI.</AuroraText>
        </Heading>
        <Subheading dark className="mt-4 max-w-4xl text-center mx-auto text-muted-foreground">
          The door to the Internet of AI. Turning your ideas into interoperable Agents & Apps in one prompt. Powered by Lucid Layer.
        </Subheading>

        {/* Cards with pictures */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-6">
          <BentoCard
            dark
            eyebrow="Start with a prompt"
            title="Generate AI Agents/Apps using Lucid AI"
            description="Type what you want. Publish instantly everywhere as an Agent or App."
            graphic={<PromptInputDemo />}
            fade={['top']}
            className="max-lg:rounded-t-4xl lg:col-span-3 lg:rounded-tl-4xl"
          />
          <BentoCard
            dark
            eyebrow="Compose with flows"
            title="500+ Web2/3 integrations. Infinite agents."
            description="One canvas for Hyperliquid, Polymarket, DEX, wallets, DePIN + Slack, Notion60, Stripe…"
            graphic={<AnimatedBeamDemo />}
            fade={['top']}
            className="lg:col-span-3 lg:rounded-tr-4xl"
          />
        </div>

        {/* Cards without pictures
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-6">
          <BentoCard
            dark
            eyebrow="AI economy"
            title="Earn automatically"
            description="Usage is metered; iGas splits payouts to models, data, tools, compute, and builders."
            className="lg:col-span-2 lg:rounded-bl-4xl"
          />
          <BentoCard
            dark
            eyebrow="Robotics & Smart Home"
            title="One brain for every device"
            description="Lights, bots, cars, and appliances act as a team. Tasks are verifiable; preferences persist across brands."
            className="lg:col-span-2"
          />
          <BentoCard
            dark
            eyebrow="Enterprise Grade"
            title="Built for teams"
            description="SSO/SAML, org → project → env, audit log, policy packs, region pinning, on-prem mode, templates & versioning."
            className="max-lg:rounded-b-4xl lg:col-span-2 lg:rounded-br-4xl"
          />
        </div> */}
      </Container>
    </div>
  )
})

Applications.displayName = 'Applications'
