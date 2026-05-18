import { z } from 'zod'

import { AgentOpsRunModeSchema } from '@contracts/agent-ops-run-mode'
import type { DagLeafStepType, DagRouteClass } from '@contracts/dag'
import type { Capability } from '@/lib/mission-control/capabilities'

export const AGENT_OPS_WORKFLOW_IDS = [
  'investigate',
  'office-hours',
  'autoplan',
  'plan-ceo-review',
  'plan-eng-review',
  'plan-design-review',
  'plan-devex-review',
  'devex-review',
  'design-consultation',
  'design-variants',
  'review',
  'qa',
  'check-page',
  'test-funnel',
  'buy-stuff',
  'research-site',
  'extract-data',
  'monitor-page',
  'update-portal',
  'support-repro',
  'ship',
  'canary',
  'retro',
  'cso',
  'security-audit',
  'design-review',
  'design-to-code',
  'devex-audit',
  'document-release',
  'release-check',
  'version-gate',
  'pr-title-sync',
  'product-quality-lint',
  'model-benchmark',
] as const

export type AgentOpsWorkflowId = (typeof AGENT_OPS_WORKFLOW_IDS)[number]

export const AGENT_OPS_OUTPUT_SECTIONS = [
  'summary',
  'findings',
  'evidence',
  'risks',
  'next_actions',
] as const

export type AgentOpsOutputSection = (typeof AGENT_OPS_OUTPUT_SECTIONS)[number]

export const AGENT_OPS_EVIDENCE_TYPES = [
  'screenshot',
  'console_log',
  'network_log',
  'perf_metric',
  'diff',
  'review_finding',
  'test_result',
  'deploy_url',
  'transcript',
  'model_benchmark',
  'mockup',
  'variant_board',
  'design_rationale',
  'memory_hit',
  'log_excerpt',
  'trace',
  'approval',
] as const

export type AgentOpsEvidenceType = (typeof AGENT_OPS_EVIDENCE_TYPES)[number]

export const AGENT_OPS_EXECUTION_MODES = ['single_run', 'dag'] as const
export type AgentOpsExecutionMode = (typeof AGENT_OPS_EXECUTION_MODES)[number]

export const AGENT_OPS_SAFETY_MODES = [
  'read_only',
  'approval_gated',
  'write_capable',
] as const

export type AgentOpsSafetyMode = (typeof AGENT_OPS_SAFETY_MODES)[number]

export const AGENT_OPS_SCOPE_TYPES = [
  'org',
  'project',
  'assistant',
  'runtime',
  'channel',
  'run',
  'repository',
  'pull_request',
  'branch',
  'deploy',
  'url',
  'incident',
] as const

export type AgentOpsScopeType = (typeof AGENT_OPS_SCOPE_TYPES)[number]

export const AGENT_OPS_RUN_STATUSES = [
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const

export type AgentOpsRunStatus = (typeof AGENT_OPS_RUN_STATUSES)[number]

export const AGENT_OPS_RUN_MODES = AgentOpsRunModeSchema.options
export type AgentOpsRunMode = z.infer<typeof AgentOpsRunModeSchema>

export const AGENT_OPS_FINDING_SEVERITIES = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
] as const

export type AgentOpsFindingSeverity = (typeof AGENT_OPS_FINDING_SEVERITIES)[number]

export const AGENT_OPS_FINDING_STATUSES = [
  'open',
  'accepted',
  'fixed',
  'dismissed',
  'needs_info',
] as const

export type AgentOpsFindingStatus = (typeof AGENT_OPS_FINDING_STATUSES)[number]

export type AgentOpsCapabilityRequirement =
  | Capability
  | `tool:${string}`
  | `runtime:${string}`
  | `channel:${string}`
  | `memory:${string}`
  | `eval:${string}`
  | `skill:${string}`
  | `browser:${string}`
  | `design:${string}`
  | `decision:${string}`

export const AGENT_OPS_RUNTIME_MODE_REQUIREMENTS = [
  'shared',
  'dedicated',
  'managed_dedicated',
  'autonomous_dedicated',
  'runtime_native',
] as const

export type AgentOpsRuntimeModeRequirement = (typeof AGENT_OPS_RUNTIME_MODE_REQUIREMENTS)[number]

const stringMapSchema = z.record(z.string(), z.unknown())

export const agentOpsInputFieldSchema = z.object({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(160),
  type: z.enum(['text', 'url', 'repo', 'branch', 'pull_request', 'deploy', 'json']),
  required: z.boolean().default(false),
  description: z.string().max(500).optional(),
  defaultValue: z.unknown().optional(),
})

