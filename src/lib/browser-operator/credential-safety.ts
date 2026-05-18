import {
  BrowserOperatorCredentialRefSchema,
  BrowserOperatorRuntimeCredentialRefSchema,
  BROWSER_OPERATOR_RAW_CREDENTIAL_KINDS,
  isBrowserOperatorRawCredentialKind,
  type BrowserOperatorCredentialRef,
  type BrowserOperatorRuntimeCredentialRef,
} from '@contracts/browser-operator'

export const BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG = 'browser_operator_raw_credentials'

const SECRET_KEY_PATTERN = /(^|_)(secret|password|token|api[_-]?key|totp|recovery[_-]?code|session[_-]?secret|credential[_-]?secret|credential[_-]?value)(_|$)/i

export interface BrowserOperatorCredentialAccessDecision {
  allowed: boolean
  reasonCodes: string[]
  auditEventType:
    | 'credential_access.allowed'
    | 'credential_access.denied'
    | 'credential_access.raw_denied'
    | 'credential_access.revoked'
  runtimeRef?: BrowserOperatorRuntimeCredentialRef
}

export function sanitizeBrowserOperatorCredentialRef(
  value: unknown,
): BrowserOperatorRuntimeCredentialRef {
  const parsed = BrowserOperatorCredentialRefSchema.parse(value)
  return BrowserOperatorRuntimeCredentialRefSchema.parse({
    id: parsed.id,
    contract_version: parsed.contract_version,
    schema_version: parsed.schema_version,
    org_id: parsed.org_id,
    user_id: parsed.user_id,
    browser_account_id: parsed.browser_account_id,
    provider: parsed.provider,
    storage_owner: parsed.storage_owner,
    credential_kind: parsed.credential_kind,
    status: parsed.status,
    requires_feature_flag: parsed.requires_feature_flag,
    consent_grant_id: parsed.consent_grant_id,
    last_accessed_by_run_id: parsed.last_accessed_by_run_id,
  })
}

export function evaluateBrowserOperatorCredentialAccess(input: {
  credentialRef: BrowserOperatorCredentialRef
  rawCredentialsEnabled?: boolean
  enabledFeatureFlags?: readonly string[]
}): BrowserOperatorCredentialAccessDecision {
  const ref = BrowserOperatorCredentialRefSchema.parse(input.credentialRef)
  const reasonCodes: string[] = []

  if (ref.status !== 'active') {
    return {
      allowed: false,
      reasonCodes: [`credential_${ref.status}`],
      auditEventType: 'credential_access.revoked',
    }
  }

  if (isBrowserOperatorRawCredentialKind(ref.credential_kind)) {
    const enabledFlags = new Set(input.enabledFeatureFlags ?? [])
    const requiredFlag = ref.requires_feature_flag ?? BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG
    if (!input.rawCredentialsEnabled || !enabledFlags.has(requiredFlag)) {
      reasonCodes.push('raw_credentials_disabled')
    }
    if (ref.storage_owner !== 'lucid_vault') reasonCodes.push('raw_credentials_require_lucid_vault')
    if (!ref.consent_grant_id) reasonCodes.push('explicit_consent_required')
  }

  if (reasonCodes.length > 0) {
    return {
      allowed: false,
      reasonCodes,
      auditEventType: isBrowserOperatorRawCredentialKind(ref.credential_kind)
        ? 'credential_access.raw_denied'
        : 'credential_access.denied',
    }
  }

  return {
    allowed: true,
    reasonCodes: [],
    auditEventType: 'credential_access.allowed',
    runtimeRef: sanitizeBrowserOperatorCredentialRef(ref),
  }
}

export function assertBrowserOperatorRuntimePacketSafe(value: unknown): void {
  const violations = collectSecretKeys(value)
  if (violations.length > 0) {
    throw new Error(`Browser Operator runtime packet contains forbidden secret fields: ${violations.join(', ')}`)
  }
}

export function collectSecretKeys(value: unknown, path = '$'): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectSecretKeys(item, `${path}[${index}]`))
  }

  const violations: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`
    if (key === 'secret_ref' || key === 'secretRef' || SECRET_KEY_PATTERN.test(key)) {
      violations.push(childPath)
      continue
    }
    violations.push(...collectSecretKeys(child, childPath))
  }
  return violations
}

export function browserOperatorRawCredentialKinds(): readonly string[] {
  return BROWSER_OPERATOR_RAW_CREDENTIAL_KINDS
}
