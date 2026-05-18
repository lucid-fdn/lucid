'use client'

import { ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatBrowserDate, formatBrowserLabel, shortId } from './format'
import type { BrowserOperatorConsoleData, BrowserSecurityEvent } from './types'

interface BrowserTrustShieldProps {
  consoleData: BrowserOperatorConsoleData | null
  events: BrowserSecurityEvent[]
}

export function BrowserTrustShield({ consoleData, events }: BrowserTrustShieldProps) {
  const blocked = events.filter((event) => event.severity === 'block')
  const warned = events.filter((event) => event.severity === 'warn')
  const icon = blocked.length > 0 ? ShieldAlert : warned.length > 0 ? TriangleAlert : ShieldCheck
  const Icon = icon

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md border bg-background p-2">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Browser Trust Shield</h2>
            <p className="text-xs text-muted-foreground">Prompt-injection, untrusted content, private-network, and handoff risk signals.</p>
          </div>
        </div>
        <Badge variant={blocked.length > 0 ? 'destructive' : warned.length > 0 ? 'secondary' : 'outline'}>
          {formatBrowserLabel(consoleData?.health ?? 'empty')}
        </Badge>
      </div>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
        <Metric label="Blocking events" value={blocked.length} tone={blocked.length > 0 ? 'danger' : 'normal'} />
        <Metric label="Warnings" value={warned.length} tone={warned.length > 0 ? 'warn' : 'normal'} />
        <Metric label="Active shares" value={consoleData?.summary.activeShareCount ?? 0} tone="normal" />
      </div>
      <div className="divide-y">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No Browser Trust Shield events in this scope.</div>
        ) : events.slice(0, 10).map((event) => (
          <div key={event.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={event.severity === 'block' ? 'destructive' : event.severity === 'warn' ? 'secondary' : 'outline'}>
                  {formatBrowserLabel(event.severity)}
                </Badge>
                <span className="truncate text-sm font-medium">{formatBrowserLabel(event.eventType)}</span>
                <span className="font-mono text-xs text-muted-foreground">{event.host ?? shortId(event.browserSessionId)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {event.layer} · run {shortId(event.opsRunId)} · session {shortId(event.browserSessionId)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{formatBrowserDate(event.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'normal' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === 'danger' ? 'mt-1 text-2xl font-semibold text-destructive' : tone === 'warn' ? 'mt-1 text-2xl font-semibold text-amber-600' : 'mt-1 text-2xl font-semibold'}>
        {value}
      </p>
    </div>
  )
}
