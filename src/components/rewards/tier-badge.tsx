import { cn } from '@/lib/utils'
import { Award, Crown, Gem, Medal } from 'lucide-react'

type Tier = 'bronze' | 'silver' | 'gold' | 'platinum'

interface TierBadgeProps {
  tier: Tier
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const tierConfig = {
  bronze: {
    label: 'Bronze',
    icon: Medal,
    colors: 'bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-700/20',
    iconColor: 'text-amber-700 dark:text-amber-400',
  },
  silver: {
    label: 'Silver',
    icon: Award,
    colors: 'bg-slate-900/20 text-slate-700 dark:text-slate-300 border-slate-700/20',
    iconColor: 'text-slate-700 dark:text-slate-300',
  },
  gold: {
    label: 'Gold',
    icon: Crown,
    colors: 'bg-yellow-950/20 text-yellow-600 dark:text-yellow-400 border-yellow-600/20',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  platinum: {
    label: 'Platinum',
    icon: Gem,
    colors: 'bg-cyan-950/20 text-cyan-600 dark:text-cyan-400 border-cyan-600/20',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
}

const sizeConfig = {
  sm: {
    container: 'px-2 py-1 text-xs',
    icon: 'h-3 w-3',
  },
  md: {
    container: 'px-3 py-1.5 text-sm',
    icon: 'h-4 w-4',
  },
  lg: {
    container: 'px-4 py-2 text-base',
    icon: 'h-5 w-5',
  },
}

export function TierBadge({ 
  tier, 
  size = 'md', 
  showLabel = true,
  className 
}: TierBadgeProps) {
  const config = tierConfig[tier]
  const sizes = sizeConfig[size]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        config.colors,
        sizes.container,
        className
      )}
    >
      <Icon className={cn(sizes.icon, config.iconColor)} />
      {showLabel && <span>{config.label}</span>}
    </div>
  )
}

// Helper to get tier from points
export function getTierFromPoints(points: number): Tier {
  if (points >= 20000) return 'platinum'
  if (points >= 5000) return 'gold'
  if (points >= 1000) return 'silver'
  return 'bronze'
}

// Helper to get next tier info
export function getNextTierInfo(currentPoints: number) {
  if (currentPoints >= 20000) {
    return { nextTier: 'platinum', pointsNeeded: 0, progress: 100 }
  }
  if (currentPoints >= 5000) {
    return {
      nextTier: 'platinum' as Tier,
      pointsNeeded: 20000 - currentPoints,
      progress: ((currentPoints - 5000) / (20000 - 5000)) * 100,
    }
  }
  if (currentPoints >= 1000) {
    return {
      nextTier: 'gold' as Tier,
      pointsNeeded: 5000 - currentPoints,
      progress: ((currentPoints - 1000) / (5000 - 1000)) * 100,
    }
  }
  return {
    nextTier: 'silver' as Tier,
    pointsNeeded: 1000 - currentPoints,
    progress: (currentPoints / 1000) * 100,
  }
}
