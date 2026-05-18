import type {
  TeamOpsRuntimeCandidate,
  TeamOpsRuntimeCompatibility,
} from './team-ops'
import type { AgentOpsRunModePolicy } from '@contracts/agent-ops-run-mode'
import type {
  AgentOpsTeamPolicyGateEvaluation,
} from './team-policy'
import type {
  AgentOpsSpecialistTelemetrySummary,
} from './specialist-telemetry'

import type {
  AgentOpsArtifact,
  AgentOpsFinding,
  AgentOpsRun,
  AgentOpsWorkflowDefinition,
  AppendAgentOpsArtifactInput,
  AppendAgentOpsFindingInput,
  StartAgentOpsRunInput,
} from './workflow-types'

export interface AgentOpsRunStore {
  createRun(input: StartAgentOpsRunInput & {
    workflow: AgentOpsWorkflowDefinition
    status: AgentOpsRun['status']
    errorMessage?: string | null
  }): Promise<AgentOpsRun>
  getRun(runId: string): Promise<AgentOpsRun | null>
  updateRunStatus(input: {
    runId: string
    orgId: string
    status: AgentOpsRun['status']
    errorMessage?: string | null
    orchestrationDagId?: string | null
    rootAgentRunId?: string | null
    output?: Record<string, unknown> | null
    metadata?: Record<string, unknown>
  }): Promise<AgentOpsRun>
}

export interface AgentOpsRunModeRecorder {
  record(input: {
    run: AgentOpsRun
    policy: AgentOpsRunModePolicy
    metadata?: Record<string, unknown>
  }): Promise<void>
}

export interface AgentOpsRuntimeSelector {
  listCandidates(input: {
    orgId: string
    projectId?: string | null
    assistantId?: string | null
    workflow: AgentOpsWorkflowDefinition
  }): Promise<readonly TeamOpsRuntimeCandidate[]>
  onCompatibilityEvaluated?(input: {
    workflow: AgentOpsWorkflowDefinition
    candidates: readonly TeamOpsRuntimeCandidate[]
    compatibility: readonly TeamOpsRuntimeCompatibility[]
  }): Promise<void> | void
}

export interface AgentOpsTeamPolicyGate {
  evaluateRunStart(input: {
    orgId: string
    projectId?: string | null
    assistantId?: string | null
    workflow: AgentOpsWorkflowDefinition
    scope: StartAgentOpsRunInput['scope']
    input: Record<string, unknown>
  }): Promise<AgentOpsTeamPolicyGateEvaluation>
}

export interface AgentOpsSpecialistTelemetryProvider {
  list(input: {
    orgId: string
    projectId?: string | null
    assistantId?: string | null
    workflow: AgentOpsWorkflowDefinition
  }): Promise<readonly AgentOpsSpecialistTelemetrySummary[]>
}

export interface AgentOpsOrchestrationAdapter {
  startDag(input: {
    run: AgentOpsRun
    workflow: AgentOpsWorkflowDefinition
  }): Promise<{ dagId: string }>
  cancelDag(input: { orgId: string; dagId: string; reason?: string }): Promise<void>
  retryDag(input: { orgId: string; dagId: string; fromNodeKey?: string }): Promise<{ dagId: string }>
}

export interface AgentOpsRuntimeAdapter {
  startSingleRun(input: {
    run: AgentOpsRun
    workflow: AgentOpsWorkflowDefinition
  }): Promise<{ agentRunId?: string; output?: Record<string, unknown> }>
}

export interface AgentOpsEvidenceStore {
  appendArtifact(input: AppendAgentOpsArtifactInput): Promise<AgentOpsArtifact>
  appendFinding(input: AppendAgentOpsFindingInput): Promise<AgentOpsFinding>
}

export interface AgentOpsApprovalAdapter {
  requestApproval(input: {
    run: AgentOpsRun
    workflow: AgentOpsWorkflowDefinition
    gateId: string
    reason: string
  }): Promise<{ approvalId: string }>
}

export interface AgentOpsMemoryAdapter {
  loadContext(input: {
    orgId: string
    projectId?: string | null
    workflow: AgentOpsWorkflowDefinition
    query: string
  }): Promise<{ memories: Array<{ id: string; content: string; score?: number }> }>
}

export interface AgentOpsTemplateAdapter {
  resolveWorkflowTemplate(input: {
    orgId: string
    workflow: AgentOpsWorkflowDefinition
  }): Promise<{ templateId: string | null }>
}

export interface AgentOpsMissionControlProjector {
  projectRunStarted(input: { run: AgentOpsRun; workflow: AgentOpsWorkflowDefinition }): Promise<void>
  projectRunUpdated(input: { run: AgentOpsRun; workflow: AgentOpsWorkflowDefinition }): Promise<void>
}

export interface AgentOpsDependencies {
  runStore: AgentOpsRunStore
  orchestration?: AgentOpsOrchestrationAdapter
  runtime?: AgentOpsRuntimeAdapter
  runtimeSelector?: AgentOpsRuntimeSelector
  runModeRecorder?: AgentOpsRunModeRecorder
  teamPolicyGate?: AgentOpsTeamPolicyGate
  specialistTelemetry?: AgentOpsSpecialistTelemetryProvider
  evidence?: AgentOpsEvidenceStore
  approvals?: AgentOpsApprovalAdapter
  memory?: AgentOpsMemoryAdapter
  templates?: AgentOpsTemplateAdapter
  missionControl?: AgentOpsMissionControlProjector
}
