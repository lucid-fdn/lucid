import { z } from 'zod'

import type { AgentOpsCapabilityRequirement, AgentOpsWorkflowDefinition } from './workflow-types'

export const agentOpsWorkGraphContextSchema = z.object({
  goal_id: z.string().uuid().optional(),
  work_item_id: z.string().uuid().optional(),
  checkout_id: z.string().uuid().optional(),
  board_id: z.string().uuid().optional(),
  required_capabilities: z.array(z.string().min(1).max(160)).default([]),
  source: z.enum(['project_work', 'planner', 'api', 'external_pm']).optional(),
})

export type AgentOpsWorkGraphContext = z.infer<typeof agentOpsWorkGraphContextSchema>

export function parseAgentOpsWorkGraphContext(
  metadata: Record<string, unknown> | null | undefined,
): AgentOpsWorkGraphContext | null {
  const raw = metadata?.work_graph
  if (!raw || typeof raw !== 'object') return null
  const parsed = agentOpsWorkGraphContextSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function buildAgentOpsWorkflowWithWorkGraphRequirements(
  workflow: AgentOpsWorkflowDefinition,
  metadata: Record<string, unknown> | null | undefined,
): AgentOpsWorkflowDefinition {
  const context = parseAgentOpsWorkGraphContext(metadata)
  if (!context || context.required_capabilities.length === 0) return workflow

  const requiredCapabilities = uniqueCapabilityRequirements([
    ...workflow.requiredCapabilities,
    ...context.required_capabilities.map((capability) => capability as AgentOpsCapabilityRequirement),
  ])

  if (requiredCapabilities.length === workflow.requiredCapabilities.length) return workflow

  return {
    ...workflow,
    requiredCapabilities,
    metadata: {
      ...workflow.metadata,
      work_graph_required_capabilities: context.required_capabilities,
    },
  }
}

function uniqueCapabilityRequirements(
  values: readonly AgentOpsCapabilityRequirement[],
): AgentOpsCapabilityRequirement[] {
  return [...new Set(values)].sort() as AgentOpsCapabilityRequirement[]
}
