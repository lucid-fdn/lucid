import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLaunchedAgentBySlug, getStakingPool, getEpochsForAgent } from '@/lib/db'
import { AgentDetailClient } from './agent-detail-client'

async function fetchJupiterPrice(tokenMint: string): Promise<number | null> {
  try {
    const headers: Record<string, string> = {}
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY
    const res = await fetch(
      `https://api.jup.ag/price/v3?ids=${tokenMint}`,
      { next: { revalidate: 30 }, signal: AbortSignal.timeout(5000), headers }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data[tokenMint]?.usdPrice ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const agent = await getLaunchedAgentBySlug(slug)
  if (!agent) return { title: 'Agent Not Found' }

  const title = `${agent.display_name} — Lucid Launch`
  const description = agent.description || `${agent.display_name} is an AI agent on Lucid Launch. Category: ${agent.category}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Lucid Launch',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const agent = await getLaunchedAgentBySlug(slug)
  if (!agent) notFound()

  const [stakingPool, epochs, livePrice] = await Promise.all([
    getStakingPool(agent.id),
    getEpochsForAgent(agent.id),
    agent.token_mint ? fetchJupiterPrice(agent.token_mint) : Promise.resolve(null),
  ])

  return (
    <AgentDetailClient
      agent={agent}
      stakingPool={stakingPool}
      epochs={epochs}
      livePrice={livePrice}
    />
  )
}
