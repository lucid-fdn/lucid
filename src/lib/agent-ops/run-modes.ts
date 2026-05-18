import type { AgentOpsRunMode, AgentOpsRunModePolicy } from '@contracts/agent-ops-run-mode'
import type { AgentOpsWorkflowDefinition, StartAgentOpsRunInput } from './workflow-types'

const READ_ONLY_MUTATIONS: string[] = []
const APPROVAL_GATED_MUTATIONS = ['prepare_draft', 'create_proposal', 'request_approval']
const WRITE_CAPABLE_MUTATIONS = ['write', 'browser_action', 'channel_report', 'project_update']

export function resolveAgentOpsRunModePolicy(input: {
  requestedMode?: AgentOpsRunMode | null
  workflow: AgentOpsWorkflowDefinition
  runInput: StartAgentOpsRunInput
  blockedReason?: string | null
}): AgentOpsRunModePolicy {
  const requestedMode = input.requestedMode ?? 'execute'

  if (input.blockedReason) {
    return {
      requestedMode,
      effectiveMode: 'blocked',
      reason: input.blockedReason,
      allowedMutations: [],
      requiredQuestions: [],
      antiShortcutApplied: true,
    }
  }

  if (requestedMode === 'blocked' || requestedMode === 'handoff') {
    return {
      requestedMode,
      effectiveMode: requestedMode,
      reason: requestedMode === 'blocked'
        ? 'The run was explicitly blocked before dispatch.'
        : 'The run is waiting for a human handoff before any agent action.',
      allowedMutations: [],
      requiredQuestions: [],
      antiShortcutApplied: true,
    }
  }

  if (requestedMode === 'plan_only') {
    return {
      requestedMode,
      effectiveMode: 'plan_only',
      reason: 'Planning mode only allows analysis, options, and next-step recommendations.',
      allowedMutations: [],
      requiredQuestions: requiredQuestionsForMutation(input.workflow, input.runInput),
      antiShortcutApplied: input.workflow.safetyMode !== 'read_only',
    }
  }

  if (requestedMode === 'review' || requestedMode === 'qa') {
    return {
      requestedMode,
      effectiveMode: requestedMode,
      reason: `${humanizeMode(requestedMode)} mode is verification-only and cannot mutate production state.`,
      allowedMutations: [],
      requiredQuestions: [],
      antiShortcutApplied: input.workflow.safetyMode !== 'read_only',
    }
  }

  if (input.workflow.safetyMode === 'read_only') {
    return {
      requestedMode,
      effectiveMode: 'execute',
      reason: 'This workflow is read-only; execution can collect evidence and report, but not mutate systems.',
      allowedMutations: READ_ONLY_MUTATIONS,
      requiredQuestions: [],
      antiShortcutApplied: false,
    }
  }

  if (input.workflow.safetyMode === 'approval_gated') {
    return {
      requestedMode,
      effectiveMode: 'execute',
      reason: 'This workflow may prepare changes, but production mutations remain approval-gated.',
      allowedMutations: APPROVAL_GATED_MUTATIONS,
      requiredQuestions: requiredQuestionsForMutation(input.workflow, input.runInput),
      antiShortcutApplied: false,
    }
  }

  return {
    requestedMode,
    effectiveMode: 'execute',
    reason: 'This workflow is allowed to execute with its declared runtime capabilities and policy gates.',
    allowedMutations: WRITE_CAPABLE_MUTATIONS,
    requiredQuestions: requiredQuestionsForMutation(input.workflow, input.runInput),
    antiShortcutApplied: false,
  }
}

function requiredQuestionsForMutation(
  workflow: AgentOpsWorkflowDefinition,
  input: StartAgentOpsRunInput,
): AgentOpsRunModePolicy['requiredQuestions'] {
  if (workflow.safetyMode === 'read_only') return []

  const questions: AgentOpsRunModePolicy['requiredQuestions'] = []
  const hasGoal = Boolean(
    String(input.input.goal ?? input.input.intent ?? input.scope.label ?? input.scope.ref ?? '').trim(),
  )
  if (!hasGoal) {
    questions.push({
      id: 'confirm-goal',
      prompt: 'What should this run change or prepare?',
      reason: 'Mutating workflows need an explicit operator goal before execution.',
      requiredBefore: workflow.id === 'ship' || workflow.id === 'canary' ? 'ship' : 'execute',
    })
  }

  if (workflow.approvalGates.length > 0) {
    questions.push({
      id: 'approval-owner',
      prompt: 'Who can approve this workflow if it reaches a gated step?',
      reason: 'Approval-gated workflows need an accountable reviewer before promotion.',
      requiredBefore: workflow.id === 'ship' || workflow.id === 'canary' ? 'ship' : 'execute',
    })
  }

  return questions
}

function humanizeMode(mode: AgentOpsRunMode): string {
  return mode.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
