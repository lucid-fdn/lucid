import { z } from 'zod'

import {
  browserHostMatchesPattern,
  normalizeBrowserHostPattern,
} from './browser-procedures'

export const AGENT_OPS_BROWSER_HOST_PLAYBOOK_SCOPES = [
  'project',
  'org',
  'global_catalog',
] as const

export type AgentOpsBrowserHostPlaybookScope =
  (typeof AGENT_OPS_BROWSER_HOST_PLAYBOOK_SCOPES)[number]

export const AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES = [
  'quarantined',
  'active',
  'deprecated',
  'blocked',
] as const

export type AgentOpsBrowserHostPlaybookTrustState =
  (typeof AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES)[number]

const metadataSchema = z.record(z.string(), z.unknown())

export const browserHostPlaybookSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  hostPattern: z.string().min(1).max(255),
  title: z.string().min(1).max(160),
  bodyMd: z.string().min(1).max(12000),
  scope: z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_SCOPES),
  trustState: z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES),
  successfulUses: z.number().int().min(0),
  securityFlagsCount: z.number().int().min(0),
  lastUsedAt: z.string().nullable(),
  sourceRunId: z.string().uuid().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdByAgentId: z.string().uuid().nullable(),
  metadata: metadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AgentOpsBrowserHostPlaybook = z.infer<typeof browserHostPlaybookSchema>

export const createBrowserHostPlaybookInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  hostPattern: z.string().min(1).max(255).transform(normalizeBrowserHostPattern),
  title: z.string().trim().min(1).max(160),
  bodyMd: z.string().trim().min(1).max(12000),
  scope: z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_SCOPES).default('project'),
  trustState: z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES).default('quarantined'),
  sourceRunId: z.string().uuid().nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdByAgentId: z.string().uuid().nullable().optional(),
  metadata: metadataSchema.default({}),
}).superRefine((value, ctx) => {
  if (value.scope === 'project' && !value.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'Project-scoped host playbooks require a projectId.',
    })
  }
  if (value.scope !== 'project' && value.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'Only project-scoped host playbooks may include a projectId.',
    })
  }
})

export type CreateBrowserHostPlaybookInput = z.input<typeof createBrowserHostPlaybookInputSchema>

export const listBrowserHostPlaybooksInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  host: z.string().min(1).max(255).optional(),
  trustStates: z.array(z.enum(AGENT_OPS_BROWSER_HOST_PLAYBOOK_TRUST_STATES)).optional(),
  limit: z.number().int().positive().max(200).default(50),
})

export type ListBrowserHostPlaybooksInput = z.input<typeof listBrowserHostPlaybooksInputSchema>

export interface BrowserHostPlaybookMatchInput {
  host?: string | null
  intent?: string | null
}

export interface RankedBrowserHostPlaybookMatch {
  playbook: AgentOpsBrowserHostPlaybook
  score: number
  reasons: string[]
}

export function rankBrowserHostPlaybookMatches(
  playbooks: readonly AgentOpsBrowserHostPlaybook[],
  input: BrowserHostPlaybookMatchInput,
): RankedBrowserHostPlaybookMatch[] {
  const normalizedHost = input.host ? normalizeBrowserHostPattern(input.host) : null
  const normalizedIntent = input.intent?.trim().toLowerCase() ?? ''

  return playbooks
    .map((playbook) => scoreBrowserHostPlaybook(playbook, normalizedHost, normalizedIntent))
    .filter((match) => match.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.playbook.updatedAt.localeCompare(a.playbook.updatedAt)
    })
}

export function buildBrowserHostPlaybookRuntimeContext(
  matches: readonly RankedBrowserHostPlaybookMatch[],
  limit = 3,
): Array<Record<string, unknown>> {
  return matches.slice(0, Math.max(1, Math.min(limit, 5))).map((match) => ({
    id: match.playbook.id,
    title: match.playbook.title,
    host_pattern: match.playbook.hostPattern,
    body_md: match.playbook.bodyMd.slice(0, 6000),
    scope: match.playbook.scope,
    trust_state: match.playbook.trustState,
    successful_uses: match.playbook.successfulUses,
    security_flags_count: match.playbook.securityFlagsCount,
    match_score: match.score,
    match_reasons: match.reasons,
    metadata: match.playbook.metadata,
  }))
}

function scoreBrowserHostPlaybook(
  playbook: AgentOpsBrowserHostPlaybook,
  normalizedHost: string | null,
  normalizedIntent: string,
): RankedBrowserHostPlaybookMatch {
  let score = 0
  const reasons: string[] = []

  if (playbook.trustState === 'active') {
    score += 100
    reasons.push('active')
  } else if (playbook.trustState === 'quarantined') {
    score += 10
    reasons.push('quarantined')
  } else {
    return { playbook, score: 0, reasons: ['not_runnable'] }
  }

  if (normalizedHost) {
    if (!browserHostMatchesPattern(normalizedHost, playbook.hostPattern)) {
      return { playbook, score: 0, reasons: ['host_mismatch'] }
    }
    const pattern = normalizeBrowserHostPattern(playbook.hostPattern)
    if (pattern === normalizedHost) {
      score += 40
      reasons.push('host_exact')
    } else if (pattern !== '*') {
      score += 25
      reasons.push('host_wildcard')
    } else {
      score += 5
      reasons.push('host_global')
    }
  }

  if (playbook.scope === 'project') {
    score += 30
    reasons.push('project_scope')
  } else if (playbook.scope === 'org') {
    score += 20
    reasons.push('org_scope')
  } else {
    score += 5
    reasons.push('catalog_scope')
  }

  if (playbook.securityFlagsCount === 0) {
    score += 10
    reasons.push('clean_security_history')
  } else {
    score -= Math.min(30, playbook.securityFlagsCount * 5)
    reasons.push('security_flags')
  }

  if (playbook.successfulUses > 0) {
    score += Math.min(25, playbook.successfulUses * 3)
    reasons.push('successful_uses')
  }

  if (normalizedIntent && playbook.title.toLowerCase().includes(normalizedIntent)) {
    score += 10
    reasons.push('title_intent')
  }

  return { playbook, score, reasons }
}
