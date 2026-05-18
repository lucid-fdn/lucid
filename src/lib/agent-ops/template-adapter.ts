import type { AgentOpsWorkflowHint, TemplateSpec } from '@contracts/template'

import { getAgentOpsWorkflow } from './workflow-registry'
import type { AgentOpsWorkflowDefinition, AgentOpsWorkflowId } from './workflow-types'

export interface TemplateAgentOpsWorkflow {
  binding: AgentOpsWorkflowHint
  workflow: AgentOpsWorkflowDefinition
}

export function listTemplateAgentOpsWorkflowIds(spec: TemplateSpec): AgentOpsWorkflowId[] {
  return (spec.ops_workflows ?? []).map((binding) => binding.workflow_id as AgentOpsWorkflowId)
}

export function resolveTemplateAgentOpsWorkflows(spec: TemplateSpec): TemplateAgentOpsWorkflow[] {
  return (spec.ops_workflows ?? []).map((binding) => ({
    binding,
    workflow: getAgentOpsWorkflow(binding.workflow_id as AgentOpsWorkflowId),
  }))
}
