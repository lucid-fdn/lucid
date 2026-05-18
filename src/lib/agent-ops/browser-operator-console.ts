import type { AgentOpsBrowserHostPlaybook } from './browser-host-playbooks'
import type { AgentOpsBrowserProcedure } from './browser-procedures'
import type { AgentOpsBrowserSessionEvent } from './browser-live-sessions'
import type {
  AgentOpsBrowserSessionShare,
  AgentOpsBrowserSessionSharedAction,
} from './browser-session-sharing'
import type { AgentOpsBrowserTrustSecurityEvent } from './browser-trust-shield'

export type BrowserOperatorConsoleHealth = 'ready' | 'needs_review' | 'blocked' | 'empty'
export type BrowserOperatorConsoleSessionStatus =
  | 'active'
  | 'handoff_required'
  | 'resumable'
  | 'completed'
  | 'failed'

export interface BrowserOperatorConsoleSession {
  sessionKey: string
  runId: string
  browserSessionId: string | null
  status: BrowserOperatorConsoleSessionStatus
  trustState: 'protected' | 'degraded' | 'blocked'
  latestEventType: AgentOpsBrowserSessionEvent['eventType']
  latestMessage: string | null
  currentUrl: string | null
  screenshotUri: string | null
  handoffState: AgentOpsBrowserSessionEvent['handoffState']
  eventCount: number
  shareCount: number
  activeShareCount: number
  sharedActionCount: number
  blockingTrustEventCount: number
  warningTrustEventCount: number
  updatedAt: string | null
}

export interface BrowserOperatorConsoleProcedure {
  id: string
  name: string
  hostPattern: string
  procedureType: AgentOpsBrowserProcedure['procedureType']
  scope: AgentOpsBrowserProcedure['scope']
  trustState: AgentOpsBrowserProcedure['trustState']
  sourceRunId: string | null
  triggerPreview: string
  updatedAt: string
}

export interface BrowserOperatorConsolePlaybook {
  id: string
  title: string
  hostPattern: string
  scope: AgentOpsBrowserHostPlaybook['scope']
  trustState: AgentOpsBrowserHostPlaybook['trustState']
  successfulUses: number
  securityFlagsCount: number
  lastUsedAt: string | null
  updatedAt: string
}

export interface BrowserOperatorConsole {
  schemaVersion: 1
  health: BrowserOperatorConsoleHealth
  summary: {
    procedureCount: number
    activeProcedureCount: number
    quarantinedProcedureCount: number
    playbookCount: number
    activePlaybookCount: number
    sessionCount: number
    activeSessionCount: number
    handoffSessionCount: number
    resumableSessionCount: number
    blockingTrustEventCount: number
    warningTrustEventCount: number
    activeShareCount: number
  }
  procedures: BrowserOperatorConsoleProcedure[]
  playbooks: BrowserOperatorConsolePlaybook[]
  sessions: BrowserOperatorConsoleSession[]
  warnings: string[]
}

export function buildBrowserOperatorConsole(input: {
  procedures?: readonly AgentOpsBrowserProcedure[]
  hostPlaybooks?: readonly AgentOpsBrowserHostPlaybook[]
  securityEvents?: readonly AgentOpsBrowserTrustSecurityEvent[]
  sessionEvents?: readonly AgentOpsBrowserSessionEvent[]
  sessionShares?: readonly AgentOpsBrowserSessionShare[]
  sessionSharedActions?: readonly AgentOpsBrowserSessionSharedAction[]
  limit?: number
}): BrowserOperatorConsole {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 24)
  const procedures = [...(input.procedures ?? [])]
  const hostPlaybooks = [...(input.hostPlaybooks ?? [])]
  const securityEvents = [...(input.securityEvents ?? [])]
  const sessionEvents = [...(input.sessionEvents ?? [])]
  const sessionShares = [...(input.sessionShares ?? [])]
  const sessionSharedActions = [...(input.sessionSharedActions ?? [])]
  const sessions = buildConsoleSessions({
    securityEvents,
    sessionEvents,
    sessionShares,
    sessionSharedActions,
  }).slice(0, limit)
  const blockingTrustEventCount = securityEvents.filter((event) => event.severity === 'block').length
  const warningTrustEventCount = securityEvents.filter((event) => event.severity === 'warn').length
  const activeProcedureCount = procedures.filter((procedure) => procedure.trustState === 'active').length
  const activePlaybookCount = hostPlaybooks.filter((playbook) => playbook.trustState === 'active').length
  const handoffSessionCount = sessions.filter((session) => session.status === 'handoff_required').length
  const resumableSessionCount = sessions.filter((session) => session.status === 'resumable').length
  const activeSessionCount = sessions.filter((session) => session.status === 'active').length
  const warnings = buildConsoleWarnings({
    procedureCount: procedures.length,
    activeProcedureCount,
    playbookCount: hostPlaybooks.length,
    activePlaybookCount,
    blockingTrustEventCount,
    handoffSessionCount,
  })

  return {
    schemaVersion: 1,
    health: resolveConsoleHealth({
      procedureCount: procedures.length,
      activeProcedureCount,
      blockingTrustEventCount,
      handoffSessionCount,
    }),
    summary: {
      procedureCount: procedures.length,
      activeProcedureCount,
      quarantinedProcedureCount: procedures.filter((procedure) => procedure.trustState === 'quarantined').length,
      playbookCount: hostPlaybooks.length,
      activePlaybookCount,
      sessionCount: sessions.length,
      activeSessionCount,
      handoffSessionCount,
      resumableSessionCount,
      blockingTrustEventCount,
      warningTrustEventCount,
      activeShareCount: sessionShares.filter((share) => share.status === 'active').length,
    },
    procedures: procedures
      .slice(0, limit)
      .map((procedure) => ({
        id: procedure.id,
        name: procedure.name,
        hostPattern: procedure.hostPattern,
        procedureType: procedure.procedureType,
        scope: procedure.scope,
        trustState: procedure.trustState,
        sourceRunId: procedure.sourceRunId,
        triggerPreview: procedure.intentTriggers.slice(0, 2).join(', ') || procedure.slug,
        updatedAt: procedure.updatedAt,
      })),
    playbooks: hostPlaybooks
      .slice(0, limit)
      .map((playbook) => ({
        id: playbook.id,
        title: playbook.title,
        hostPattern: playbook.hostPattern,
        scope: playbook.scope,
        trustState: playbook.trustState,
        successfulUses: playbook.successfulUses,
        securityFlagsCount: playbook.securityFlagsCount,
        lastUsedAt: playbook.lastUsedAt,
        updatedAt: playbook.updatedAt,
      })),
    sessions,
    warnings,
  }
}

