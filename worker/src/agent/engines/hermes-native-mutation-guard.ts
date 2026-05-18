import type {
  EngineMutationPolicy,
  EngineNativeMutationCandidate,
  EngineNativeMutationKind,
} from '../contracts/mutation-policy.js'

export interface HermesNativeMutationGuardResult {
  blocked: boolean
  responseText?: string
  candidate?: EngineNativeMutationCandidate
}

const HERMES_NATIVE_TOOL_KIND_MAP: Record<string, EngineNativeMutationKind> = {
  memory: 'memory_write',
  skill_manage_create: 'skill_create',
  skill_manage_update: 'skill_update',
  skill_manage_delete: 'skill_delete',
  skill_manage: 'skill_update',
}

export function classifyHermesNativeMutationTool(toolName: string): EngineNativeMutationKind | null {
  return HERMES_NATIVE_TOOL_KIND_MAP[toolName] ?? null
}

export function guardHermesNativeMutationToolCall(
  policy: EngineMutationPolicy,
  toolName: string,
  toolArgs: Record<string, unknown> = {},
): HermesNativeMutationGuardResult {
  const kind = classifyHermesNativeMutationTool(toolName)
  if (!kind) {
    return { blocked: false }
  }

  const rule = policy.rules[kind]
  if (!rule || rule.mode === 'allow') {
    return { blocked: false }
  }

  if (rule.mode === 'candidate_only') {
    return {
      blocked: true,
      responseText:
        'This runtime accepts native mutation proposals only. Durable Hermes-native memory or skill changes are not committed directly here.',
      candidate: {
        engine: policy.engine,
        runtimeFlavor: policy.runtimeFlavor,
        kind,
        toolName,
        toolArgs,
        reason: rule.reason,
      },
    }
  }

  return {
    blocked: true,
    responseText: `Native Hermes mutation "${toolName}" is not allowed in this runtime. ${rule.reason}`,
  }
}
