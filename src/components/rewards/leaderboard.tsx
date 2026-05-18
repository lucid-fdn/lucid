'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { TierBadge } from './tier-badge'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from '@/components/motion-primitives/animated-number'

interface LeaderboardUser {
  id: string
  rank: number
  name: string
  handle: string
  avatar?: string
  points: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  weeklyPoints?: number
  isCurrentUser?: boolean
}

interface LeaderboardProps {
  userId: string
}

type LeaderboardTab = 'global' | 'weekly' | 'teams'

export function Leaderboard({ userId }: LeaderboardProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('global')
  const [data, setData] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(`/api/rewards/leaderboard?type=${activeTab}&userId=${userId}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard')
        }
        
        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        console.error('[Leaderboard] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [activeTab, userId])

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LeaderboardTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global">
            <Trophy className="mr-2 h-4 w-4" />
            Global
          </TabsTrigger>
          <TabsTrigger value="weekly">
            <TrendingUp className="mr-2 h-4 w-4" />
            This Week
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Award className="mr-2 h-4 w-4" />
            Teams
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="mt-6">
          <LeaderboardContent data={data} loading={loading} error={error} type="global" />
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <LeaderboardContent data={data} loading={loading} error={error} type="weekly" />
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <LeaderboardContent data={data} loading={loading} error={error} type="teams" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface LeaderboardContentProps {
  data: LeaderboardUser[]
  loading: boolean
  error: string | null
  type: LeaderboardTab
}

function LeaderboardContent({ data, loading, error, type }: LeaderboardContentProps) {
  if (loading) {
    return <LeaderboardSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No rankings available yet. Be the first to contribute!
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Separate top 3 and rest
  const topThree = data.slice(0, 3)
  const others = data.slice(3)

  return (
    <div className="space-y-6">
      {/* Top 3 Podium */}
      {topThree.length > 0 && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-600" />
              Top Contributors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {topThree.map((user, index) => (
                <PodiumCard
                  key={user.id}
                  user={user}
                  position={(index + 1) as 1 | 2 | 3}
                  type={type}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rest of leaderboard */}
      {others.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {others.map((user) => (
                <LeaderboardRow
                  key={user.id}
                  user={user}
                  type={type}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface PodiumCardProps {
  user: LeaderboardUser
  position: 1 | 2 | 3
  type: LeaderboardTab
}

function PodiumCard({ user, position, type }: PodiumCardProps) {
  const podiumConfig = {
    1: {
      icon: Trophy,
      iconColor: 'text-yellow-600',
      bg: 'bg-yellow-600/10',
      border: 'border-yellow-600/20',
    },
    2: {
      icon: Medal,
      iconColor: 'text-slate-600',
      bg: 'bg-slate-600/10',
      border: 'border-slate-600/20',
    },
    3: {
      icon: Award,
      iconColor: 'text-amber-700',
      bg: 'bg-amber-700/10',
      border: 'border-amber-700/20',
    },
  }

  const config = podiumConfig[position]
  const Icon = config.icon
  const points = type === 'weekly' ? user.weeklyPoints || user.points : user.points

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 p-6 transition-all',
        config.border,
        config.bg,
        user.isCurrentUser && 'ring-2 ring-primary'
      )}
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="relative">
          <Avatar className="h-20 w-20 border-2 border-background">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className={cn('absolute -top-2 -right-2 rounded-full p-1.5', config.bg)}>
            <Icon className={cn('h-5 w-5', config.iconColor)} />
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-semibold">{user.name}</p>
          <p className="text-xs text-muted-foreground">@{user.handle}</p>
        </div>

        <TierBadge tier={user.tier} size="sm" />

        <div className="pt-2">
          <p className="text-2xl font-bold">
            <AnimatedNumber value={points} />
          </p>
          <p className="text-xs text-muted-foreground">points</p>
        </div>

        {user.isCurrentUser && (
          <Badge variant="default" className="absolute top-2 right-2">
            You
          </Badge>
        )}
      </div>
    </div>
  )
}

interface LeaderboardRowProps {
  user: LeaderboardUser
  type: LeaderboardTab
}

function LeaderboardRow({ user, type }: LeaderboardRowProps) {
  const points = type === 'weekly' ? user.weeklyPoints || user.points : user.points

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border transition-colors hover:bg-muted/50',
        user.isCurrentUser && 'bg-primary/5 border-primary/20'
      )}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-semibold">
        {user.rank}
      </div>

      <Avatar className="h-10 w-10">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{user.name}</p>
          {user.isCurrentUser && (
            <Badge variant="secondary" className="text-xs">You</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">@{user.handle}</p>
      </div>

      <TierBadge tier={user.tier} size="sm" showLabel={false} />

      <div className="text-right">
        <p className="font-semibold">{points.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">points</p>
      </div>
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border-2 border-muted/50 p-6">
                <div className="flex flex-col items-center space-y-3">
                  <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
