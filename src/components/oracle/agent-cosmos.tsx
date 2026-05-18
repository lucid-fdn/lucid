'use client'

import type { GraphSnapshot } from '@/hooks/use-oracle-realtime'

interface AgentCosmosProps {
  nodes?: unknown[]
  links?: unknown[]
  meta?: unknown
  initialSnapshot?: GraphSnapshot
}

/**
 * Agent Cosmos 3D visualization — temporarily disabled.
 *
 * The react-force-graph-3d and three-spritetext packages were removed
 * because they cause OOM on Vercel Hobby's 4GB memory limit during
 * webpack bundling. Re-enable when upgrading to Vercel Pro or when
 * a lighter 3D graph solution is available.
 */
export function AgentCosmos(_props: AgentCosmosProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background/80">
      <div className="text-center space-y-3 max-w-sm">
        <div className="text-4xl">🌐</div>
        <h3 className="text-lg font-medium text-foreground">
          Agent Network Visualization
        </h3>
        <p className="text-sm text-muted-foreground">
          The 3D cosmos view is temporarily disabled to reduce build size.
          Agent network data is still available via the Oracle API.
        </p>
      </div>
    </div>
  )
}
