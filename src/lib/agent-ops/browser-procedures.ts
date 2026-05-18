import crypto from 'node:crypto'
import { z } from 'zod'

import type { AgentOpsCapabilityRequirement } from './workflow-types'

export const AGENT_OPS_BROWSER_PROCEDURE_TYPES = [
  'read_only',
  'mutating',
  'monitoring',
  'qa',
  'design',
  'devex',
] as const

export type AgentOpsBrowserProcedureType = (typeof AGENT_OPS_BROWSER_PROCEDURE_TYPES)[number]

export const AGENT_OPS_BROWSER_PROCEDURE_SCOPES = [
  'project',
  'org',
  'global_catalog',
] as const

export type AgentOpsBrowserProcedureScope = (typeof AGENT_OPS_BROWSER_PROCEDURE_SCOPES)[number]

export const AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES = [
  'draft',
  'quarantined',
  'active',
  'deprecated',
  'blocked',
] as const

export type AgentOpsBrowserProcedureTrustState = (typeof AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES)[number]

export const AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS = [
  'browser_operator_plan',
  'playwright_plan',
  'natural_language_playbook',
] as const

export type AgentOpsBrowserProcedureDefinitionKind =
  (typeof AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS)[number]

export const AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS = ['low', 'medium', 'high'] as const

export type AgentOpsBrowserProcedureRiskLevel =
  (typeof AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS)[number]

const metadataSchema = z.record(z.string(), z.unknown())
const nonEmptyStringArraySchema = z.array(z.string().trim().min(1).max(160)).default([])

export const browserProcedureSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  hostPattern: z.string().min(1).max(255),
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  intentTriggers: z.array(z.string()),
  procedureType: z.enum(AGENT_OPS_BROWSER_PROCEDURE_TYPES),
  scope: z.enum(AGENT_OPS_BROWSER_PROCEDURE_SCOPES),
  trustState: z.enum(AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES),
  sourceRunId: z.string().uuid().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdByAgentId: z.string().uuid().nullable(),
  metadata: metadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AgentOpsBrowserProcedure = z.infer<typeof browserProcedureSchema>

export const createBrowserProcedureInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  hostPattern: z.string().min(1).max(255).transform(normalizeBrowserHostPattern),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(2000),
  intentTriggers: nonEmptyStringArraySchema,
  procedureType: z.enum(AGENT_OPS_BROWSER_PROCEDURE_TYPES).default('read_only'),
  scope: z.enum(AGENT_OPS_BROWSER_PROCEDURE_SCOPES).default('project'),
  trustState: z.enum(AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES).default('draft'),
  sourceRunId: z.string().uuid().nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdByAgentId: z.string().uuid().nullable().optional(),
  metadata: metadataSchema.default({}),
}).superRefine((value, ctx) => {
  if (value.scope === 'project' && !value.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'Project-scoped browser procedures require a projectId.',
    })
  }
  if (value.scope !== 'project' && value.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'Only project-scoped browser procedures may include a projectId.',
    })
  }
})

export type CreateBrowserProcedureInput = z.input<typeof createBrowserProcedureInputSchema>

export const browserProcedureVersionSchema = z.object({
  id: z.string().uuid(),
  procedureId: z.string().uuid(),
  version: z.number().int().positive(),
  definitionKind: z.enum(AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS),
  definition: metadataSchema,
  fixtureArtifactId: z.string().uuid().nullable(),
  testDefinition: metadataSchema,
  capabilities: z.array(z.string()),
  riskLevel: z.enum(AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS),
  approvalPolicy: metadataSchema,
  contentHash: z.string(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
})

export type AgentOpsBrowserProcedureVersion = z.infer<typeof browserProcedureVersionSchema>

export const createBrowserProcedureVersionInputSchema = z.object({
  procedureId: z.string().uuid(),
  version: z.number().int().positive().optional(),
  definitionKind: z.enum(AGENT_OPS_BROWSER_PROCEDURE_DEFINITION_KINDS).default('browser_operator_plan'),
  definition: metadataSchema,
  fixtureArtifactId: z.string().uuid().nullable().optional(),
  testDefinition: metadataSchema.default({}),
  capabilities: z.array(z.string().min(1).max(160)).default(['tool:browser']),
  riskLevel: z.enum(AGENT_OPS_BROWSER_PROCEDURE_RISK_LEVELS).default('medium'),
  approvalPolicy: metadataSchema.default({}),
  contentHash: z.string().min(32).max(128).optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
})

export type CreateBrowserProcedureVersionInput = z.input<typeof createBrowserProcedureVersionInputSchema>

export const listBrowserProceduresInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  host: z.string().min(1).max(255).optional(),
  trustStates: z.array(z.enum(AGENT_OPS_BROWSER_PROCEDURE_TRUST_STATES)).optional(),
  procedureTypes: z.array(z.enum(AGENT_OPS_BROWSER_PROCEDURE_TYPES)).optional(),
  limit: z.number().int().positive().max(200).default(50),
})

