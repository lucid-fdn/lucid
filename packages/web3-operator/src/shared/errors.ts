/**
 * Standardized error responses for web3-operator tools.
 *
 * All tools return JSON strings. This helper ensures consistent shape
 * so consumers can parse errors programmatically.
 */

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  API_ERROR: 'API_ERROR',
  API_KEY_MISSING: 'API_KEY_MISSING',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  UNSUPPORTED_CHAIN: 'UNSUPPORTED_CHAIN',
  TIMEOUT: 'TIMEOUT',
} as const

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode]

interface ToolErrorResponse {
  error: string
  code: ErrorCodeType
  detail?: string
  suggestion?: string
}

/** Build a standardized error JSON string. */
export function toolError(
  message: string,
  code: ErrorCodeType,
  opts?: { detail?: string; suggestion?: string },
): string {
  const response: ToolErrorResponse = {
    error: message,
    code,
    ...opts,
  }
  return JSON.stringify(response)
}