export type AgentOpsInputField = z.infer<typeof agentOpsInputFieldSchema>

export const agentOpsApprovalGateSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(160),
  reason: z.string().min(1).max(500),
  requiredFor: z.array(z.string().min(1)).default([]),
})

export type AgentOpsApprovalGate = z.infer<typeof agentOpsApprovalGateSchema>

export const agentOpsEvalScenarioSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(160),
  assertion: z.string().min(1).max(1000),
  required: z.boolean().default(true),
})

export type AgentOpsEvalScenario = z.infer<typeof agentOpsEvalScenarioSchema>

export const agentOpsWorkflowStepSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(180),
  kind: z.enum(['prepare', 'execute', 'verify', 'approval', 'summarize']),
  stepType: z.enum(['inbound', 'outbound', 'scheduled', 'webhook', 'approval']).optional(),
  dependsOn: z.array(z.string().min(1)).default([]),
  runtimeTarget: z.string().min(1).optional(),
  routeClass: z.enum(['fast', 'strong', 'external']).optional(),
  payload: stringMapSchema.optional(),
})

export interface AgentOpsWorkflowStep {
  id: string
  title: string
  kind: 'prepare' | 'execute' | 'verify' | 'approval' | 'summarize'
  stepType?: DagLeafStepType
  dependsOn: string[]
  runtimeTarget?: string
  routeClass?: DagRouteClass
  payload?: Record<string, unknown>
}

export const agentOpsWorkflowSchema = z.object({
  id: z.enum(AGENT_OPS_WORKFLOW_IDS),
  slug: z.string().min(1).max(128),
  version: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(1000),
  promise: z.string().min(1).max(240),
  triggerPhrases: z.array(z.string().min(1)).min(1),
  defaultAgentRole: z.string().min(1).max(160),
  executionMode: z.enum(AGENT_OPS_EXECUTION_MODES),
  safetyMode: z.enum(AGENT_OPS_SAFETY_MODES),
  requiredCapabilities: z.array(z.string().min(1)).default([]),
  compatibleRuntimeModes: z.array(z.enum(AGENT_OPS_RUNTIME_MODE_REQUIREMENTS)).default([]),
  capabilityFallbacks: z.record(z.string(), z.array(z.string().min(1))).default({}),
  inputFields: z.array(agentOpsInputFieldSchema).default([]),
  outputSections: z.array(z.enum(AGENT_OPS_OUTPUT_SECTIONS)).min(1),
  evidenceTypes: z.array(z.enum(AGENT_OPS_EVIDENCE_TYPES)).default([]),
  approvalGates: z.array(agentOpsApprovalGateSchema).default([]),
  evalPack: z.array(agentOpsEvalScenarioSchema).default([]),
  steps: z.array(agentOpsWorkflowStepSchema).default([]),
  metadata: stringMapSchema.default({}),
})

export type AgentOpsWorkflowDefinitionInput = z.input<typeof agentOpsWorkflowSchema>

export interface AgentOpsWorkflowDefinition {
  id: AgentOpsWorkflowId
  slug: string
  version: string
  name: string
  description: string
  promise: string
  triggerPhrases: string[]
  defaultAgentRole: string
  executionMode: AgentOpsExecutionMode
  safetyMode: AgentOpsSafetyMode
  requiredCapabilities: AgentOpsCapabilityRequirement[]
  compatibleRuntimeModes: AgentOpsRuntimeModeRequirement[]
  capabilityFallbacks: Partial<Record<AgentOpsCapabilityRequirement, AgentOpsCapabilityRequirement[]>>
  inputFields: AgentOpsInputField[]
  outputSections: AgentOpsOutputSection[]
  evidenceTypes: AgentOpsEvidenceType[]
  approvalGates: AgentOpsApprovalGate[]
  evalPack: AgentOpsEvalScenario[]
  steps: AgentOpsWorkflowStep[]
  metadata: Record<string, unknown>
}

export const agentOpsScopeSchema = z.object({
  type: z.enum(AGENT_OPS_SCOPE_TYPES),
  ref: z.string().min(1).max(500).optional(),
  label: z.string().max(240).optional(),
  metadata: stringMapSchema.default({}),
})

export type AgentOpsScope = z.infer<typeof agentOpsScopeSchema>

