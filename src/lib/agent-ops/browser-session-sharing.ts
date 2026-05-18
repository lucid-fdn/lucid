import crypto from 'node:crypto'
import { z } from 'zod'

export const AGENT_OPS_BROWSER_SHARE_SCOPES = [
  'read-only',
  'browser-drive',
  'screenshot-only',
  'handoff-only',
] as const

export type AgentOpsBrowserShareScope = (typeof AGENT_OPS_BROWSER_SHARE_SCOPES)[number]

export const AGENT_OPS_BROWSER_SHARE_STATUSES = ['active', 'revoked', 'expired'] as const

export type AgentOpsBrowserShareStatus = (typeof AGENT_OPS_BROWSER_SHARE_STATUSES)[number]

export const AGENT_OPS_BROWSER_SHARED_ACTION_TYPES = [
  'session_observed',
  'tab_assigned',
  'navigation_requested',
  'screenshot_requested',
  'handoff_requested',
  'handoff_resolved',
  'resume_requested',
  'action_blocked',
] as const

export type AgentOpsBrowserSharedActionType =
  (typeof AGENT_OPS_BROWSER_SHARED_ACTION_TYPES)[number]

export const AGENT_OPS_BROWSER_SHARED_ACTION_STATUSES = ['allowed', 'blocked', 'failed'] as const

export type AgentOpsBrowserSharedActionStatus =
  (typeof AGENT_OPS_BROWSER_SHARED_ACTION_STATUSES)[number]

const metadataSchema = z.record(z.string(), z.unknown())

export const browserSessionShareSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid(),
  sessionKey: z.string().min(1),
  tokenHash: z.string().min(32).optional(),
  tokenPrefix: z.string().min(6).max(24).optional(),
  scope: z.enum(AGENT_OPS_BROWSER_SHARE_SCOPES),
  status: z.enum(AGENT_OPS_BROWSER_SHARE_STATUSES).default('active'),
  grantedToAssistantId: z.string().uuid().nullable().optional(),
  grantedToRuntimeId: z.string().min(1).max(160).nullable().optional(),
  grantedToAgentLabel: z.string().min(1).max(160).nullable().optional(),
  tabIdentity: z.string().min(1).max(160).nullable().optional(),
  rateLimitPerMinute: z.number().int().positive().max(120).default(30),
  expiresAt: z.string(),
  createdByUserId: z.string().uuid().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  metadata: metadataSchema.default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export type AgentOpsBrowserSessionShare = z.infer<typeof browserSessionShareSchema>

export const browserSessionSharedActionSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid(),
  sessionKey: z.string().min(1),
  shareId: z.string().uuid().nullable().optional(),
  tokenPrefix: z.string().min(6).max(24).nullable().optional(),
  scope: z.enum(AGENT_OPS_BROWSER_SHARE_SCOPES).nullable().optional(),
  actionType: z.enum(AGENT_OPS_BROWSER_SHARED_ACTION_TYPES),
  status: z.enum(AGENT_OPS_BROWSER_SHARED_ACTION_STATUSES).default('allowed'),
  actorAssistantId: z.string().uuid().nullable().optional(),
  actorRuntimeId: z.string().min(1).max(160).nullable().optional(),
  actorAgentLabel: z.string().min(1).max(160).nullable().optional(),
  tabIdentity: z.string().min(1).max(160).nullable().optional(),
  currentUrl: z.string().nullable().optional(),
  artifactId: z.string().uuid().nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
  metadata: metadataSchema.default({}),
  createdAt: z.string().optional(),
})

export type AgentOpsBrowserSessionSharedAction =
  z.infer<typeof browserSessionSharedActionSchema>

export interface BrowserSessionShareSecret {
  token: string
  tokenHash: string
  tokenPrefix: string
}

export interface BrowserSessionSharingRuntimeContext {
  schemaVersion: 1
  tokenTable: 'agent_ops_browser_session_shares'
  actionTable: 'agent_ops_browser_session_actions'
  allowedScopes: readonly AgentOpsBrowserShareScope[]
  defaultTtlSeconds: number
  rateLimit: {
    actionsPerMinute: number
  }
  isolation: 'per_agent_tab'
  attributionRequired: true
  externalSharing: 'disabled_until_reviewed'
}

export function createBrowserSessionShareSecret(): BrowserSessionShareSecret {
  const token = `lucid_browser_share_${crypto.randomBytes(24).toString('base64url')}`
  return {
    token,
    tokenHash: hashBrowserSessionShareToken(token),
    tokenPrefix: token.slice(0, 24),
  }
}

export function hashBrowserSessionShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function buildBrowserSessionTabIdentity(input: {
  runId: string
  sessionKey: string
  assistantId?: string | null
  runtimeId?: string | null
  agentLabel?: string | null
}): string {
  const stable = [
    input.runId,
    input.sessionKey,
    input.assistantId ?? 'assistant:any',
    input.runtimeId ?? 'runtime:any',
    input.agentLabel ?? 'agent:any',
  ].join('|')
  return `tab_${crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16)}`
}

export function buildBrowserSessionSharingRuntimeContext(
  input: {
    defaultTtlSeconds?: number
    actionsPerMinute?: number
  } = {},
): BrowserSessionSharingRuntimeContext {
  return {
    schemaVersion: 1,
    tokenTable: 'agent_ops_browser_session_shares',
    actionTable: 'agent_ops_browser_session_actions',
    allowedScopes: AGENT_OPS_BROWSER_SHARE_SCOPES,
    defaultTtlSeconds: input.defaultTtlSeconds ?? 15 * 60,
    rateLimit: {
      actionsPerMinute: input.actionsPerMinute ?? 30,
    },
    isolation: 'per_agent_tab',
    attributionRequired: true,
    externalSharing: 'disabled_until_reviewed',
  }
}

export function serializeBrowserSessionSharingForRuntime(
  context: BrowserSessionSharingRuntimeContext,
): Record<string, unknown> {
  return {
    schema_version: context.schemaVersion,
    token_table: context.tokenTable,
    action_table: context.actionTable,
    allowed_scopes: [...context.allowedScopes],
    default_ttl_seconds: context.defaultTtlSeconds,
    rate_limit: {
      actions_per_minute: context.rateLimit.actionsPerMinute,
    },
    isolation: context.isolation,
    attribution_required: context.attributionRequired,
    external_sharing: context.externalSharing,
  }
}

export function buildBrowserSessionShareAction(input: {
  sessionKey: string
  actionType: AgentOpsBrowserSharedActionType
  status?: AgentOpsBrowserSharedActionStatus
  shareId?: string | null
  tokenPrefix?: string | null
  scope?: AgentOpsBrowserShareScope | null
  actorAssistantId?: string | null
  actorRuntimeId?: string | null
  actorAgentLabel?: string | null
  tabIdentity?: string | null
  currentUrl?: string | null
  artifactId?: string | null
  message?: string | null
  metadata?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    session_key: input.sessionKey,
    action_type: input.actionType,
    status: input.status ?? 'allowed',
    share_id: input.shareId ?? null,
    token_prefix: input.tokenPrefix ?? null,
    scope: input.scope ?? null,
    actor_assistant_id: input.actorAssistantId ?? null,
    actor_runtime_id: input.actorRuntimeId ?? null,
    actor_agent_label: input.actorAgentLabel ?? null,
    tab_identity: input.tabIdentity ?? null,
    current_url: input.currentUrl ?? null,
    artifact_id: input.artifactId ?? null,
    message: input.message ?? null,
    metadata: input.metadata ?? {},
  }
}
