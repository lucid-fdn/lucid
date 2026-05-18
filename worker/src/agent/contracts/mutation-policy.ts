import type { WorkerAgentEngine } from '../engines/types.js'

export type AgentRuntimeFlavor = 'shared' | 'c1_managed' | 'c2a_autonomous'
export type EngineNativeMutationKind = 'memory_write' | 'skill_create' | 'skill_update' | 'skill_delete'
export type EngineNativeMutationMode = 'deny' | 'allow' | 'candidate_only'

export interface EngineNativeMutationRule {
  kind: EngineNativeMutationKind
  mode: EngineNativeMutationMode
  reason: string
}

export interface EngineMutationPolicy {
  engine: WorkerAgentEngine
  runtimeFlavor: AgentRuntimeFlavor
  rules: Record<EngineNativeMutationKind, EngineNativeMutationRule>
}

export interface EngineNativeMutationCandidate {
  engine: WorkerAgentEngine
  runtimeFlavor: AgentRuntimeFlavor
  kind: EngineNativeMutationKind
  toolName: string
  toolArgs: Record<string, unknown>
  reason: string
}

const HERMES_SHARED_REASON =
  'Shared Hermes runs may read mounted memory and skills, but must not durably mutate Hermes-native memory or skills because the worker runtime is multi-tenant.'

// Explicit rollout choice: shared Hermes stays deny until a staged-learning
// rollout enables candidate_only intentionally.
export const HERMES_SHARED_NATIVE_MUTATION_ROLLOUT_MODE: EngineNativeMutationMode = 'deny'

function durableAllowed(kind: EngineNativeMutationKind): EngineNativeMutationRule {
  return {
    kind,
    mode: 'allow',
    reason: 'Dedicated or sovereign runtime identity can own durable native engine mutation.',
  }
}

function denied(kind: EngineNativeMutationKind, reason: string): EngineNativeMutationRule {
  return {
    kind,
    mode: 'deny',
    reason,
  }
}

function candidateOnly(kind: EngineNativeMutationKind, reason: string): EngineNativeMutationRule {
  return {
    kind,
    mode: 'candidate_only',
    reason,
  }
}

export function getEngineMutationPolicy(
  engine: WorkerAgentEngine,
  runtimeFlavor: string | null | undefined,
): EngineMutationPolicy {
  const normalizedRuntimeFlavor: AgentRuntimeFlavor =
    runtimeFlavor === 'c1_managed' || runtimeFlavor === 'c2a_autonomous' ? runtimeFlavor : 'shared'

  if (engine === 'hermes' && normalizedRuntimeFlavor === 'shared') {
    const sharedRuleFactory =
      HERMES_SHARED_NATIVE_MUTATION_ROLLOUT_MODE === 'candidate_only' ? candidateOnly : denied

    return {
      engine,
      runtimeFlavor: normalizedRuntimeFlavor,
      rules: {
        memory_write: sharedRuleFactory('memory_write', HERMES_SHARED_REASON),
        skill_create: sharedRuleFactory('skill_create', HERMES_SHARED_REASON),
        skill_update: sharedRuleFactory('skill_update', HERMES_SHARED_REASON),
        skill_delete: sharedRuleFactory('skill_delete', HERMES_SHARED_REASON),
      },
    }
  }

  return {
    engine,
    runtimeFlavor: normalizedRuntimeFlavor,
    rules: {
      memory_write: durableAllowed('memory_write'),
      skill_create: durableAllowed('skill_create'),
      skill_update: durableAllowed('skill_update'),
      skill_delete: durableAllowed('skill_delete'),
    },
  }
}

export function buildMutationPolicyPrompt(policy: EngineMutationPolicy): string {
  if (policy.engine !== 'hermes' || policy.runtimeFlavor !== 'shared') return ''

  const hasCandidateOnlyRule = Object.values(policy.rules).some((rule) => rule.mode === 'candidate_only')

  return [
    'Runtime mutation policy:',
    '- This Hermes run is on shared multi-tenant compute.',
    hasCandidateOnlyRule
      ? '- Hermes-native durable memory writes and skill_manage mutations are candidate-only in this runtime flavor and require later review before durable promotion.'
      : '- Hermes-native durable memory writes and skill_manage mutations are denied in this runtime flavor.',
    hasCandidateOnlyRule
      ? '- Do not assume Hermes-native memory or skill mutations are durably persisted here unless they are promoted later.'
      : '- Do not assume Hermes-native memory or skill mutations are durably persisted here.',
    hasCandidateOnlyRule
      ? '- Shared runs may emit candidate-only native mutation proposals for later review instead of committing durable engine-local state directly.'
      : '- A future candidate-only promotion path may exist, but it is not enabled in shared today.',
    '- Use mounted memory and catalog/imported skills as runtime inputs, not as proof of durable local Hermes state.',
  ].join('\n')
}
