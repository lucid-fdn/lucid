import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Define the user type
type LeaderboardUser = {
  id: string
  rank: number
  name: string
  handle: string
  avatar: string
  points: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  weeklyPoints: number
  isCurrentUser: boolean
}

// Mock leaderboard data
const mockUsers: LeaderboardUser[] = [
  {
    id: '1',
    rank: 1,
    name: 'Sarah Chen',
    handle: 'sarahchen',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    points: 25600,
    tier: 'platinum',
    weeklyPoints: 1200,
    isCurrentUser: false,
  },
  {
    id: '2',
    rank: 2,
    name: 'Alex Kumar',
    handle: 'alexkumar',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    points: 18900,
    tier: 'gold' as const,
    weeklyPoints: 980,
    isCurrentUser: false,
  },
  {
    id: '3',
    rank: 3,
    name: 'Maria Rodriguez',
    handle: 'mariarodriguez',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria',
    points: 15400,
    tier: 'gold' as const,
    weeklyPoints: 750,
    isCurrentUser: false,
  },
  {
    id: '4',
    rank: 4,
    name: 'James Wilson',
    handle: 'jameswilson',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James',
    points: 12800,
    tier: 'gold' as const,
    weeklyPoints: 620,
    isCurrentUser: false,
  },
  {
    id: '5',
    rank: 5,
    name: 'Emma Thompson',
    handle: 'emmathompson',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
    points: 11200,
    tier: 'gold' as const,
    weeklyPoints: 580,
    isCurrentUser: false,
  },
]

// Generate more mock users for realistic leaderboard
function generateMockLeaderboard(currentUserId: string) {
  const users = [...mockUsers]
  
  // Add current user at rank 42
  users.push({
    id: currentUserId,
    rank: 42,
    name: 'You',
    handle: 'yourhandle',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=You',
    points: 8500,
    tier: 'gold' as const,
    weeklyPoints: 450,
    isCurrentUser: true,
  })
  
  // Add more users to fill the leaderboard
  for (let i = 6; i <= 50; i++) {
    if (i === 42) continue // Skip rank 42, current user is there
    
    const points = Math.max(1000, 12000 - (i * 200))
    const tier: 'bronze' | 'silver' | 'gold' | 'platinum' = 
      points >= 20000 ? 'platinum' : 
      points >= 5000 ? 'gold' : 
      points >= 1000 ? 'silver' : 
      'bronze'
    
    users.push({
      id: `user-${i}`,
      rank: i,
      name: `User ${i}`,
      handle: `user${i}`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=User${i}`,
      points,
      tier,
      weeklyPoints: Math.floor(points * 0.05),
      isCurrentUser: false,
    })
  }
  
  // Sort by rank
  return users.sort((a, b) => a.rank - b.rank)
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'global' // global | weekly | teams
    const userId = searchParams.get('userId') || 'mock-user-id'

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 700))

    // Generate leaderboard with current user
    const leaderboard = generateMockLeaderboard(userId)

    // For weekly, adjust the sorting (in real app, would query different timeframe)
    if (type === 'weekly') {
      // Sort by weeklyPoints instead
      leaderboard.sort((a, b) => (b.weeklyPoints || 0) - (a.weeklyPoints || 0))
      // Update ranks
      leaderboard.forEach((user, index) => {
        user.rank = index + 1
      })
    }

    // For teams, return subset (in real app, would filter by team)
    if (type === 'teams') {
      // Just return top 10 + current user for demo
      const topTen = leaderboard.slice(0, 10)
      const currentUser = leaderboard.find(u => u.id === userId)
      if (currentUser && !topTen.includes(currentUser)) {
        topTen.push(currentUser)
      }
      return NextResponse.json(topTen.sort((a, b) => a.rank - b.rank))
    }

    return NextResponse.json(leaderboard)
  } catch (error) {
    console.error('[API] /api/rewards/leaderboard Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}
