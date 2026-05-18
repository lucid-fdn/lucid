import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { AgentCommerceError, normalizeAgentCommerceError } from '@/lib/agent-commerce/errors'
import { ErrorService } from '@/lib/errors/error-service'

export function browserOperatorRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id') || crypto.randomUUID()
}

export function browserOperatorOk(
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

export function browserOperatorErrorResponse(error: unknown, requestId: string): NextResponse {
  const normalized = error instanceof z.ZodError
    ? new AgentCommerceError('validation_failed', 'Validation failed.', 400, { details: error.issues })
    : normalizeAgentCommerceError(error)

  if (normalized.status >= 500) {
    ErrorService.captureException(normalized, {
      severity: 'error',
      context: { requestId, details: normalized.details },
      tags: { layer: 'api', stack: 'browser-operator', code: normalized.code },
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
