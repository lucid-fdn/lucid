/**
 * Shared channel error types.
 *
 * `PermanentChannelError` signals that a channel's credentials are invalid,
 * revoked, or otherwise unrecoverable without operator intervention. The
 * caller MUST NOT retry — instead it should deactivate the channel and
 * surface the failure to the operator.
 *
 * Lives outside `processors/` and `channels/native/` so both the C1 outbound
 * processor (which talks to the DB) and the C2a native channel manager (which
 * talks to the control plane via DataSink) can share the same shape and
 * detection rules.
 */

export class PermanentChannelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentChannelError'
  }
}

const PERMANENT_ERROR_PATTERNS = [
  'permanent failure',
  'invalid_auth',
  'account_inactive',
  'token_revoked',
  'Unauthorized',
  'bot token not configured',
  'credentials not configured',
  'Channel not found',
  // Common provider-specific revocation/auth signals
  '401 Unauthorized',
  '403 Forbidden',
  'not_authed',
  'invalid_token',
]

/** Returns true if a raw error message looks like a permanent channel failure. */
export function isPermanentError(msg: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some(p => msg.includes(p))
}

/** Returns true if a thrown error is permanent (instance check + message scan). */
export function isPermanentChannelFailure(err: unknown): boolean {
  if (err instanceof PermanentChannelError) return true
  const msg = err instanceof Error ? err.message : String(err)
  return isPermanentError(msg)
}