function buildConsoleSessions(input: {
  securityEvents: AgentOpsBrowserTrustSecurityEvent[]
  sessionEvents: AgentOpsBrowserSessionEvent[]
  sessionShares: AgentOpsBrowserSessionShare[]
  sessionSharedActions: AgentOpsBrowserSessionSharedAction[]
}): BrowserOperatorConsoleSession[] {
  const eventsBySession = new Map<string, AgentOpsBrowserSessionEvent[]>()
  for (const event of input.sessionEvents) {
    const rows = eventsBySession.get(event.sessionKey) ?? []
    rows.push(event)
    eventsBySession.set(event.sessionKey, rows)
  }

  return Array.from(eventsBySession.entries())
    .map(([sessionKey, events]) => {
      const sortedEvents = [...events].sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt))
      const latest = sortedEvents[0]
      const browserSessionId = latest?.browserSessionId ?? null
      const sessionSecurityEvents = input.securityEvents.filter((event) =>
        Boolean(browserSessionId && event.browserSessionId === browserSessionId) ||
        event.browserSessionId === sessionKey
      )
      const shares = input.sessionShares.filter((share) => share.sessionKey === sessionKey)
      const sharedActions = input.sessionSharedActions.filter((action) => action.sessionKey === sessionKey)
      const blockingTrustEventCount = sessionSecurityEvents.filter((event) => event.severity === 'block').length
      const warningTrustEventCount = sessionSecurityEvents.filter((event) => event.severity === 'warn').length

      return {
        sessionKey,
        runId: latest?.runId ?? shares[0]?.runId ?? sharedActions[0]?.runId ?? '',
        browserSessionId,
        status: resolveSessionStatus(sortedEvents, sharedActions),
        trustState: blockingTrustEventCount > 0 ? 'blocked' : warningTrustEventCount > 0 ? 'degraded' : 'protected',
        latestEventType: latest?.eventType ?? 'heartbeat',
        latestMessage: latest?.message ?? null,
        currentUrl: latest?.currentUrl ?? null,
        screenshotUri: latest?.screenshotUri ?? null,
        handoffState: latest?.handoffState ?? null,
        eventCount: events.length,
        shareCount: shares.length,
        activeShareCount: shares.filter((share) => share.status === 'active').length,
        sharedActionCount: sharedActions.length,
        blockingTrustEventCount,
        warningTrustEventCount,
        updatedAt: latest?.createdAt ?? null,
      } satisfies BrowserOperatorConsoleSession
    })
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt))
}

function resolveSessionStatus(
  events: AgentOpsBrowserSessionEvent[],
  sharedActions: AgentOpsBrowserSessionSharedAction[],
): BrowserOperatorConsoleSessionStatus {
  const latestEvent = events[0]
  if (!latestEvent) return 'active'
  if (latestEvent.eventType === 'session_failed') return 'failed'
  if (latestEvent.eventType === 'session_completed') return 'completed'
  if (latestEvent.eventType === 'handoff_required') return 'handoff_required'
  if (
    latestEvent.eventType === 'handoff_resolved' ||
    latestEvent.eventType === 'session_resumed' ||
    sharedActions.some((action) => action.actionType === 'resume_requested' && action.status === 'allowed')
  ) {
    return 'resumable'
  }
  return 'active'
}

function resolveConsoleHealth(input: {
  procedureCount: number
  activeProcedureCount: number
  blockingTrustEventCount: number
  handoffSessionCount: number
}): BrowserOperatorConsoleHealth {
  if (input.procedureCount === 0) return 'empty'
  if (input.blockingTrustEventCount > 0) return 'blocked'
  if (input.handoffSessionCount > 0 || input.activeProcedureCount === 0) return 'needs_review'
  return 'ready'
}

function buildConsoleWarnings(input: {
  procedureCount: number
  activeProcedureCount: number
  playbookCount: number
  activePlaybookCount: number
  blockingTrustEventCount: number
  handoffSessionCount: number
}): string[] {
  const warnings: string[] = []
  if (input.procedureCount === 0) {
    warnings.push('No reusable Browser Operator procedures have been promoted yet.')
  } else if (input.activeProcedureCount === 0) {
    warnings.push('Browser procedures exist, but none are active.')
  }
  if (input.playbookCount > 0 && input.activePlaybookCount === 0) {
    warnings.push('Host playbooks exist, but all are quarantined or inactive.')
  }
  if (input.blockingTrustEventCount > 0) {
    warnings.push('Browser Trust Shield has blocking events that need review.')
  }
  if (input.handoffSessionCount > 0) {
    warnings.push('At least one live browser session is waiting for a human handoff.')
  }
  return warnings
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}
