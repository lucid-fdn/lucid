import type { RuntimeGatewayErrorCode } from '@contracts/app-runtime'
import { redactAppServiceText, redactAppServiceValue } from './security-redaction'

export class AppServiceError extends Error {
  readonly code: RuntimeGatewayErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly details?: unknown

  constructor(
    code: RuntimeGatewayErrorCode,
    message: string,
    status = 500,
    options?: { retryable?: boolean; details?: unknown },
  ) {
    super(message)
    this.name = 'AppServiceError'
    this.code = code
    this.status = status
    this.retryable = options?.retryable ?? false
    this.details = options?.details
  }
}

export function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function toApiErrorEnvelope(error: unknown, id = requestId()) {
  if (error instanceof AppServiceError) {
    return {
      error: {
        code: error.code,
        message: redactAppServiceText(error.message),
        details: redactAppServiceValue(error.details),
        request_id: id,
        retryable: error.retryable,
      },
    }
  }

  return {
    error: {
      code: 'internal_error',
      message: error instanceof Error ? redactAppServiceText(error.message) : 'Internal error',
      request_id: id,
      retryable: false,
    },
  }
}
