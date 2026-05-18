import { z } from 'zod'

export const AGENT_OPS_BROWSER_SESSION_EVENT_TYPES = [
  'session_started',
  'navigated',
  'ready',
  'evidence_collected',
  'screenshot_captured',
  'handoff_required',
  'handoff_resolved',
  'session_resumed',
  'session_completed',
  'session_failed',
  'heartbeat',
] as const

export type AgentOpsBrowserSessionEventType =
  (typeof AGENT_OPS_BROWSER_SESSION_EVENT_TYPES)[number]

export const AGENT_OPS_BROWSER_SESSION_EVENT_SEVERITIES = ['info', 'warn', 'error'] as const

export type AgentOpsBrowserSessionEventSeverity =
  (typeof AGENT_OPS_BROWSER_SESSION_EVENT_SEVERITIES)[number]

export const AGENT_OPS_BROWSER_HANDOFF_STATES = [
  'auth_required',
  'captcha_required',
  'mfa_required',
  'destructive_confirmation_required',
  'human_judgment_required',
] as const

export type AgentOpsBrowserHandoffState =
  (typeof AGENT_OPS_BROWSER_HANDOFF_STATES)[number]

const metadataSchema = z.record(z.string(), z.unknown())

export const browserSessionEventSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  runId: z.string().uuid(),
  browserSessionId: z.string().uuid().nullable().optional(),
  sessionKey: z.string().min(1),
  eventType: z.enum(AGENT_OPS_BROWSER_SESSION_EVENT_TYPES),
  severity: z.enum(AGENT_OPS_BROWSER_SESSION_EVENT_SEVERITIES).default('info'),
  handoffState: z.enum(AGENT_OPS_BROWSER_HANDOFF_STATES).nullable().optional(),
  currentUrl: z.string().nullable().optional(),
  artifactId: z.string().uuid().nullable().optional(),
  screenshotUri: z.string().nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
  metadata: metadataSchema.default({}),
  createdAt: z.string().optional(),
})

export type AgentOpsBrowserSessionEvent = z.infer<typeof browserSessionEventSchema>

export interface BrowserLiveSessionRuntimeContext {
  schemaVersion: 1
  eventStream: 'agent_ops_browser_session_events'
  handoffStates: readonly AgentOpsBrowserHandoffState[]
  resumePolicy: 'human_resolves_then_agent_resumes'
}

export function buildBrowserLiveSessionRuntimeContext(): BrowserLiveSessionRuntimeContext {
  return {
    schemaVersion: 1,
    eventStream: 'agent_ops_browser_session_events',
    handoffStates: AGENT_OPS_BROWSER_HANDOFF_STATES,
    resumePolicy: 'human_resolves_then_agent_resumes',
  }
}

export function serializeBrowserLiveSessionForRuntime(
  context: BrowserLiveSessionRuntimeContext,
): Record<string, unknown> {
  return {
    schema_version: context.schemaVersion,
    event_stream: context.eventStream,
    handoff_states: [...context.handoffStates],
    resume_policy: context.resumePolicy,
  }
}

export function buildBrowserSessionTimelineEvents(input: {
  sessionKey: string
  targetUrl: string
  finalUrl?: string | null
  provider?: string | null
  targetId?: string | null
  screenshotUri?: string | null
  trustShieldState?: string | null
  handoffState?: AgentOpsBrowserHandoffState | null
  handoffMessage?: string | null
}): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [
    {
      session_key: input.sessionKey,
      event_type: 'session_started',
      severity: 'info',
      current_url: input.targetUrl,
      message: 'Browser Operator session started.',
      metadata: compact({
        provider: input.provider,
        target_id: input.targetId,
      }),
    },
    {
      session_key: input.sessionKey,
      event_type: 'navigated',
      severity: 'info',
      current_url: input.finalUrl ?? input.targetUrl,
      message: 'Browser navigated to the target URL.',
      metadata: compact({
        provider: input.provider,
        target_id: input.targetId,
      }),
    },
    {
      session_key: input.sessionKey,
      event_type: 'evidence_collected',
      severity: input.trustShieldState === 'blocked' ? 'warn' : 'info',
      current_url: input.finalUrl ?? input.targetUrl,
      screenshot_uri: input.screenshotUri,
      message: 'Browser evidence was collected for Mission Control.',
      metadata: compact({
        provider: input.provider,
        target_id: input.targetId,
        trust_shield_state: input.trustShieldState,
      }),
    },
  ]

  if (input.handoffState) {
    events.push({
      session_key: input.sessionKey,
      event_type: 'handoff_required',
      severity: 'warn',
      handoff_state: input.handoffState,
      current_url: input.finalUrl ?? input.targetUrl,
      message: input.handoffMessage ?? 'Browser Operator needs a human handoff before continuing.',
      metadata: compact({
        provider: input.provider,
        target_id: input.targetId,
      }),
    })
  } else {
    events.push({
      session_key: input.sessionKey,
      event_type: 'session_completed',
      severity: 'info',
      current_url: input.finalUrl ?? input.targetUrl,
      message: 'Browser Operator session completed.',
      metadata: compact({
        provider: input.provider,
        target_id: input.targetId,
      }),
    })
  }

  return events
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ''),
  )
}
