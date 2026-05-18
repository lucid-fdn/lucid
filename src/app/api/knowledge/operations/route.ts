import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
  recordKnowledgeOperationEvent,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  getKnowledgeOperation,
  getKnowledgeOperationOrgId,
  listKnowledgeOperations,
  toAgentOpsActionDefinitions,
  toMcpToolDefinitions,
  toWorkerToolDefinitions,
  validateKnowledgeOperationInput,
  type KnowledgeOperationId,
  type KnowledgeOperationInput,
  type KnowledgeOperationSurface,
} from '@/lib/knowledge/operations'
import {
  dynamicAdminRequired,
  executeKnowledgeOperation,
  summarizeKnowledgeOperationResult,
} from '@/lib/knowledge/operation-executor'
import { KnowledgeSourceSafetyError } from '@/lib/knowledge/source-safety'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const callSchema = z.object({
  operation: z.string(),
  input: z.unknown(),
  surface: z.enum(['app_api', 'mission_control', 'worker_tool', 'mcp', 'agent_ops', 'external_agent']).optional(),
  actor_user_id: z.string().uuid().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId && !isWorkerSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    return NextResponse.json({
      operations: listKnowledgeOperations(),
      mcpTools: toMcpToolDefinitions(),
      workerTools: toWorkerToolDefinitions(),
      agentOpsActions: toAgentOpsActionDefinitions(),
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/operations', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge operations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  let operationId: KnowledgeOperationId | null = null
  let orgId: string | null = null
  let actorUserId: string | null = null
  let surface: KnowledgeOperationSurface = 'app_api'
  let rawInput: unknown

  const finish = async (params: {
    status: number
    success: boolean
    result?: unknown
    error?: { code: 'validation_failed' | 'unauthorized' | 'forbidden' | 'not_found' | 'operation_failed'; message: string; details?: unknown }
    outputSummary?: string | null
  }) => {
    const durationMs = Date.now() - startedAt
    if (operationId && orgId) {
      await recordKnowledgeOperationEvent({
        orgId,
        actorUserId,
        operationId,
        surface,
        success: params.success,
        durationMs,
        input: rawInput,
        outputSummary: params.outputSummary ?? summarizeKnowledgeOperationResult(params.result),
        errorCode: params.error?.code ?? null,
        errorMessage: params.error?.message ?? null,
        metadata: { requestId },
      })
    }
    return NextResponse.json({
      ok: params.success,
      operation: operationId,
      requestId,
      durationMs,
      result: params.result,
      error: params.error,
    }, { status: params.status })
  }

  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return finish({
        status: 429,
        success: false,
        error: { code: 'operation_failed', message: 'Too many requests' },
      })
    }

    const parsed = callSchema.safeParse(await req.json())
    if (!parsed.success) {
      return finish({
        status: 400,
        success: false,
        error: { code: 'validation_failed', message: 'Validation failed', details: parsed.error.issues },
      })
    }

    const internalWorkerCall = isWorkerSecret(req)
    if (!internalWorkerCall) {
      const csrfError = await requireCSRF(req)
      if (csrfError) return csrfError
    }

    actorUserId = await getUserId()
    if (!actorUserId && internalWorkerCall) actorUserId = parsed.data.actor_user_id ?? null
    if (!actorUserId && !internalWorkerCall) {
      return finish({
        status: 401,
        success: false,
        error: { code: 'unauthorized', message: 'Unauthorized' },
      })
    }

    const operation = getKnowledgeOperation(parsed.data.operation)
    if (!operation) {
      return finish({
        status: 400,
        success: false,
        error: { code: 'validation_failed', message: 'Unknown knowledge operation' },
      })
    }

    operationId = operation.id
    surface = parsed.data.surface ?? 'app_api'
    rawInput = parsed.data.input

    let input: KnowledgeOperationInput
    try {
      input = validateKnowledgeOperationInput(operation.id, parsed.data.input)
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

    orgId = getKnowledgeOperationOrgId(input)
    if (actorUserId && !(await isUserOrgMember(actorUserId, orgId))) {
      return finish({
        status: 403,
        success: false,
        error: { code: 'forbidden', message: 'Forbidden' },
      })
    }
    const requiresAdminRole = operation.requiresRole === 'admin' || dynamicAdminRequired(operation.id, input)

    if (!actorUserId && requiresAdminRole) {
      return finish({
        status: 403,
        success: false,
        error: { code: 'forbidden', message: 'Admin or owner role required' },
      })
    }

    if (actorUserId && requiresAdminRole) {
      const role = await getOrgMemberRole(actorUserId, orgId)
      if (!role || !WRITE_ROLES.has(role)) {
        return finish({
          status: 403,
          success: false,
          error: { code: 'forbidden', message: 'Admin or owner role required' },
        })
      }
    }

    const result = await executeKnowledgeOperation(operation.id, input, actorUserId)
    return finish({ status: 200, success: true, result })
  } catch (error) {
    if (error instanceof KnowledgeSourceSafetyError) {
      return finish({
        status: 400,
        success: false,
        error: { code: 'validation_failed', message: error.message, details: error.details },
      })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/operations', method: 'POST', operationId, orgId },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return finish({
      status: 500,
      success: false,
      error: { code: 'operation_failed', message: 'Knowledge operation failed' },
    })
  }
}

function isWorkerSecret(req: NextRequest): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
    || req.headers.get('x-worker-trigger-secret') === secret
}
