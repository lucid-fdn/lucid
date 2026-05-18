import 'server-only'

import crypto from 'node:crypto'

import {
  createSystemNotice,
  markExternalKnowledgeClientUsed,
  recordKnowledgeOperationEvent,
  verifyExternalKnowledgeToken,
} from '@/lib/db'
import {
  supabaseAgentOpsRunModeRecorder,
  supabaseAgentOpsRunStore,
} from '@/lib/db/agent-ops'
import { supabaseAgentOpsDagOrchestrationAdapter } from '@/lib/db/agent-ops-orchestration'
import { supabaseAgentOpsRuntimeSelector } from '@/lib/db/agent-ops-runtime-selector'
import { supabaseAgentOpsSpecialistTelemetryProvider } from '@/lib/db/agent-ops-product'
import { supabaseAgentOpsTeamPolicyGate } from '@/lib/db/agent-ops-team-policy-gate'
import { ErrorService } from '@/lib/errors/error-service'
import { buildAgentOpsRunSystemNotice, startAgentOpsRun } from '@/lib/agent-ops'
import { AGENT_OPS_SCOPE_TYPES, AGENT_OPS_WORKFLOW_IDS } from '@/lib/agent-ops/workflow-types'
import {
  bindExternalKnowledgeInput,
  getKnowledgeAuthScopesForOperation,
  hasKnowledgeAuthScopes,
  normalizeKnowledgeOperationId,
} from '@/lib/knowledge/auth-scopes'
import {
  executeKnowledgeOperation,
  KnowledgeOperationExecutionError,
  summarizeKnowledgeOperationResult,
} from '@/lib/knowledge/operation-executor'
import {
  getKnowledgeOperation,
  validateKnowledgeOperationInput,
  type KnowledgeOperationEnvelope,
  type KnowledgeOperationId,
  type KnowledgeOperationInput,
  type KnowledgeOperationSurface,
} from '@/lib/knowledge/operations'
import { AgentOpsRunModeSchema } from '@contracts/agent-ops-run-mode'
import type { ExternalKnowledgeClient, KnowledgeAuthScope } from '@contracts/knowledge-auth'
import { z } from 'zod'

export type ExternalKnowledgeOperationId = KnowledgeOperationId | 'agent_ops.launch'

export interface RunExternalKnowledgeOperationInput {
  token: string
  operation: string
  input?: unknown
  surface?: Extract<KnowledgeOperationSurface, 'external_agent' | 'mcp'>
  requestId?: string
}

export interface ExternalKnowledgeOperationResponse {
  status: number
  envelope: KnowledgeOperationEnvelope
  client: ExternalKnowledgeClient | null
}

const agentOpsLaunchSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  workflow_id: z.enum(AGENT_OPS_WORKFLOW_IDS),
  run_mode: AgentOpsRunModeSchema.default('execute'),
  scope: z.object({
    type: z.enum(AGENT_OPS_SCOPE_TYPES),
    ref: z.string().min(1).max(500).optional(),
    label: z.string().max(240).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  input: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export async function runExternalKnowledgeOperation(
  input: RunExternalKnowledgeOperationInput,
): Promise<ExternalKnowledgeOperationResponse> {
  const requestId = input.requestId ?? crypto.randomUUID()
  const startedAt = Date.now()
  const surface = input.surface ?? 'external_agent'
  const normalizedOperationId = normalizeKnowledgeOperationId(input.operation)
  const operationId: ExternalKnowledgeOperationId | null = normalizedOperationId ?? (
    input.operation === 'agent_ops.launch' ? 'agent_ops.launch' : null
  )
  let client: ExternalKnowledgeClient | null = null
  let rawInput = input.input

  const finish = async (params: {
    status: number
    success: boolean
    result?: unknown
    error?: KnowledgeOperationEnvelope['error']
  }): Promise<ExternalKnowledgeOperationResponse> => {
    const durationMs = Date.now() - startedAt
    if (operationId && client) {
      await recordKnowledgeOperationEvent({
        orgId: client.orgId,
        actorUserId: null,
        operationId,
        surface,
        success: params.success,
        durationMs,
        input: rawInput,
        outputSummary: params.success ? summarizeKnowledgeOperationResult(params.result) : null,
        errorCode: params.error?.code ?? null,
        errorMessage: params.error?.message ?? null,
        metadata: {
          requestId,
          external_client_id: client.id,
          external_client_name: client.name,
        },
      })
    }
    return {
      status: params.status,
      envelope: {
        ok: params.success,
        operation: operationId,
        requestId,
        durationMs,
        result: params.result,
        error: params.error,
      },
      client,
    }
  }

  try {
    if (!operationId) {
      return finish({
        status: 400,
        success: false,
        error: { code: 'validation_failed', message: 'Unknown external Knowledge operation' },
      })
    }

    client = await verifyExternalKnowledgeToken({ token: input.token, touch: false })
    if (!client) {
      return finish({
        status: 401,
        success: false,
        error: { code: 'unauthorized', message: 'Invalid external Knowledge token' },
      })
    }

    if (operationId === 'agent_ops.launch') {
      const bound = bindExternalKnowledgeInput(client, rawInput)
      if (!bound.ok) {
        return finish({
          status: 403,
          success: false,
          error: { code: 'forbidden', message: bound.error },
        })
      }
      rawInput = bound.input
      if (!hasKnowledgeAuthScopes(client.scopes, ['agent_ops:launch'])) {
        return finish({
          status: 403,
          success: false,
          error: { code: 'forbidden', message: 'External client lacks required scope: agent_ops:launch' },
        })
      }
      const parsed = agentOpsLaunchSchema.parse(bound.input)
      const run = await launchAgentOpsFromExternalClient(client, parsed)
      await markExternalKnowledgeClientUsed(client.id)
      return finish({ status: 202, success: true, result: { run } })
    }

    const operation = getKnowledgeOperation(operationId)
    if (!operation) {
      return finish({
        status: 400,
        success: false,
        error: { code: 'validation_failed', message: 'Unknown external Knowledge operation' },
      })
    }
    const bound = bindExternalKnowledgeInput(client, rawInput)
    if (!bound.ok) {
      return finish({
        status: 403,
        success: false,
        error: { code: 'forbidden', message: bound.error },
      })
    }
    rawInput = bound.input

    let parsedInput: KnowledgeOperationInput
    try {
      parsedInput = validateKnowledgeOperationInput(operation.id, bound.input)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return finish({
          status: 400,
          success: false,
          error: { code: 'validation_failed', message: 'Validation failed', details: error.issues },
        })
      }
      throw error
    }

    const requiredScopes = getKnowledgeAuthScopesForOperation(operation.id, parsedInput)
    if (!hasKnowledgeAuthScopes(client.scopes, requiredScopes)) {
      return finish({
        status: 403,
        success: false,
        error: {
          code: 'forbidden',
          message: `External client lacks required scope: ${formatScopes(requiredScopes)}`,
        },
      })
    }

    const result = await executeKnowledgeOperation(operation.id, parsedInput, null)
    await markExternalKnowledgeClientUsed(client.id)
    return finish({ status: 200, success: true, result })
  } catch (error) {
    if (error instanceof KnowledgeOperationExecutionError) {
      return finish({
        status: error.status,
        success: false,
        error: { code: 'operation_failed', message: error.message },
      })
    }
    if (error instanceof z.ZodError) {
      return finish({
        status: 400,
        success: false,
        error: { code: 'validation_failed', message: 'Validation failed', details: error.issues },
      })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'runExternalKnowledgeOperation', operationId },
      tags: { layer: 'knowledge', route: 'external-operations' },
    })
    return finish({
      status: 500,
      success: false,
      error: { code: 'operation_failed', message: 'External Knowledge operation failed' },
    })
  }
}

export function requiredScopesForExternalKnowledgeOperation(
  operation: string,
  input?: KnowledgeOperationInput,
): KnowledgeAuthScope[] {
  const normalized = normalizeKnowledgeOperationId(operation)
  if (normalized) return getKnowledgeAuthScopesForOperation(normalized, input)
  if (operation === 'agent_ops.launch') return ['agent_ops:launch']
  return []
}

async function launchAgentOpsFromExternalClient(
  client: ExternalKnowledgeClient,
  body: z.infer<typeof agentOpsLaunchSchema>,
) {
  const run = await startAgentOpsRun(
    {
      orgId: client.orgId,
      projectId: body.project_id ?? client.projectId ?? null,
      assistantId: body.assistant_id ?? null,
      requestedByUserId: null,
      workflowId: body.workflow_id,
      runMode: body.run_mode,
      scope: {
        ...body.scope,
        metadata: {
          ...body.scope.metadata,
          source: 'external_knowledge_client',
          external_client_id: client.id,
        },
      },
      input: body.input,
      metadata: {
        ...body.metadata,
        launched_from: 'external_knowledge_client',
        external_client_id: client.id,
      },
    },
    {
      runStore: supabaseAgentOpsRunStore,
      teamPolicyGate: supabaseAgentOpsTeamPolicyGate,
      specialistTelemetry: supabaseAgentOpsSpecialistTelemetryProvider,
      runtimeSelector: supabaseAgentOpsRuntimeSelector,
      runModeRecorder: supabaseAgentOpsRunModeRecorder,
      ...(body.assistant_id ? { orchestration: supabaseAgentOpsDagOrchestrationAdapter } : {}),
    },
  )
  const notice = buildAgentOpsRunSystemNotice(run)
  if (notice) await createSystemNotice(notice).catch(() => null)
  return run
}

function formatScopes(scopes: readonly KnowledgeAuthScope[]): string {
  return scopes.join(', ')
}
