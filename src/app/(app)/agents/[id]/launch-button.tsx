'use client'

import { useState } from 'react'
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context'

export function LaunchOnLaunchpadButton({ assistantId }: { assistantId: string }) {
  const flags = useResolvedFeatureFlags()
  const [isLoading, setIsLoading] = useState(false)

  if (!flags.launchpad) return null

  return (
    <button
      onClick={() => {
        setIsLoading(true)
        window.location.href = `/launchpad/launch?assistantId=${assistantId}`
      }}
      disabled={isLoading}
      className="rounded-md border border-primary bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
    >
      {isLoading ? 'Redirecting...' : 'Launch on Lucid Launch'}
    </button>
  )
}
