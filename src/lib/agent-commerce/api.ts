import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AgentCommerceError, normalizeAgentCommerceError } from './errors'
import { assertAgentCommerceEnabled, type AgentCommerceSurface } from './feature-gates'
import { captureAgentCommerceError } from './observability'

export function agentCommerceRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id') || crypto.randomUUID()
}

export function agentCommerceOk(
  body: Record<string, unknown>,
  requestId: string,
  init: ResponseInit = {},
): NextResponse {
  return NextResponse.json(
    { ...body, request_id: requestId },
    {
      ...init,
      headers: {
        'x-request-id': requestId,
        ...(init.headers ?? {}),
      },
    },
  )
}

export function agentCommerceErrorResponse(error: unknown, requestId: string): NextResponse {
  const normalized = error instanceof z.ZodError
    ? new AgentCommerceError('validation_failed', 'Validation failed.', 400, { details: error.issues })
    : normalizeAgentCommerceError(error)

  if (normalized.status >= 500) {
    captureAgentCommerceError(normalized, {
      operation: 'api_error_response',
      surface: 'route',
      status: normalized.status,
      code: normalized.code,
      context: {
        request_id: requestId,
        retryable: normalized.retryable,
        details: normalized.details,
      },
      fingerprint: ['agent-commerce', normalized.code],
    })
  }

  return NextResponse.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        details: normalized.details,
      },
      request_id: requestId,
    },
    {
      status: normalized.status,
      headers: { 'x-request-id': requestId },
    },
  )
}

export function guardAgentCommerceSurface(
  surface: AgentCommerceSurface,
  request: NextRequest,
): NextResponse | null {
  const requestId = agentCommerceRequestId(request)
  try {
    assertAgentCommerceEnabled(surface)
    return null
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
