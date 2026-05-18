'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TierBadge } from './tier-badge'
import { StatsGrid } from './stats-grid'
import { RecentActivity } from './recent-activity'
import { Button } from '@/components/ui/button'
import { ArrowRight, Trophy } from 'lucide-react'
import Link from 'next/link'
import { AnimatedNumber } from '@/components/motion-primitives/animated-number'

interface UserRewards {
  totalPoints: number
  rank: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  weeklyPoints: number
  monthlyPoints: number
  stats: {
    workflowsCreated: number
    agentsDeployed: number
    marketplacePublishes: number
    communityContributions: number
  }
  recentActivity: Array<{
    id: string
    action: string
    points: number
    timestamp: string
  }>
}

interface RewardsOverviewProps {
  userId: string
}

export function RewardsOverview({ userId }: RewardsOverviewProps) {
  const [data, setData] = useState<UserRewards | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRewards() {
      try {
        setLoading(true)
        const response = await fetch(`/api/rewards/user/${userId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch rewards data')
        }
        
        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        console.error('[RewardsOverview] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRewards()
  }, [userId])

  if (loading) {
    return <RewardsOverviewSkeleton />
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            {error || 'Unable to load rewards data. Please try again later.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero Card - Your Stats */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">Your Progress</CardTitle>
              <CardDescription>Keep contributing to level up and earn rewards</CardDescription>
            </div>
            <TierBadge tier={data.tier} size="lg" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Points</p>
              <p className="text-4xl font-bold">
                <AnimatedNumber value={data.totalPoints} />
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Global Rank</p>
              <p className="text-4xl font-bold">
                #<AnimatedNumber value={data.rank} />
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">This Week</p>
              <p className="text-4xl font-bold text-primary">
                +<AnimatedNumber value={data.weeklyPoints} />
              </p>
            </div>
          </div>

          <div className="mt-6">
            <Link href="/rewards/leaderboard">
              <Button className="w-full sm:w-auto" variant="outline">
                <Trophy className="mr-2 h-4 w-4" />
                View Leaderboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <StatsGrid stats={data.stats} />

      {/* Recent Activity */}
      <RecentActivity activities={data.recentActivity} />
    </div>
  )
}

// Skeleton component for loading state
function RewardsOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-12 w-24 bg-muted animate-pulse rounded-full" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-10 w-32 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
