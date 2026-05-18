/**
 * Launchpad Seed Data Endpoint
 *
 * POST /api/launchpad/seed?secret=<ADMIN_SECRET>
 *
 * Creates realistic test agents so marketplace pages show actual data.
 * Fetches real org/project/env IDs to satisfy FK constraints.
 */

import { NextResponse } from 'next/server'
import { createLaunchedAgent, updateLaunchedAgent } from '@/lib/db/launchpad'
import { supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

const WALLETS = [
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  '9WzDXwBbmPELPsW5wk6rqJ7a2GmhC3K8YZrVTZPcLxzN',
  '3Kz8rMQ6Y7xL9v4KmJaTgz4ZbfPXmhAe8m5KN7pDvYcR',
  'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
  '2aW7X9T4bgRPKsL3vD6gMqfhJYzFrp7N8ZKeHsEcnduY',
  'CpMah9kU7TdLKiGRdYPe7Z3N8jmQF5h2vXJaBxW4SqDz',
  'FvN8e6YkqBwR3mUhT2JzHxCP4sLGjA5Di9Wc7K6XrEpQ',
]

const AGENTS = [
  {
    slug: 'alpha-quant',
    display_name: 'Alpha Quant',
    description: 'High-frequency quantitative trading agent powered by on-chain signal analysis. Scans 200+ DeFi pools across Solana and EVM chains in real-time, identifying arbitrage opportunities and momentum shifts.',
    category: 'trading' as const,
    tags: ['quantitative', 'defi', 'arbitrage', 'solana'],
    price_per_request: 0.05,
    token_supply: 1_000_000_000,
    updates: { status: 'trading', launched_at: daysAgo(45), total_requests: 184320, total_revenue_usdc: 9216.0, holder_count: 1247, total_staked: 412000000, token_mint: 'AQUANTx7k2CW87d97TXJSDpbD5jBkheTqA83TZRuJos' },
  },
  {
    slug: 'neural-researcher',
    display_name: 'Neural Researcher',
    description: 'Deep research agent that synthesizes academic papers, protocol docs, and governance proposals into actionable intelligence. Specializes in DeSci, tokenomics, and protocol risk assessment.',
    category: 'research' as const,
    tags: ['research', 'academic', 'governance', 'desci'],
    price_per_request: 0.03,
    token_supply: 500_000_000,
    updates: { status: 'trading', launched_at: daysAgo(30), total_requests: 42150, total_revenue_usdc: 1264.5, holder_count: 389, total_staked: 95000000, token_mint: 'NRSCHx4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJg' },
  },
  {
    slug: 'artisan-ai',
    display_name: 'Artisan AI',
    description: 'Creative agent generating on-brand visual concepts, marketing copy, and social campaigns. Trained on design systems from top Web3 projects. Outputs Figma-ready assets and brand guidelines.',
    category: 'creative' as const,
    tags: ['creative', 'design', 'marketing', 'branding'],
    price_per_request: 0.02,
    token_supply: 750_000_000,
    updates: { status: 'trading', launched_at: daysAgo(60), total_requests: 67890, total_revenue_usdc: 1357.8, holder_count: 2103, total_staked: 180000000, token_mint: 'ARTSNx9WzDXwBbmPELPsW5wk6rqJ7a2GmhC3K8YZrVT' },
  },
  {
    slug: 'defi-oracle',
    display_name: 'DeFi Oracle',
    description: 'Autonomous DeFi intelligence agent monitoring yield farming, liquidity pool health, and smart contract risk scores. Real-time alerts on IL thresholds, whale movements, and TVL changes.',
    category: 'defi' as const,
    tags: ['defi', 'yield', 'liquidity', 'risk', 'oracle'],
    price_per_request: 0.04,
    token_supply: 1_000_000_000,
    updates: { status: 'trading', launched_at: daysAgo(21), total_requests: 95400, total_revenue_usdc: 3816.0, holder_count: 876, total_staked: 625000000, token_mint: 'DFORCx3Kz8rMQ6Y7xL9v4KmJaTgz4ZbfPXmhAe8m5KN' },
  },
  {
    slug: 'social-pulse',
    display_name: 'Social Pulse',
    description: 'Social intelligence agent tracking sentiment across Crypto Twitter, Discord, and Farcaster. Detects narrative shifts, influencer alignment, and community health. Daily sentiment reports.',
    category: 'social' as const,
    tags: ['social', 'sentiment', 'twitter', 'farcaster'],
    price_per_request: 0.015,
    token_supply: 500_000_000,
    updates: { status: 'trading', launched_at: daysAgo(14), total_requests: 28700, total_revenue_usdc: 430.5, holder_count: 542, total_staked: 78000000, token_mint: 'SPLSExHN7cABqLq46Es1jh92dQQisAq662SmxELLLsH' },
  },
  {
    slug: 'data-miner-pro',
    display_name: 'Data Miner Pro',
    description: 'On-chain data extraction and transformation. Indexes historical transactions, token transfers, and NFT metadata across Solana and EVM. Outputs CSV, JSON, or direct DB ingestion.',
    category: 'data' as const,
    tags: ['data', 'indexing', 'on-chain', 'analytics'],
    price_per_request: 0.01,
    token_supply: 250_000_000,
    updates: { status: 'trading', launched_at: daysAgo(7), total_requests: 3420, total_revenue_usdc: 34.2, holder_count: 87, total_staked: 12000000, token_mint: 'DMPROx2aW7X9T4bgRPKsL3vD6gMqfhJYzFrp7N8ZKeH' },
  },
  {
    slug: 'crypto-sentinel',
    display_name: 'Crypto Sentinel',
    description: 'Security-focused agent monitoring wallet activity, smart contract exploits, and bridge vulnerabilities. Instant alerts for rug-pull patterns and flash loan attacks. Trusted by 500+ DAOs.',
    category: 'trading' as const,
    tags: ['security', 'monitoring', 'exploits', 'alerts'],
    price_per_request: 0.035,
    token_supply: 1_000_000_000,
    updates: { status: 'trading', launched_at: daysAgo(90), total_requests: 312500, total_revenue_usdc: 10937.5, holder_count: 1893, total_staked: 540000000, token_mint: 'CSNTLxFvN8e6YkqBwR3mUhT2JzHxCP4sLGjA5Di9Wc7' },
  },
]

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString()
}

