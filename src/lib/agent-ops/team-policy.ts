import { z } from 'zod'

import type {
  AgentOpsRun,
  AgentOpsScope,
  AgentOpsWorkflowDefinition,
  AgentOpsWorkflowId,
} from './workflow-types'

export const AGENT_OPS_TEAM_POLICY_LEVELS = ['required', 'recommended', 'optional'] as const
export type AgentOpsTeamPolicyLevel = (typeof AGENT_OPS_TEAM_POLICY_LEVELS)[number]

export const AGENT_OPS_TEAM_POLICY_GATE_TARGETS = ['ship', 'deploy', 'promotion'] as const
export type AgentOpsTeamPolicyGateTarget = (typeof AGENT_OPS_TEAM_POLICY_GATE_TARGETS)[number]

export interface AgentOpsTeamWorkflowPolicy {
  workflowId: AgentOpsWorkflowId
  level: AgentOpsTeamPolicyLevel
  gateTargets: readonly AgentOpsTeamPolicyGateTarget[]
  freshnessHours: number | null
  enabled: boolean
}

export interface AgentOpsTeamPolicy {
  workflows: readonly AgentOpsTeamWorkflowPolicy[]
  metadata: Record<string, unknown>
}

export interface AgentOpsTeamPolicyRunSnapshot {
  id: string
  workflowId: AgentOpsWorkflowId
  status: AgentOpsRun['status']
  scope: AgentOpsScope
  completedAt?: string | null
  updatedAt: string
  createdAt: string
}

export interface AgentOpsTeamPolicyRequirementState {
  workflowId: AgentOpsWorkflowId
  level: AgentOpsTeamPolicyLevel
  gateTargets: readonly AgentOpsTeamPolicyGateTarget[]
  freshnessHours: number | null
  satisfied: boolean
  lastRunId: string | null
  lastRunAt: string | null
  reason: string
}

export interface AgentOpsTeamPolicyGateEvaluation {
  allowed: boolean
  enforced: boolean
  targetGates: AgentOpsTeamPolicyGateTarget[]
  required: readonly AgentOpsTeamPolicyRequirementState[]
  recommended: readonly AgentOpsTeamPolicyRequirementState[]
  optional: readonly AgentOpsTeamPolicyRequirementState[]
  missingRequired: readonly AgentOpsTeamPolicyRequirementState[]
  summary: string
}

export const teamWorkflowPolicyInputSchema = z.object({
  workflow_id: z.enum([
    'investigate',
    'office-hours',
    'autoplan',
    'plan-ceo-review',
    'plan-eng-review',
    'plan-design-review',
    'plan-devex-review',
    'devex-review',
    'review',
    'qa',
    'ship',
    'canary',
    'retro',
    'cso',
    'security-audit',
    'design-review',
    'document-release',
    'release-check',
    'version-gate',
    'pr-title-sync',
    'product-quality-lint',
    'model-benchmark',
  ]),
  level: z.enum(AGENT_OPS_TEAM_POLICY_LEVELS),
  gate_targets: z.array(z.enum(AGENT_OPS_TEAM_POLICY_GATE_TARGETS)).default([]),
  freshness_hours: z.number().int().positive().max(8_760).nullable().optional(),
  enabled: z.boolean().optional().default(true),
}).strict()

