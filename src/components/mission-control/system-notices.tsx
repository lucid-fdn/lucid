'use client'

import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import type { SystemNotice } from '@contracts/system-notice'

interface MissionControlSystemNoticesProps {
  orgId: string
}

export function MissionControlSystemNotices({
  orgId,
}: MissionControlSystemNoticesProps) {
  const [notices, setNotices] = useState<SystemNotice[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      org_id: orgId,
      unresolved_only: 'true',
      limit: '3',
    })
    fetch(`/api/mission-control/notices?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { notices?: SystemNotice[] } | null) =>
        setNotices(body?.notices ?? []),
      )
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') setNotices([])
      })
    return () => controller.abort()
  }, [orgId])

  if (notices.length === 0) return null

  return (
    <div className="space-y-2 border-t bg-muted/25 px-6 py-3">
      {notices.map((notice) => (
        <WorkspaceActionRow
          key={notice.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {notice.title}
              <Badge variant="outline">{notice.type.replace(/_/g, ' ')}</Badge>
            </span>
          }
          description={notice.body}
          tone={
            notice.tone === 'danger'
              ? 'danger'
              : notice.tone === 'warning'
                ? 'warning'
                : notice.tone === 'success'
                  ? 'success'
                  : 'default'
          }
          meta={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void fetch(`/api/mission-control/notices/${notice.id}`, {
                  method: 'PATCH',
                  headers: buildClientMutationHeaders(),
                  body: JSON.stringify({ org_id: orgId, action: 'resolve' }),
                }).then((response) => {
                  if (response.ok)
                    setNotices((current) =>
                      current.filter((item) => item.id !== notice.id),
                    )
                })
              }}
            >
              Resolve
            </Button>
          }
        />
      ))}
    </div>
  )
}
