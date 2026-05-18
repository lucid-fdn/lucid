import { dagSpecSchema, type DagSpec, type DagSpecNode } from '@contracts/dag'

import type { AgentOpsWorkflowDefinition, AgentOpsWorkflowStep } from './workflow-types'

export function buildAgentOpsDagSpec(workflow: AgentOpsWorkflowDefinition): DagSpec {
  if (workflow.executionMode !== 'dag') {
    throw new Error(`Agent Ops workflow ${workflow.id} is not DAG-backed`)
  }
  if (workflow.steps.length === 0) {
    throw new Error(`DAG-backed Agent Ops workflow ${workflow.id} has no steps`)
  }

  assertUniqueStepIds(workflow.steps, workflow.id)
  assertValidDependencies(workflow.steps, workflow.id)
  assertAcyclic(workflow.steps, workflow.id)

  const nodes: DagSpecNode[] = workflow.steps.map((step) => ({
    node_key: step.id,
    node_type: step.kind === 'approval' ? 'approval' : 'leaf',
    step_type: step.stepType ?? (step.kind === 'approval' ? 'approval' : 'scheduled'),
    runtime_target: step.runtimeTarget,
    route_class: step.routeClass ?? 'strong',
    payload: {
      agent_ops: {
        workflow_id: workflow.id,
        workflow_version: workflow.version,
        step_id: step.id,
        step_title: step.title,
      },
      ...(step.payload ?? {}),
    },
  }))

  const edges = workflow.steps.flatMap((step) =>
    step.dependsOn.map((parent) => ({
      parent,
      child: step.id,
      edge_kind: 'order' as const,
    })),
  )

  return dagSpecSchema.parse({
    nodes,
    edges,
    metadata: {
      agent_ops: {
        workflow_id: workflow.id,
        workflow_slug: workflow.slug,
        workflow_version: workflow.version,
        output_sections: workflow.outputSections,
        evidence_types: workflow.evidenceTypes,
      },
    },
  })
}

function assertUniqueStepIds(steps: readonly AgentOpsWorkflowStep[], workflowId: string): void {
  const seen = new Set<string>()
  for (const step of steps) {
    if (seen.has(step.id)) {
      throw new Error(`Agent Ops workflow ${workflowId} has duplicate step id: ${step.id}`)
    }
    seen.add(step.id)
  }
}

function assertValidDependencies(steps: readonly AgentOpsWorkflowStep[], workflowId: string): void {
  const ids = new Set(steps.map((step) => step.id))
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Agent Ops workflow ${workflowId} step ${step.id} depends on missing step ${dependency}`)
      }
      if (dependency === step.id) {
        throw new Error(`Agent Ops workflow ${workflowId} step ${step.id} depends on itself`)
      }
    }
  }
}

function assertAcyclic(steps: readonly AgentOpsWorkflowStep[], workflowId: string): void {
  const byId = new Map(steps.map((step) => [step.id, step]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (stepId: string): void => {
    if (visited.has(stepId)) return
    if (visiting.has(stepId)) {
      throw new Error(`Agent Ops workflow ${workflowId} has a dependency cycle at step ${stepId}`)
    }

    visiting.add(stepId)
    const step = byId.get(stepId)
    for (const dependency of step?.dependsOn ?? []) {
      visit(dependency)
    }
    visiting.delete(stepId)
    visited.add(stepId)
  }

  for (const step of steps) {
    visit(step.id)
  }
}
