import { z } from 'zod'

export const AGENT_OPS_DECISION_DOOR_TYPES = ['one_way', 'two_way'] as const
export type AgentOpsDecisionDoorType = (typeof AGENT_OPS_DECISION_DOOR_TYPES)[number]

export const AGENT_OPS_DECISION_MODES = [
  'asked',
  'auto_applied',
  'silent_decision',
  'flipped',
] as const
export type AgentOpsDecisionMode = (typeof AGENT_OPS_DECISION_MODES)[number]

export const AGENT_OPS_DECISION_PHASES = [
  'scope',
  'plan',
  'execute',
  'review',
  'ship',
  'monitor',
  'retro',
] as const
export type AgentOpsDecisionPhase = (typeof AGENT_OPS_DECISION_PHASES)[number]

export interface AgentOpsQuestionOption {
  id: string
  label: string
  description: string
  reversible: boolean
}

export interface AgentOpsQuestionRegistryItem {
  id: string
  phase: AgentOpsDecisionPhase
  doorType: AgentOpsDecisionDoorType
  question: string
  options: readonly AgentOpsQuestionOption[]
  defaultOptionId: string
  interruptionBudgetKey: string
  riskReason: string
}

export const AGENT_OPS_QUESTION_REGISTRY = Object.freeze([
  {
    id: 'review-depth',
    phase: 'plan',
    doorType: 'two_way',
    question: 'How deep should this review run?',
    defaultOptionId: 'standard',
    interruptionBudgetKey: 'plan',
    riskReason: 'Review depth can be changed by rerunning or retrying with a heavier dispatch tier.',
    options: [
      { id: 'fast', label: 'Fast pass', description: 'Use a lighter review for low-risk changes.', reversible: true },
      { id: 'standard', label: 'Standard pass', description: 'Use the normal Agent Ops specialist set.', reversible: true },
      { id: 'heavy', label: 'Heavy pass', description: 'Use broader specialists and stronger verification.', reversible: true },
    ],
  },
  {
    id: 'browser-mutation',
    phase: 'execute',
    doorType: 'one_way',
    question: 'Should Browser Operator perform a mutating action?',
    defaultOptionId: 'ask',
    interruptionBudgetKey: 'execute',
    riskReason: 'Mutating browser actions can change external state and must be visible.',
    options: [
      { id: 'ask', label: 'Ask first', description: 'Pause for operator approval before mutation.', reversible: false },
      { id: 'block', label: 'Block', description: 'Do not allow this mutation in the current run.', reversible: true },
    ],
  },
  {
    id: 'release-promotion',
    phase: 'ship',
    doorType: 'one_way',
    question: 'Should this run promote, deploy, or publish externally?',
    defaultOptionId: 'ask',
    interruptionBudgetKey: 'ship',
    riskReason: 'Release promotion is a one-way safety decision and is never hidden.',
    options: [
      { id: 'ask', label: 'Ask first', description: 'Require explicit human approval.', reversible: false },
      { id: 'hold', label: 'Hold', description: 'Stop before external promotion.', reversible: true },
    ],
  },
  {
    id: 'docs-copy-style',
    phase: 'review',
    doorType: 'two_way',
    question: 'Which copy style should Agent Ops use for docs/release output?',
    defaultOptionId: 'plain',
    interruptionBudgetKey: 'review',
    riskReason: 'Copy style can be changed after generation without damaging product state.',
    options: [
      { id: 'plain', label: 'Plain', description: 'Use direct, low-jargon language.', reversible: true },
      { id: 'executive', label: 'Executive', description: 'Use concise business-oriented framing.', reversible: true },
      { id: 'technical', label: 'Technical', description: 'Use implementation-focused detail.', reversible: true },
    ],
  },
] satisfies readonly AgentOpsQuestionRegistryItem[])

export interface AgentOpsDecisionBudget {
  phase: AgentOpsDecisionPhase
  maxTwoWayPrompts: number
  usedTwoWayPrompts: number
  remainingTwoWayPrompts: number
  oneWayAlwaysAsk: true
}

export interface AgentOpsDecisionPacingResult {
  question: AgentOpsQuestionRegistryItem
  mode: Exclude<AgentOpsDecisionMode, 'flipped'>
  selectedOption: AgentOpsQuestionOption
  shouldInterrupt: boolean
  reversible: boolean
  reason: string
  budget: AgentOpsDecisionBudget
}

const jsonObjectSchema = z.record(z.string(), z.unknown())