export async function POST(req: Request) {
  try {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // 1. Find a real org + project + env
  const { data: org, error: orgErr } = await supabase.from('organizations').select('id').limit(1).single()
  if (!org) return NextResponse.json({ error: `No organizations found in DB: ${orgErr?.message}` }, { status: 400 })

  const { data: project } = await supabase.from('projects').select('id').eq('org_id', org.id).limit(1).single()
  if (!project) return NextResponse.json({ error: 'No projects found for org' }, { status: 400 })

  const { data: env } = await supabase.from('environments').select('id').eq('project_id', project.id).limit(1).single()
  if (!env) return NextResponse.json({ error: 'No environments found for project' }, { status: 400 })

  const results: { slug: string; id: string | null; error?: string }[] = []

  for (let i = 0; i < AGENTS.length; i++) {
    const a = AGENTS[i]
    const wallet = WALLETS[i]

    try {
      // 2. Create a minimal ai_assistant for FK
      const { data: assistant, error: aErr } = await supabase
        .from('ai_assistants')
        .insert({
          org_id: org.id,
          project_id: project.id,
          env_id: env.id,
          name: `[Seed] ${a.display_name}`,
          system_prompt: a.description,
        })
        .select('id')
        .single()

      if (aErr || !assistant) {
        results.push({ slug: a.slug, id: null, error: `assistant: ${aErr?.message ?? 'null'}` })
        continue
      }

      // 3. Create launched agent
      const agent = await createLaunchedAgent({
        assistant_id: assistant.id,
        creator_wallet: wallet,
        org_id: org.id,
        slug: a.slug,
        display_name: a.display_name,
        description: a.description,
        category: a.category,
        tags: a.tags,
        token_supply: a.token_supply,
        creator_alloc_bps: 1500,
        agent_wallet_address: wallet,
        price_per_request: a.price_per_request,
        platform_fee_bps: 1500,
      })

      if (!agent) {
        results.push({ slug: a.slug, id: null, error: 'createLaunchedAgent returned null' })
        continue
      }

      // 4. Apply status + stats updates
      if (a.updates) {
        await updateLaunchedAgent(agent.id, a.updates)
      }

      results.push({ slug: a.slug, id: agent.id })
    } catch (err) {
      results.push({
        slug: a.slug,
        id: null,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const succeeded = results.filter((r) => r.id !== null).length
  const failed = results.filter((r) => r.id === null).length

  return NextResponse.json({
    message: `Seeded ${succeeded} agents (${failed} failed)`,
    orgId: org.id,
    seeded: results,
  })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
