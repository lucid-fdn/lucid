import { requireUserId } from '@/lib/auth/session'
import { Suspense } from 'react'
import { Leaderboard, LeaderboardSkeleton } from '@/components/rewards'
import { NetflixHero } from '@/components/hero/netflix-hero'

export const metadata = {
  title: 'Leaderboard | Rewards | Lucid',
  description: 'See how you rank among top contributors in the Lucid community',
}

export default async function LeaderboardPage() {
  // Server-side auth protection
  const userId = await requireUserId()

  return (
    <div>
      <NetflixHero
          title="Leaderboard"
          description="Top contributors who are building the Internet of AI"
          videoUrl="/videos/ioai.webm" // Optional: Add your video to /public/hero-video.mp4
          posterUrl="/hero-poster.jpg" // Optional: Add your poster to /public/hero-poster.jpg
          compact={true}
          badge="🏆 Leaderboard"
        />
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Suspense fallback={<LeaderboardSkeleton />}>
          <Leaderboard userId={userId} />
        </Suspense>
      </div>
    </div>
  )
}
