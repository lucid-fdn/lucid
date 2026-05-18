'use client'

import { FeedEventCard } from '@/components/mission-control/command-center/feed-event'
import { EmptyState, PageSection } from '@/components/page'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { FeedEvent, MCAgent } from '@/lib/mission-control/types'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

interface ActivityClientProps {
  orgId: string
  workspaceSlug: string
  initialEvents: FeedEvent[]
  agents: MCAgent[]
}

export function ActivityClient({
  orgId,
  workspaceSlug,
  initialEvents,
  agents,
}: ActivityClientProps) {
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents)
  const [loading, setLoading] = useState(false)

  const agentMap = useMemo(
    () =>
      new Map(
        agents.map((agent) => [
          agent.id,
          {
            projectSlug: agent.projectSlug ?? null,
            projectName: agent.projectName ?? null,
          },
        ]),
      ),
    [agents],
  )

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/mission-control/feed?org_id=${orgId}&limit=100`,
          {
            cache: 'no-store',
          },
        )
        if (!res.ok) return
        const payload = await res.json()
        if (!cancelled) {
          setEvents(payload.events ?? [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const id = window.setInterval(() => {
      void refresh()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [orgId])

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${workspaceSlug}/mission-control/overview`}>
              Overview
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${workspaceSlug}/mission-control/replay`}>
              Replay
            </Link>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {loading && events.length === 0 ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl bg-muted/50"
              />
            ))
          ) : events.length === 0 ? (
            <EmptyState
              title="No workspace activity yet"
              description="Project, agent, runtime, and approval events will stream here once work begins."
            />
          ) : (
            events.map((event) => {
              const agent = agentMap.get(event.agent_id)
              return (
                <PageSection
                  key={event.id}
                  className="py-2"
                  contentClassName="px-2"
                >
                  <div className="flex items-center justify-between gap-3 px-2 pt-1 text-xs text-muted-foreground">
                    <div className="min-w-0 truncate">
                      {agent?.projectName
                        ? `Project ${agent.projectName}`
                        : 'Unassigned project'}
                    </div>
                    {agent?.projectSlug ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        <Link
                          href={buildProjectAgentDetailPath(
                            workspaceSlug,
                            agent.projectSlug,
                            event.agent_id,
                          )}
                        >
                          Open in project
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <FeedEventCard event={event} />
                </PageSection>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
