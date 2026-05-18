import type { AgentOpsScopeType, AgentOpsWorkflowId } from './workflow-types'

type AgentOpsLaunchSearchParams = Pick<URLSearchParams, 'forEach' | 'get'> | null | undefined

export interface AgentOpsContextLaunchInput {
  workspaceSlug: string
  workflowId: AgentOpsWorkflowId
  source: 'mission_control' | 'project' | 'assistant' | 'run' | 'deploy' | 'channel'
  projectId?: string | null
  assistantId?: string | null
  scopeType?: AgentOpsScopeType
  scopeRef?: string | null
  scopeLabel?: string | null
  inputDefaults?: Record<string, string | null | undefined>
}

export function buildAgentOpsLaunchHref(input: AgentOpsContextLaunchInput): string {
  const params = new URLSearchParams()
  params.set('workflow_id', input.workflowId)
  params.set('source', input.source)
  if (input.projectId) params.set('project_id', input.projectId)
  if (input.assistantId) params.set('assistant_id', input.assistantId)
  if (input.scopeType) params.set('scope_type', input.scopeType)
  if (input.scopeRef) params.set('scope_ref', input.scopeRef)
  if (input.scopeLabel) params.set('scope_label', input.scopeLabel)

  for (const [key, value] of Object.entries(input.inputDefaults ?? {})) {
    if (value) params.set(`input_${key}`, value)
  }

  return `/${encodeURIComponent(input.workspaceSlug)}/mission-control/agent-ops?${params.toString()}`
}

export function parseAgentOpsLaunchParams(searchParams: AgentOpsLaunchSearchParams): {
  workflowId?: string
  projectId?: string
  assistantId?: string
  scopeType?: string
  scopeRef?: string
  scopeLabel?: string
  source?: string
  inputDefaults: Record<string, string>
} {
  const inputDefaults: Record<string, string> = {}
  searchParams?.forEach((value, key) => {
    if (key.startsWith('input_') && value) {
      inputDefaults[key.slice('input_'.length)] = value
    }
  })

  return {
    workflowId: searchParams?.get('workflow_id') ?? undefined,
    projectId: searchParams?.get('project_id') ?? undefined,
    assistantId: searchParams?.get('assistant_id') ?? undefined,
    scopeType: searchParams?.get('scope_type') ?? undefined,
    scopeRef: searchParams?.get('scope_ref') ?? undefined,
    scopeLabel: searchParams?.get('scope_label') ?? undefined,
    source: searchParams?.get('source') ?? undefined,
    inputDefaults,
  }
}
