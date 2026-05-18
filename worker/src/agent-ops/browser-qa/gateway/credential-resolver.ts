export const BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG = 'browser_operator_raw_credentials'

const RAW_CREDENTIAL_KINDS = new Set(['password', 'totp_seed', 'recovery_code'])
const SECRET_KEY_PATTERN = /(^|_)(secret|password|token|api[_-]?key|totp|recovery[_-]?code|session[_-]?secret|credential[_-]?secret|credential[_-]?value)(_|$)/i

export interface BrowserGatewayRuntimeCredentialRef {
  id: string
  browser_account_id: string
  provider: string
  storage_owner: 'merchant_session' | 'provider_vault' | 'lucid_vault'
  credential_kind: string
  status: string
  requires_feature_flag?: string | null
  consent_grant_id?: string | null
}

export interface BrowserGatewayCredentialAccessDecision {
  allowed: boolean
  reasonCodes: string[]
  runtimeRef?: BrowserGatewayRuntimeCredentialRef
}

export function assertBrowserGatewayRuntimePacketSafe(value: unknown): void {
  const violations = collectForbiddenSecretKeys(value)
  if (violations.length > 0) {
    throw new Error(`Browser Operator gateway packet contains forbidden secret fields: ${violations.join(', ')}`)
  }
}

export function evaluateBrowserGatewayCredentialAccess(input: {
  credentialRef?: BrowserGatewayRuntimeCredentialRef | null
  rawCredentialsEnabled: boolean
  enabledFeatureFlags: readonly string[]
}): BrowserGatewayCredentialAccessDecision {
  if (!input.credentialRef) return { allowed: true, reasonCodes: [] }

  const ref = normalizeRuntimeCredentialRef(input.credentialRef)
  const reasonCodes: string[] = []

  if (ref.status !== 'active') reasonCodes.push(`credential_${ref.status}`)

  if (RAW_CREDENTIAL_KINDS.has(ref.credential_kind)) {
    const requiredFlag = ref.requires_feature_flag ?? BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG
    if (!input.rawCredentialsEnabled || !input.enabledFeatureFlags.includes(requiredFlag)) {
      reasonCodes.push('raw_credentials_disabled')
    }
    if (ref.storage_owner !== 'lucid_vault') reasonCodes.push('raw_credentials_require_lucid_vault')
    if (!ref.consent_grant_id) reasonCodes.push('explicit_consent_required')
  }

  return {
    allowed: reasonCodes.length === 0,
    reasonCodes,
    runtimeRef: reasonCodes.length === 0 ? ref : undefined,
  }
}

function normalizeRuntimeCredentialRef(value: BrowserGatewayRuntimeCredentialRef): BrowserGatewayRuntimeCredentialRef {
  return {
    id: requiredString(value.id, 'credentialRef.id'),
    browser_account_id: requiredString(value.browser_account_id, 'credentialRef.browser_account_id'),
    provider: requiredString(value.provider, 'credentialRef.provider'),
    storage_owner: normalizeStorageOwner(value.storage_owner),
    credential_kind: requiredString(value.credential_kind, 'credentialRef.credential_kind'),
    status: requiredString(value.status, 'credentialRef.status'),
    requires_feature_flag: optionalString(value.requires_feature_flag),
    consent_grant_id: optionalString(value.consent_grant_id),
  }
}

function collectForbiddenSecretKeys(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenSecretKeys(item, `${path}[${index}]`))
  }

  const violations: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`
    if (key === 'secret_ref' || key === 'secretRef' || SECRET_KEY_PATTERN.test(key)) {
      violations.push(childPath)
      continue
    }
    violations.push(...collectForbiddenSecretKeys(child, childPath))
  }
  return violations
}

function normalizeStorageOwner(value: string): BrowserGatewayRuntimeCredentialRef['storage_owner'] {
  if (value === 'merchant_session' || value === 'provider_vault' || value === 'lucid_vault') return value
  throw new Error(`Unsupported Browser Operator credential storage owner: ${value}`)
}

function requiredString(value: unknown, name: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(`${name} is required`)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