export type ListBrowserProceduresInput = z.input<typeof listBrowserProceduresInputSchema>

export interface BrowserProcedureMatchInput {
  host?: string | null
  intent?: string | null
}

export interface RankedBrowserProcedureMatch {
  procedure: AgentOpsBrowserProcedure
  score: number
  reasons: string[]
}

export function normalizeBrowserProcedureSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

  return slug || 'browser-procedure'
}

export function normalizeBrowserHostPattern(value: string): string {
  const raw = value.trim().toLowerCase()
  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  return withoutProtocol.split('/')[0]?.replace(/:\d+$/, '') ?? withoutProtocol
}

export function browserProcedureMatchesHost(
  procedure: Pick<AgentOpsBrowserProcedure, 'hostPattern'>,
  host: string | null | undefined,
): boolean {
  if (!host) return true
  return browserHostMatchesPattern(host, procedure.hostPattern)
}

export function browserHostMatchesPattern(host: string, pattern: string): boolean {
  const normalizedHost = normalizeBrowserHostPattern(host)
  const normalizedPattern = normalizeBrowserHostPattern(pattern)
  if (normalizedPattern === '*' || normalizedPattern === normalizedHost) return true
  if (!normalizedPattern.startsWith('*.')) return false
  const suffix = normalizedPattern.slice(1)
  return normalizedHost.endsWith(suffix) && normalizedHost.length > suffix.length
}

export function buildBrowserProcedureContentHash(input: {
  definition: Record<string, unknown>
  testDefinition?: Record<string, unknown>
  capabilities?: readonly AgentOpsCapabilityRequirement[] | readonly string[]
  riskLevel?: AgentOpsBrowserProcedureRiskLevel
  approvalPolicy?: Record<string, unknown>
}): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify({
      definition: input.definition,
      testDefinition: input.testDefinition ?? {},
      capabilities: [...(input.capabilities ?? [])].sort(),
      riskLevel: input.riskLevel ?? 'medium',
      approvalPolicy: input.approvalPolicy ?? {},
    }))
    .digest('hex')
}

export function rankBrowserProcedureMatches(
  procedures: readonly AgentOpsBrowserProcedure[],
  input: BrowserProcedureMatchInput,
): RankedBrowserProcedureMatch[] {
  const normalizedHost = input.host ? normalizeBrowserHostPattern(input.host) : null
  const normalizedIntent = input.intent?.trim().toLowerCase() ?? ''

  return procedures
    .map((procedure) => scoreBrowserProcedure(procedure, normalizedHost, normalizedIntent))
    .filter((match) => match.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.procedure.updatedAt.localeCompare(a.procedure.updatedAt)
    })
}

function scoreBrowserProcedure(
  procedure: AgentOpsBrowserProcedure,
  normalizedHost: string | null,
  normalizedIntent: string,
): RankedBrowserProcedureMatch {
  let score = 0
  const reasons: string[] = []

  if (procedure.trustState === 'active') {
    score += 100
    reasons.push('active')
  } else if (procedure.trustState === 'draft') {
    score += 20
    reasons.push('draft')
  } else {
    return { procedure, score: 0, reasons: ['not_runnable'] }
  }

  if (normalizedHost) {
    if (!browserHostMatchesPattern(normalizedHost, procedure.hostPattern)) {
      return { procedure, score: 0, reasons: ['host_mismatch'] }
    }
    const pattern = normalizeBrowserHostPattern(procedure.hostPattern)
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

  if (procedure.scope === 'project') {
    score += 30
    reasons.push('project_scope')
  } else if (procedure.scope === 'org') {
    score += 20
    reasons.push('org_scope')
  } else {
    score += 5
    reasons.push('catalog_scope')
  }

  if (normalizedIntent) {
    const trigger = procedure.intentTriggers.find((candidate) => {
      const normalizedTrigger = candidate.trim().toLowerCase()
      return normalizedIntent === normalizedTrigger || normalizedIntent.includes(normalizedTrigger)
    })
    if (trigger) {
      score += 35
      reasons.push('intent_trigger')
    }
  }

  return { procedure, score, reasons }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}
