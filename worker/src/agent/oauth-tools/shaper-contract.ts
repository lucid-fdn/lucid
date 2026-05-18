/**
 * Contract types for OAuth tool response shaping.
 * All shapers and bridge error paths conform to these types.
 */

/** Read list action target shape */
export interface ListActionResult {
  results: unknown[]
  has_more: boolean
  next_cursor: string | null
  _compact?: true
  _hint?: string
}

/** Error target shape */
export interface NormalizedError {
  error: string
  provider: string
  action: string
  retryable: boolean
  status_code?: number
  error_code?: string
}
