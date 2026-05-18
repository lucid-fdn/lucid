'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoClusterIllustration } from '@/components/ui/logo-cluster-illustration'
import { RevealSurface } from '@/components/ui/reveal-surface'
import { buildProjectAgentBuilderPath } from '@/lib/projects/urls'

interface DashboardZeroAgentsStateProps {
  workspaceSlug: string
  projectName: string
  projectSlug: string
}

export function DashboardZeroAgentsState({
  workspaceSlug,
  projectName,
  projectSlug,
}: DashboardZeroAgentsStateProps) {
  const createAgentHref = buildProjectAgentBuilderPath(workspaceSlug, projectSlug)

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl px-6 py-8">
      <RevealSurface className="flex min-h-[560px] w-full items-center justify-center" contentClassName="flex min-h-[560px] w-full items-center justify-center px-8 py-12">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
          <LogoClusterIllustration
            className="mb-6"
            items={[
              { id: 'github', slug: 'github', size: 'sm' },
              { id: 'anthropic', slug: 'anthropic', size: 'md' },
              { id: 'x', slug: 'twitter', size: 'lg' },
              { id: 'meta', slug: 'meta', size: 'md' },
              { id: 'google', slug: 'google', size: 'sm' },
            ]}
          />

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Project ready
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {projectName} is ready for its first agent
            </h1>
            <p className="mx-auto max-w-lg text-balance text-sm leading-6 text-muted-foreground">
              The dashboard will show health, runs, approvals, work, and cost once agents are live.
              Start from the Agents canvas to create the first one.
            </p>
          </div>

          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="gap-2 px-5">
              <Link href={createAgentHref}>
                <Network className="h-4 w-4" />
                Open Agents canvas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </RevealSurface>
    </div>
  )
}
