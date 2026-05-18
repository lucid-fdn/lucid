import { requireUserId } from '@/lib/auth/session'
import { Suspense } from 'react'
import { RewardsOverview, RewardsOverviewSkeleton } from '@/components/rewards'

export const metadata = {
  title: 'Rewards | Lucid',
  description: 'Track your contributions and earn rewards for helping build the Lucid ecosystem',
}

export default async function RewardsPage() {
  // Server-side auth protection
  const userId = await requireUserId()

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Rewards</h1>
        <p className="text-muted-foreground mt-2">
          Earn points for contributing to the Lucid ecosystem. Build workflows, deploy agents, and help the community grow.
        </p>
      </div>

      <Suspense fallback={<RewardsOverviewSkeleton />}>
        <RewardsOverview userId={userId} />
      </Suspense>
    </div>
  )
}
