import { NextRequest, NextResponse } from 'next/server'
import { summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'

// Mock data for testing UI
const mockUserRewards = {
  totalPoints: 8500,
  rank: 42,
  tier: 'gold' as const,
  weeklyPoints: 450,
  monthlyPoints: 1800,
  stats: {
    workflowsCreated: 23,
    agentsDeployed: 12,
    marketplacePublishes: 5,
    communityContributions: 18,
  },
  recentActivity: [
    {
      id: '1',
      action: 'Published "AI Content Generator" to marketplace',
      points: 500,
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    },
    {
      id: '2',
      action: 'Deployed agent "Customer Support Bot"',
      points: 200,
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    },
    {
      id: '3',
      action: 'Created workflow "Email Automation"',
      points: 100,
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    },
    {
      id: '4',
      action: 'Invited team member to workspace',
      points: 100,
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    },
    {
      id: '5',
      action: 'Completed onboarding',
      points: 50,
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    },
  ],
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const _userId = (await params).userId

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Return mock data
    return NextResponse.json(mockUserRewards)
  } catch (error) {
    console.error('[API] Rewards lookup failed:', summarizeError(error))
    return NextResponse.json(
      { error: 'Failed to fetch user rewards' },
      { status: 500 }
    )
  }
}