export const decisionEventSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().nullable().optional(),
  phase: z.enum(AGENT_OPS_DECISION_PHASES),
  questionId: z.string().min(1).max(160),
  doorType: z.enum(AGENT_OPS_DECISION_DOOR_TYPES),
  decisionMode: z.enum(AGENT_OPS_DECISION_MODES),
  question: z.string().min(1).max(1000),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    reversible: z.boolean(),
  })).default([]),
  selectedOption: jsonObjectSchema.nullable().optional(),
  riskReason: z.string().max(1000).nullable().optional(),
  reversible: z.boolean().default(true),
  flippedFromEventId: z.string().uuid().nullable().optional(),
  metadata: jsonObjectSchema.default({}),
  createdByUserId: z.string().uuid().nullable().optional(),
  createdAt: z.string().optional(),
})

export type AgentOpsDecisionEvent = z.infer<typeof decisionEventSchema>

export function listAgentOpsQuestionRegistry(): readonly AgentOpsQuestionRegistryItem[] {
  return AGENT_OPS_QUESTION_REGISTRY
}

export function getAgentOpsQuestion(questionId: string): AgentOpsQuestionRegistryItem | null {
  return AGENT_OPS_QUESTION_REGISTRY.find((question) => question.id === questionId) ?? null
}

export function buildDecisionBudget(input: {
  phase: AgentOpsDecisionPhase
  usedTwoWayPrompts?: number
  maxTwoWayPrompts?: number
}): AgentOpsDecisionBudget {
  const maxTwoWayPrompts = Math.max(0, input.maxTwoWayPrompts ?? defaultBudgetForPhase(input.phase))
  const usedTwoWayPrompts = Math.max(0, input.usedTwoWayPrompts ?? 0)
  return {
    phase: input.phase,
    maxTwoWayPrompts,
    usedTwoWayPrompts,
    remainingTwoWayPrompts: Math.max(0, maxTwoWayPrompts - usedTwoWayPrompts),
    oneWayAlwaysAsk: true,
  }
}

export function evaluateDecisionPacing(input: {
  questionId: string
  preferredOptionId?: string | null
  usedTwoWayPrompts?: number
  maxTwoWayPrompts?: number
}): AgentOpsDecisionPacingResult {
  const question = getAgentOpsQuestion(input.questionId)
  if (!question) {
    throw new Error(`Unknown Agent Ops decision question: ${input.questionId}`)
  }
  const budget = buildDecisionBudget({
    phase: question.phase,
    usedTwoWayPrompts: input.usedTwoWayPrompts,
    maxTwoWayPrompts: input.maxTwoWayPrompts,
  })
  const preferred = question.options.find((option) => option.id === input.preferredOptionId)
  const selectedOption = preferred ?? question.options.find((option) => option.id === question.defaultOptionId) ?? question.options[0]

  if (question.doorType === 'one_way') {
    return {
      question,
      mode: 'asked',
      selectedOption,
      shouldInterrupt: true,
      reversible: false,
      reason: 'One-way safety decisions are uncapped and always visible.',
      budget,
    }
  }

  if (preferred) {
    return {
      question,
      mode: 'auto_applied',
      selectedOption,
      shouldInterrupt: false,
      reversible: selectedOption.reversible,
      reason: 'A trusted decision preference matched this low-risk/two-way question.',
      budget,
    }
  }

  if (budget.remainingTwoWayPrompts <= 0) {
    return {
      question,
      mode: 'silent_decision',
      selectedOption,
      shouldInterrupt: false,
      reversible: selectedOption.reversible,
      reason: 'Two-way prompt budget is exhausted; selected default is visible and flippable.',
      budget,
    }
  }

  return {
    question,
    mode: 'asked',
    selectedOption,
    shouldInterrupt: true,
    reversible: selectedOption.reversible,
    reason: 'Question is within the phase interruption budget.',
    budget,
  }
}

export function serializeDecisionPacingForRuntime(): Record<string, unknown> {
  return {
    schema_version: 1,
    event_table: 'agent_ops_decision_events',
    registry: AGENT_OPS_QUESTION_REGISTRY.map((question) => ({
      id: question.id,
      phase: question.phase,
      door_type: question.doorType,
      question: question.question,
      default_option_id: question.defaultOptionId,
      interruption_budget_key: question.interruptionBudgetKey,
      risk_reason: question.riskReason,
      options: question.options,
    })),
    policy: {
      one_way_always_ask: true,
      two_way_budgeted: true,
      silent_decisions_visible: true,
      flip_supported: true,
    },
  }
}

function defaultBudgetForPhase(phase: AgentOpsDecisionPhase): number {
  if (phase === 'ship') return 1
  if (phase === 'execute') return 2
  if (phase === 'retro') return 3
  return 2
}
