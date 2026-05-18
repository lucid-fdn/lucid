'use client'

import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBrowserDate, formatBrowserLabel, trustBadgeVariant } from './format'
import type { BrowserOperatorPlaybook, PlaybookTrustAction } from './types'

interface BrowserHostPlaybookPanelProps {
  playbooks: BrowserOperatorPlaybook[]
  busyAction: string | null
  onTrustAction: (playbookId: string, action: PlaybookTrustAction) => void
}

export function BrowserHostPlaybookPanel({
  playbooks,
  busyAction,
  onTrustAction,
}: BrowserHostPlaybookPanelProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Host Playbooks</h2>
          <p className="text-xs text-muted-foreground">Domain-specific operating notes with use and security history.</p>
        </div>
        <Badge variant="outline">{playbooks.length} total</Badge>
      </div>
      <div className="divide-y">
        {playbooks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No host playbooks have been captured yet.</div>
        ) : playbooks.map((playbook) => (
          <div key={playbook.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-medium">{playbook.title}</h3>
                <Badge variant={trustBadgeVariant(playbook.trustState)}>{formatBrowserLabel(playbook.trustState)}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{playbook.hostPattern}</span>
                <span>{playbook.successfulUses} successful uses</span>
                <span>{playbook.securityFlagsCount} security flags</span>
                <span>Last used {formatBrowserDate(playbook.lastUsedAt)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-1.5">
              {playbook.trustState !== 'active' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Activate playbook"
                  disabled={busyAction === `browser-playbook:promote:${playbook.id}`}
                  onClick={() => onTrustAction(playbook.id, 'promote')}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              ) : null}
              {playbook.trustState !== 'blocked' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Block playbook"
                  disabled={busyAction === `browser-playbook:block:${playbook.id}`}
                  onClick={() => onTrustAction(playbook.id, 'block')}
                >
                  <ShieldAlert className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