export const teamPolicyInputSchema = z.object({
  workflows: z.array(teamWorkflowPolicyInputSchema).max(50).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type AgentOpsTeamPolicyInput = z.infer<typeof teamPolicyInputSchema>

const DEFAULT_AGENT_OPS_TEAM_POLICY = Object.freeze({
  workflows: [
    {
      workflowId: 'review',
      level: 'recommended',
      gateTargets: ['ship', 'deploy'],
      freshnessHours: 168,
      enabled: true,
    },
    {
      workflowId: 'qa',
      level: 'recommended',
      gateTargets: ['ship', 'deploy', 'promotion'],
      freshnessHours: 72,
      enabled: true,
    },
    {
      workflowId: 'release-check',
      level: 'recommended',
      gateTargets: ['ship', 'deploy', 'promotion'],
      freshnessHours: 72,
      enabled: true,
    },
    {
      workflowId: 'product-quality-lint',
      level: 'recommended',
      gateTargets: ['ship', 'deploy'],
      freshnessHours: 168,
      enabled: true,
    },
    {
      workflowId: 'document-release',
      level: 'recommended',
      gateTargets: ['promotion'],
      freshnessHours: 168,
      enabled: true,
    },
    {
      workflowId: 'version-gate',
      level: 'optional',
      gateTargets: ['deploy', 'promotion'],
      freshnessHours: 168,
      enabled: true,
    },
    {
      workflowId: 'pr-title-sync',
      level: 'optional',
      gateTargets: ['ship'],
      freshnessHours: 168,
      enabled: true,
    },
    {
      workflowId: 'canary',
      level: 'optional',
      gateTargets: ['promotion'],
      freshnessHours: 24,
      enabled: true,
    },
    {
      workflowId: 'retro',
      level: 'optional',
      gateTargets: [],
      freshnessHours: null,
      enabled: true,
    },
  ],
  metadata: Object.freeze({ source: 'default' }),
} satisfies AgentOpsTeamPolicy)

export function resolveAgentOpsTeamPolicy(metadata?: Record<string, unknown> | null): AgentOpsTeamPolicy {
  const raw = readRecord(metadata?.team_policy) ?? readRecord(metadata?.teamPolicy)
  if (!raw) return cloneTeamPolicy(DEFAULT_AGENT_OPS_TEAM_POLICY)

  const parsed = teamPolicyInputSchema.safeParse(raw)
  if (!parsed.success) return cloneTeamPolicy(DEFAULT_AGENT_OPS_TEAM_POLICY)

  const workflows = new Map<AgentOpsWorkflowId, AgentOpsTeamWorkflowPolicy>()
  for (const item of parsed.data.workflows) {
    workflows.set(item.workflow_id, {
      workflowId: item.workflow_id,
      level: item.level,
      gateTargets: [...new Set(item.gate_targets)].sort(),
      freshnessHours: item.freshness_hours ?? null,
      enabled: item.enabled,
    })
  }

  return {
    workflows: [...workflows.values()].sort((left, right) => left.workflowId.localeCompare(right.workflowId)),
    metadata: parsed.data.metadata,
  }
}

export function evaluateAgentOpsTeamPolicyGate(input: {
  policy: AgentOpsTeamPolicy
  workflow: AgentOpsWorkflowDefinition
  scope: AgentOpsScope
  completedRuns: AgentOpsTeamPolicyRunSnapshot[]
  now?: Date
}): AgentOpsTeamPolicyGateEvaluation {
  const now = input.now ?? new Date()
  const targetGates = resolveWorkflowGateTargets(input.workflow, input.scope)
  const activePolicies = input.policy.workflows.filter((policy) => policy.enabled)
  const matchingPolicies = activePolicies.filter((policy) =>
    policy.workflowId !== input.workflow.id
    && intersects(policy.gateTargets, targetGates),
  )
  const states = matchingPolicies.map((policy) => evaluateRequirement(policy, input.completedRuns, now))
  const required = states.filter((state) => state.level === 'required')
  const recommended = states.filter((state) => state.level === 'recommended')
  const optional = states.filter((state) => state.level === 'optional')
  const missingRequired = required.filter((state) => !state.satisfied)
  const enforced = targetGates.length > 0 && required.length > 0

  return {
    allowed: missingRequired.length === 0,
    enforced,
    targetGates,
    required,
    recommended,
    optional,
    missingRequired,
    summary: buildPolicyGateSummary({ targetGates, enforced, missingRequired }),
  }
}

export function buildAgentOpsTeamPolicyBlockedReason(evaluation: AgentOpsTeamPolicyGateEvaluation): string | null {
  if (evaluation.allowed) return null
  const missing = evaluation.missingRequired.map((item) => item.workflowId).join(', ')
  return `Agent Ops team policy blocked this run. Required workflow${evaluation.missingRequired.length === 1 ? '' : 's'} missing or stale: ${missing}.`
}

export function serializeAgentOpsTeamPolicyEvaluation(
  evaluation: AgentOpsTeamPolicyGateEvaluation,
): Record<string, unknown> {
  return {
    allowed: evaluation.allowed,
    enforced: evaluation.enforced,
    target_gates: evaluation.targetGates,
    required: evaluation.required,
    recommended: evaluation.recommended,
    optional: evaluation.optional,
    missing_required: evaluation.missingRequired,
    summary: evaluation.summary,
  }
}

function evaluateRequirement(
  policy: AgentOpsTeamWorkflowPolicy,
  completedRuns: AgentOpsTeamPolicyRunSnapshot[],
  now: Date,
): AgentOpsTeamPolicyRequirementState {
  const lastRun = completedRuns
    .filter((run) => run.workflowId === policy.workflowId && run.status === 'completed')
    .sort((left, right) => timestampForRun(right) - timestampForRun(left))[0] ?? null
  const lastRunAt = lastRun ? timestampStringForRun(lastRun) : null
  const fresh = !lastRun || policy.freshnessHours === null
    ? Boolean(lastRun)
    : now.getTime() - new Date(lastRunAt ?? 0).getTime() <= policy.freshnessHours * 60 * 60 * 1_000

  if (!lastRun) {
    return {
      workflowId: policy.workflowId,
      level: policy.level,
      gateTargets: policy.gateTargets,
      freshnessHours: policy.freshnessHours,
      satisfied: false,
      lastRunId: null,
      lastRunAt: null,
      reason: `No completed ${policy.workflowId} run found for this project.`,
    }
  }

  return {
    workflowId: policy.workflowId,
    level: policy.level,
    gateTargets: policy.gateTargets,
    freshnessHours: policy.freshnessHours,
    satisfied: fresh,
    lastRunId: lastRun.id,
    lastRunAt,
    reason: fresh
      ? `${policy.workflowId} satisfied by run ${lastRun.id}.`
      : `${policy.workflowId} is older than ${policy.freshnessHours} hour${policy.freshnessHours === 1 ? '' : 's'}.`,
  }
}

function resolveWorkflowGateTargets(
  workflow: AgentOpsWorkflowDefinition,
  scope: AgentOpsScope,
): AgentOpsTeamPolicyGateTarget[] {
  const targets = new Set<AgentOpsTeamPolicyGateTarget>()
  if (workflow.id === 'ship') {
    targets.add('ship')
    targets.add('deploy')
  }
  if (workflow.id === 'canary') targets.add('promotion')
  if (scope.type === 'deploy') targets.add('deploy')
  if (readString(scope.metadata.promotion) === 'true' || scope.metadata.promotion === true) targets.add('promotion')
  return [...targets].sort()
}

function buildPolicyGateSummary(input: {
  targetGates: AgentOpsTeamPolicyGateTarget[]
  enforced: boolean
  missingRequired: AgentOpsTeamPolicyRequirementState[]
}): string {
  if (input.targetGates.length === 0) return 'No team policy gate applies to this workflow.'
  if (!input.enforced) return 'No required team policy workflows apply to this gate.'
  if (input.missingRequired.length === 0) return 'All required team policy workflows are satisfied.'
  return `Missing or stale required workflows: ${input.missingRequired.map((item) => item.workflowId).join(', ')}.`
}

function timestampForRun(run: AgentOpsTeamPolicyRunSnapshot): number {
  return new Date(timestampStringForRun(run)).getTime()
}

function timestampStringForRun(run: AgentOpsTeamPolicyRunSnapshot): string {
  return run.completedAt ?? run.updatedAt ?? run.createdAt
}

function intersects<T>(left: readonly T[], right: readonly T[]): boolean {
  const values = new Set(right)
  return left.some((value) => values.has(value))
}

function cloneTeamPolicy(policy: AgentOpsTeamPolicy): AgentOpsTeamPolicy {
  return {
    workflows: policy.workflows.map((workflow) => ({
      ...workflow,
      gateTargets: [...workflow.gateTargets],
    })),
    metadata: { ...policy.metadata },
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
