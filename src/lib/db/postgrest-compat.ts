type PostgrestErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
} | null | undefined

const MIGRATION_079_SCHEMA_CODES = new Set(['42703', '42P01', 'PGRST200', 'PGRST204'])
const MIGRATION_079_SCHEMA_PATTERNS = [
  /agent_wallets/i,
  /wallet_enabled/i,
  /approval_required_tools/i,
  /privy_wallet_id/i,
  /withdrawal_address/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /could not find a relationship/i,
]

export function shouldFallbackWalletSchemaQuery(error: PostgrestErrorLike): boolean {
  if (!error) return false

  const haystack = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')

  if (!haystack) {
    return Boolean(error.code && MIGRATION_079_SCHEMA_CODES.has(error.code))
  }

  const hasSchemaIndicator = MIGRATION_079_SCHEMA_PATTERNS.some((pattern) => pattern.test(haystack))
  if (!hasSchemaIndicator) return false

  if (!error.code) return true
  return MIGRATION_079_SCHEMA_CODES.has(error.code)
}
