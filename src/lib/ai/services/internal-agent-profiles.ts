import 'server-only'

export type InternalAgentProfileName =
  | 'builder-planner'
  | 'mission-control-copilot'

export interface InternalAgentProfile {
  name: InternalAgentProfileName
  backendEnvVar: string
  maxLlmCalls: number
  maxToolCalls: number
  maxWallTimeMs: number
  maxOutputTokens: number
  allowBuiltInSkills: boolean
  allowedTools: string[]
}

const INTERNAL_AGENT_PROFILES: Record<InternalAgentProfileName, InternalAgentProfile> = {
  'builder-planner': {
    name: 'builder-planner',
    backendEnvVar: 'LUCID_INTERNAL_BUILDER_BACKEND',
    maxLlmCalls: 4,
    maxToolCalls: 0,
    maxWallTimeMs: 45000,
    maxOutputTokens: 600,
    allowBuiltInSkills: false,
    allowedTools: [],
  },
  'mission-control-copilot': {
    name: 'mission-control-copilot',
    backendEnvVar: 'LUCID_INTERNAL_COPILOT_BACKEND',
    maxLlmCalls: 4,
    maxToolCalls: 0,
    maxWallTimeMs: 45000,
    maxOutputTokens: 1200,
    allowBuiltInSkills: false,
    allowedTools: [],
  },
}

export function getInternalAgentProfile(
  name: InternalAgentProfileName,
): InternalAgentProfile {
  return INTERNAL_AGENT_PROFILES[name]
}

export function resolveInternalAgentBackend(
  profile: InternalAgentProfile,
): 'worker-agent' | 'local-orchestrator' {
  return process.env[profile.backendEnvVar] === 'worker-agent'
    ? 'worker-agent'
    : 'local-orchestrator'
}
