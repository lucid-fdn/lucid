import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/session'
import { getLaunchedAgentsByCreator, getLaunchedAgents } from '@/lib/db'
import { PortfolioClient } from './portfolio-client'

export const metadata: Metadata = {
  title: 'Portfolio — Lucid Launch',
  description: 'View and manage your AI agent portfolio — launched agents and token holdings.',
}

export default async function PortfolioPage() {
  const session = await getServerSession()
  if (!session?.userId) redirect('/login?next=/portfolio')

  // Fetch agents the user created
  const createdAgents = await getLaunchedAgentsByCreator(session.userId)

  // Also fetch all trading agents so the client can show "all agents" as a discovery fallback
  const allTradingAgents = await getLaunchedAgents({ status: 'trading', limit: 50 })

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Your Portfolio
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Manage your launched agents and track token holdings
        </p>
      </div>

      {/* Client-rendered animated content */}
      <PortfolioClient agents={createdAgents} allAgents={allTradingAgents} />
    </div>
  )
}
