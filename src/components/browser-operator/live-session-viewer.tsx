'use client'

import { CheckCircle2, ExternalLink, Play, Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatBrowserDate, formatBrowserLabel, shortId } from './format'
import type { BrowserOperatorSession, BrowserSessionAction, BrowserSessionEvent } from './types'

interface BrowserLiveSessionViewerProps {
  sessions: BrowserOperatorSession[]
  events: BrowserSessionEvent[]
  busyAction: string | null
  onHandoffAction: (session: BrowserOperatorSession, action: BrowserSessionAction) => void
}
export function BrowserLiveSessionViewer({
  sessions,
  events,
  busyAction,
  onHandoffAction,
}: BrowserLiveSessionViewerProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Live Sessions</h2>
          <p className="text-xs text-muted-foreground">Handoff, resume, screenshots, current URL, and pair-agent browser sharing state.</p>
        </div>
        <Badge variant={sessions.some((session) => session.status === 'handoff_required') ? 'destructive' : 'outline'}>
          {sessions.filter((session) => session.status === 'handoff_required').length} handoffs
        </Badge>
      </div>
      <div className="grid min-h-[360px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="divide-y">
          {sessions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No live browser session events are indexed yet.</div>
          ) : sessions.map((session) => (
            <div key={session.sessionKey} className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  <h3 className="truncate text-sm font-medium">{formatBrowserLabel(session.status)}</h3>
                  <Badge variant={session.trustState === 'blocked' ? 'destructive' : session.trustState === 'degraded' ? 'secondary' : 'outline'}>
                    {formatBrowserLabel(session.trustState)}
                  </Badge>
                  {session.handoffState ? <Badge variant="secondary">{formatBrowserLabel(session.handoffState)}</Badge> : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{session.latestMessage ?? session.currentUrl ?? session.sessionKey}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Run {shortId(session.runId)}</span>
                  <span>Session {shortId(session.browserSessionId ?? session.sessionKey)}</span>
                  <span>{session.eventCount} events</span>
                  <span>{session.activeShareCount} active shares</span>
                  <span>{formatBrowserDate(session.updatedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {session.currentUrl ? (
                  <Button variant="ghost" size="icon" asChild title="Open current URL">
                    <a href={session.currentUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                {session.status === 'handoff_required' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!session.runId || busyAction === `browser-handoff:resolve:${session.sessionKey}`}
                    onClick={() => onHandoffAction(session, 'resolve')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Resolve
                  </Button>
                ) : null}
                {(session.status === 'handoff_required' || session.status === 'resumable') ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!session.runId || busyAction === `browser-handoff:resume:${session.sessionKey}`}
                    onClick={() => onHandoffAction(session, 'resume')}
                  >
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t bg-muted/20 lg:border-l lg:border-t-0">
          <div className="border-b px-4 py-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Recent Timeline</h3>
          </div>
          <ScrollArea className="h-[318px]">
            <div className="space-y-3 p-4">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No session timeline events yet.</p>
              ) : events.slice(0, 12).map((event) => (
                <div key={event.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={event.severity === 'error' ? 'destructive' : event.severity === 'warn' ? 'secondary' : 'outline'}>
                      {formatBrowserLabel(event.eventType)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{formatBrowserDate(event.createdAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{event.message ?? event.currentUrl ?? event.sessionKey}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