export const agentOpsRunSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  requestedByUserId: z.string().uuid().nullable().optional(),
  workflowId: z.enum(AGENT_OPS_WORKFLOW_IDS),
  workflowVersion: z.string().min(1),
  status: z.enum(AGENT_OPS_RUN_STATUSES),
  runMode: AgentOpsRunModeSchema.default('execute'),
  scope: agentOpsScopeSchema,
  input: stringMapSchema.default({}),
  output: stringMapSchema.nullable().optional(),
  agentRunIds: z.array(z.string().uuid()).default([]),
  orchestrationDagId: z.string().uuid().nullable().optional(),
  humanWorkItemIds: z.array(z.string().uuid()).default([]),
  approvalIds: z.array(z.string().uuid()).default([]),
  artifactCount: z.number().int().min(0).default(0),
  findingCount: z.number().int().min(0).default(0),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  costUsd: z.number().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadata: stringMapSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AgentOpsRun = z.infer<typeof agentOpsRunSchema>

export const startAgentOpsRunInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  requestedByUserId: z.string().uuid().nullable().optional(),
  workflowId: z.enum(AGENT_OPS_WORKFLOW_IDS),
  runMode: AgentOpsRunModeSchema.optional().default('execute'),
  scope: agentOpsScopeSchema,
  input: stringMapSchema.default({}),
  metadata: stringMapSchema.default({}),
})

export type StartAgentOpsRunInput = z.infer<typeof startAgentOpsRunInputSchema>

export const agentOpsArtifactSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  runId: z.string().uuid(),
  type: z.enum(AGENT_OPS_EVIDENCE_TYPES),
  title: z.string().min(1).max(240),
  summary: z.string().max(1000).nullable().optional(),
  uri: z.string().max(2048).nullable().optional(),
  content: stringMapSchema.default({}),
  checksum: z.string().max(160).nullable().optional(),
  createdAt: z.string(),
})

export type AgentOpsArtifact = z.infer<typeof agentOpsArtifactSchema>

export const AGENT_OPS_BROWSER_QA_SESSION_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'expired',
  'handoff_required',
  'waiting_for_human',
  'resumed',
] as const

export type AgentOpsBrowserQaSessionStatus =
  (typeof AGENT_OPS_BROWSER_QA_SESSION_STATUSES)[number]

export const agentOpsBrowserQaSessionSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  runId: z.string().uuid(),
  assistantId: z.string().uuid().nullable().optional(),
  sessionKey: z.string().min(1),
  targetUrl: z.string().url(),
  status: z.enum(AGENT_OPS_BROWSER_QA_SESSION_STATUSES),
  ownerRuntimeId: z.string().uuid().nullable().optional(),
  viewport: stringMapSchema.default({}),
  artifactCount: z.number().int().min(0).default(0),
  lastArtifactId: z.string().uuid().nullable().optional(),
  lastError: z.string().nullable().optional(),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  expiresAt: z.string(),
  metadata: stringMapSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AgentOpsBrowserQaSession = z.infer<typeof agentOpsBrowserQaSessionSchema>

export const appendAgentOpsArtifactInputSchema = z.object({
  orgId: z.string().uuid(),
  runId: z.string().uuid(),
  type: z.enum(AGENT_OPS_EVIDENCE_TYPES),
  title: z.string().min(1).max(240),
  summary: z.string().max(1000).nullable().optional(),
  uri: z.string().max(2048).nullable().optional(),
  content: stringMapSchema.default({}),
  checksum: z.string().max(160).nullable().optional(),
})

export type AppendAgentOpsArtifactInput = z.infer<typeof appendAgentOpsArtifactInputSchema>

export const agentOpsFindingSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  runId: z.string().uuid(),
  severity: z.enum(AGENT_OPS_FINDING_SEVERITIES),
  status: z.enum(AGENT_OPS_FINDING_STATUSES),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(4000),
  filePath: z.string().max(1000).nullable().optional(),
  startLine: z.number().int().positive().nullable().optional(),
  endLine: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidenceArtifactId: z.string().uuid().nullable().optional(),
  fingerprint: z.string().max(200).nullable().optional(),
  metadata: stringMapSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AgentOpsFinding = z.infer<typeof agentOpsFindingSchema>

export const appendAgentOpsFindingInputSchema = z.object({
  orgId: z.string().uuid(),
  runId: z.string().uuid(),
  severity: z.enum(AGENT_OPS_FINDING_SEVERITIES),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(4000),
  filePath: z.string().max(1000).nullable().optional(),
  startLine: z.number().int().positive().nullable().optional(),
  endLine: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidenceArtifactId: z.string().uuid().nullable().optional(),
  fingerprint: z.string().max(200).nullable().optional(),
  metadata: stringMapSchema.default({}),
})

export type AppendAgentOpsFindingInput = z.infer<typeof appendAgentOpsFindingInputSchema>
