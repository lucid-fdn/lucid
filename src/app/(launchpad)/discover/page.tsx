import type { Metadata } from 'next'
import { getLaunchedAgents } from '@/lib/db'
import { DiscoverClient } from './discover-client'

export const metadata: Metadata = {
  title: 'Discover AI Agents — Lucid Launch',
  description: 'Explore tokenized AI agents, invest in their success, and earn revenue share from real usage.',
  openGraph: {
    title: 'Discover AI Agents — Lucid Launch',
    description: 'Explore tokenized AI agents, invest in their success, and earn revenue share from real usage.',
    type: 'website',
    siteName: 'Lucid Launch',
  },
}

export default async function LaunchpadDiscoveryPage() {
  const agents = await getLaunchedAgents({ status: 'trading', limit: 20 })

  return <DiscoverClient agents={agents} />
}
