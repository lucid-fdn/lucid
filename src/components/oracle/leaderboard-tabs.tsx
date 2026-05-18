'use client'

const TABS = [
  { value: 'smart', label: 'Smart Ranking' },
  { value: 'evidence', label: 'Most Reputation' },
  { value: 'tx_count', label: 'Most Active' },
  { value: 'tvl', label: 'Highest Portfolio' },
  { value: 'newest', label: 'Newest' },
] as const

export type LeaderboardSort = (typeof TABS)[number]['value']

interface LeaderboardTabsProps {
  active: LeaderboardSort
  onChange: (value: LeaderboardSort) => void
}

/**
 * Bloomberg-style tab bar for agent leaderboard.
 * Each tab sets a different sort param on the InfiniteList.
 */
export function LeaderboardTabs({ active, onChange }: LeaderboardTabsProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
      {TABS.map((tab) => {
        const isActive = active === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              isActive
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
