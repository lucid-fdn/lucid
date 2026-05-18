import 'server-only'

import {
  BrowserOperatorAccountSchema,
  BrowserOperatorConnectSessionSchema,
  BrowserOperatorCredentialRefSchema,
  BrowserOperatorAlertSchema,
  BrowserOperatorAccountHealthSnapshotSchema,
  BrowserOperatorMerchantNativeCapabilitySchema,
  BrowserOperatorByoRuntimeSchema,
  BrowserOperatorPurchasePolicySchema,
  BrowserOperatorPurchasePassportSchema,
  BrowserOperatorPurchaseReceiptSchema,
  BrowserOperatorProfileSchema,
  BrowserOperatorPurchaseRunSchema,
  CreateBrowserOperatorAccountSchema,
  CreateBrowserOperatorAccountHealthSnapshotSchema,
  CreateBrowserOperatorAlertSchema,
  CreateBrowserOperatorByoRuntimeSchema,
  CreateBrowserOperatorConnectSessionSchema,
  CreateBrowserOperatorCredentialRefSchema,
  CreateBrowserOperatorMerchantNativeCapabilitySchema,
  CreateBrowserOperatorPurchasePolicySchema,
  CreateBrowserOperatorPurchasePassportSchema,
  CreateBrowserOperatorProfileSchema,
  CreateBrowserOperatorPurchaseReceiptSchema,
  UpdateBrowserOperatorAccountSchema,
  UpdateBrowserOperatorAlertSchema,
  UpdateBrowserOperatorByoRuntimeSchema,
  UpdateBrowserOperatorConnectSessionSchema,
  UpdateBrowserOperatorMerchantNativeCapabilitySchema,
  UpdateBrowserOperatorPurchasePassportSchema,
  UpdateBrowserOperatorPurchasePolicySchema,
  UpdateBrowserOperatorProfileSchema,
  type BrowserOperatorAccount,
  type BrowserOperatorAccountHealthSnapshot,
  type BrowserOperatorAlert,
  type BrowserOperatorByoRuntime,
  type BrowserOperatorConnectSession,
  type BrowserOperatorCredentialRef,
  type BrowserOperatorMerchantNativeCapability,
  type BrowserOperatorPurchaseCartItem,
  type BrowserOperatorPurchasePassport,
  type BrowserOperatorPurchasePolicy,
  type BrowserOperatorPurchaseReceipt,
  type BrowserOperatorProfile,
  type BrowserOperatorPurchaseRun,
  type BrowserOperatorRuntimeCredentialRef,
  type CreateBrowserOperatorAccount,
  type CreateBrowserOperatorAccountHealthSnapshot,
  type CreateBrowserOperatorAlert,
  type CreateBrowserOperatorByoRuntime,
  type CreateBrowserOperatorConnectSession,
  type CreateBrowserOperatorCredentialRef,
  type CreateBrowserOperatorMerchantNativeCapability,
  type CreateBrowserOperatorPurchasePassport,
  type CreateBrowserOperatorPurchasePolicy,
  type CreateBrowserOperatorProfile,
  type CreateBrowserOperatorPurchaseReceipt,
  type UpdateBrowserOperatorAccount,
  type UpdateBrowserOperatorAlert,
  type UpdateBrowserOperatorByoRuntime,
  type UpdateBrowserOperatorConnectSession,
  type UpdateBrowserOperatorMerchantNativeCapability,
  type UpdateBrowserOperatorPurchasePassport,
  type UpdateBrowserOperatorPurchasePolicy,
  type UpdateBrowserOperatorProfile,
} from '@contracts/browser-operator'
import { AgentCommerceMerchantSchema, type AgentCommerceMerchantInput } from '@contracts/agent-commerce'
import { sanitizeBrowserOperatorCredentialRef } from '@/lib/browser-operator/credential-safety'
import { ErrorService, supabase } from './client'

const ACCOUNT_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  project_id,
  merchant_key,
  merchant_name,
  provider,
  provider_account_ref,
  org_connection_id,
  auth_provider,
  auth_connection_id,
  provider_profile_ref,
  provider_context_ref,
  auth_state,
  capabilities,
  session_secret_ref,
  default_credential_ref_id,
  last_verified_at,
  expires_at,
  metadata,
  created_at,
  updated_at
`

const ALERT_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  browser_account_id,
  purchase_run_id,
  ops_run_id,
  alert_type,
  severity,
  status,
  dedupe_key,
  title,
  message,
  primary_cta,
  href,
  resolved_at,
  metadata,
  created_at,
  updated_at
`

const ACCOUNT_HEALTH_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  browser_account_id,
  health_state,
  score,
  reasons,
  profile_status,
  last_successful_run_at,
  last_failed_run_at,
  last_handoff_at,
  last_receipt_at,
  captcha_rate,
  handoff_rate,
  checkout_success_rate,
  receipt_success_rate,
  average_run_ms,
  recommended_action,
  metadata,
  created_at
`

const CREDENTIAL_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  browser_account_id,
  provider,
  storage_owner,
  secret_ref,
  credential_kind,
  status,
  requires_feature_flag,
  consent_grant_id,
  last_access_audit_id,
  last_accessed_by_run_id,
  last_used_at,
  last_rotated_at,
  metadata,
  created_at,
  updated_at
`

const CONNECT_SESSION_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  browser_account_id,
  provider,
  status,
  takeover_url,
  live_view_url,
  provider_session_ref,
  provider_profile_ref,
  provider_context_ref,
  return_url,
  expires_at,
  connected_at,
  failure_reason,
  metadata,
  created_at,
  updated_at
`

const POLICY_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  project_id,
  browser_account_id,
  name,
  status,
  schedule,
  max_total_amount,
  max_total_currency,
  allowed_merchant_domains,
  blocked_merchant_domains,
  allowed_categories,
  blocked_categories,
  max_item_count,
  allow_substitutions,
  max_substitution_delta_percent,
  requires_human_approval,
  auto_approve_inside_policy,
  expires_at,
  metadata,
  created_at,
  updated_at
`

const PURCHASE_PASSPORT_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  owner_user_id,
  project_id,
  name,
  status,
  scope,
  default_currency,
  default_country,
  consent_policy,
  budget_policy,
  address_refs,
  payment_method_refs,
  memory_scope,
  metadata,
  created_at,
  updated_at
`

const PURCHASE_RUN_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  project_id,
  user_id,
  assistant_id,
  ops_run_id,
  browser_account_id,
  purchase_policy_id,
  agent_commerce_spend_request_id,
  idempotency_key,
  merchant,
  status,
  cart_hash,
  cart_total_amount,
  cart_total_currency,
  policy_decision,
  approval_state,
  receipt_ref,
  failure_reason,
  metadata,
  created_at,
  updated_at
`

const NATIVE_CAPABILITY_SELECT = `
  id,
  contract_version,
  schema_version,
  merchant_key,
  merchant_domain,
  country,
  provider,
  capability_level,
  rail_id,
  status,
  access_model,
  supported_operations,
  required_credentials,
  required_env,
  countries,
  promotion_evidence,
  source_urls,
  last_verified_at,
  metadata,
  created_at,
  updated_at
`

const PURCHASE_RECEIPT_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  browser_account_id,
  purchase_run_id,
  provider,
  merchant_order_id,
  receipt_url,
  receipt_artifact_uri,
  total_amount,
  total_currency,
  purchased_at,
  raw_receipt,
  metadata,
  created_at
`

const PROFILE_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  user_id,
  browser_account_id,
  provider,
  profile_artifact_ref,
  provider_profile_ref,
  provider_context_ref,
  status,
  last_verified_at,
  expires_at,
  migration_status,
  degraded_reason,
  metadata,
  created_at,
  updated_at
`

const BYO_RUNTIME_SELECT = `
  id,
  contract_version,
  schema_version,
  org_id,
  name,
  provider,
  cdp_endpoint_ref,
  token_ref,
  org_connection_id,
  auth_provider,
  auth_connection_id,
  status,
  allowlisted_domains,
  privacy_mode,
  cost_policy,
  health,
  last_checked_at,
  metadata,
  created_at,
  updated_at
`

const CART_ITEM_SELECT = `
  id,
  merchant_item_id,
  name,
  quantity,
  unit,
  unit_price,
  total_price,
  currency,
  category,
  substitution_for,
  policy_flags,
  metadata
`

export async function listBrowserOperatorAccounts(input: {
  orgId: string
  userId?: string | null
  merchantKey?: string | null
  limit?: number
}): Promise<BrowserOperatorAccount[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_accounts')
    .select(ACCOUNT_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.userId) query = query.eq('user_id', input.userId)
  if (input.merchantKey) query = query.eq('merchant_key', input.merchantKey)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorAccounts', input.orgId)
    return []
  }
  return (data ?? []).map(mapAccountRow)
}

export async function createBrowserOperatorAccount(
  input: CreateBrowserOperatorAccount,
): Promise<BrowserOperatorAccount> {
  const parsed = CreateBrowserOperatorAccountSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_accounts')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      project_id: parsed.project_id ?? null,
      merchant_key: parsed.merchant_key,
      merchant_name: parsed.merchant_name,
      provider: parsed.provider,
      provider_account_ref: parsed.provider_account_ref ?? null,
      org_connection_id: parsed.org_connection_id ?? null,
      auth_provider: parsed.auth_provider ?? null,
      auth_connection_id: parsed.auth_connection_id ?? null,
      provider_profile_ref: parsed.provider_profile_ref ?? null,
      provider_context_ref: parsed.provider_context_ref ?? null,
      auth_state: parsed.auth_state ?? 'needs_connect',
      capabilities: parsed.capabilities ?? [],
      session_secret_ref: parsed.session_secret_ref ?? null,
      default_credential_ref_id: parsed.default_credential_ref_id ?? null,
      expires_at: parsed.expires_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(ACCOUNT_SELECT)
    .single()

  if (error) throw error
  return mapAccountRow(data)
}

export async function getBrowserOperatorAccount(input: {
  orgId: string
  accountId: string
}): Promise<BrowserOperatorAccount | null> {
  const { data, error } = await supabase
    .from('browser_operator_accounts')
    .select(ACCOUNT_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.accountId)
    .maybeSingle()

  if (error) {
    captureBrowserOperatorDbError(error, 'getBrowserOperatorAccount', input.orgId)
    return null
  }
  return data ? mapAccountRow(data) : null
}

export async function updateBrowserOperatorAccount(input: {
  orgId: string
  accountId: string
  patch: UpdateBrowserOperatorAccount
}): Promise<BrowserOperatorAccount> {
  const parsed = UpdateBrowserOperatorAccountSchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('project_id' in parsed) updates.project_id = parsed.project_id ?? null
  if ('merchant_name' in parsed) updates.merchant_name = parsed.merchant_name
  if ('provider_account_ref' in parsed) updates.provider_account_ref = parsed.provider_account_ref ?? null
  if ('org_connection_id' in parsed) updates.org_connection_id = parsed.org_connection_id ?? null
  if ('auth_provider' in parsed) updates.auth_provider = parsed.auth_provider ?? null
  if ('auth_connection_id' in parsed) updates.auth_connection_id = parsed.auth_connection_id ?? null
  if ('provider_profile_ref' in parsed) updates.provider_profile_ref = parsed.provider_profile_ref ?? null
  if ('provider_context_ref' in parsed) updates.provider_context_ref = parsed.provider_context_ref ?? null
  if ('auth_state' in parsed) updates.auth_state = parsed.auth_state
  if ('capabilities' in parsed) updates.capabilities = parsed.capabilities ?? []
  if ('session_secret_ref' in parsed) updates.session_secret_ref = parsed.session_secret_ref ?? null
  if ('default_credential_ref_id' in parsed) updates.default_credential_ref_id = parsed.default_credential_ref_id ?? null
  if ('last_verified_at' in parsed) updates.last_verified_at = parsed.last_verified_at ?? null
  if ('expires_at' in parsed) updates.expires_at = parsed.expires_at ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_accounts')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.accountId)
    .select(ACCOUNT_SELECT)
    .single()

  if (error) throw error
  return mapAccountRow(data)
}

export async function listBrowserOperatorAlerts(input: {
  orgId: string
  status?: BrowserOperatorAlert['status'] | BrowserOperatorAlert['status'][] | null
  browserAccountId?: string | null
  limit?: number
}): Promise<BrowserOperatorAlert[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_alerts')
    .select(ALERT_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (Array.isArray(input.status)) {
    if (input.status.length > 0) query = query.in('status', input.status)
  } else if (input.status) {
    query = query.eq('status', input.status)
  }
  if (input.browserAccountId) query = query.eq('browser_account_id', input.browserAccountId)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorAlerts', input.orgId)
    return []
  }
  return (data ?? []).map(mapAlertRow)
}

export async function getBrowserOperatorAlert(input: {
  orgId: string
  alertId: string
}): Promise<BrowserOperatorAlert | null> {
  const { data, error } = await supabase
    .from('browser_operator_alerts')
    .select(ALERT_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.alertId)
    .maybeSingle()

  if (error) {
    captureBrowserOperatorDbError(error, 'getBrowserOperatorAlert', input.orgId)
    return null
  }
  return data ? mapAlertRow(data) : null
}

export async function createBrowserOperatorAlert(
  input: CreateBrowserOperatorAlert,
): Promise<BrowserOperatorAlert> {
  const parsed = CreateBrowserOperatorAlertSchema.parse(input)
  const row = {
    org_id: parsed.org_id,
    user_id: parsed.user_id ?? null,
    browser_account_id: parsed.browser_account_id ?? null,
    purchase_run_id: parsed.purchase_run_id ?? null,
    ops_run_id: parsed.ops_run_id ?? null,
    alert_type: parsed.alert_type,
    severity: parsed.severity ?? 'needs_attention',
    status: parsed.status ?? 'open',
    dedupe_key: parsed.dedupe_key,
    title: parsed.title,
    message: parsed.message ?? null,
    primary_cta: parsed.primary_cta ?? {},
    href: parsed.href ?? null,
    resolved_at: parsed.resolved_at ?? null,
    metadata: parsed.metadata ?? {},
  }

  const { data, error } = await supabase
    .from('browser_operator_alerts')
    .insert(row)
    .select(ALERT_SELECT)
    .single()

  if (!error) return mapAlertRow(data)
  if ((error as { code?: string }).code !== '23505') throw error

  const { data: existing, error: existingError } = await supabase
    .from('browser_operator_alerts')
    .update({
      severity: row.severity,
      title: row.title,
      message: row.message,
      primary_cta: row.primary_cta,
      href: row.href,
      metadata: row.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', row.org_id)
    .eq('dedupe_key', row.dedupe_key)
    .in('status', ['open', 'acknowledged'])
    .select(ALERT_SELECT)
    .maybeSingle()

  if (existingError || !existing) throw existingError ?? error
  return mapAlertRow(existing)
}

export async function updateBrowserOperatorAlert(input: {
  orgId: string
  alertId: string
  patch: UpdateBrowserOperatorAlert
}): Promise<BrowserOperatorAlert> {
  const parsed = UpdateBrowserOperatorAlertSchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('severity' in parsed) updates.severity = parsed.severity
  if ('status' in parsed) {
    updates.status = parsed.status
    if ((parsed.status === 'resolved' || parsed.status === 'dismissed') && !('resolved_at' in parsed)) {
      updates.resolved_at = new Date().toISOString()
    }
  }
  if ('title' in parsed) updates.title = parsed.title
  if ('message' in parsed) updates.message = parsed.message ?? null
  if ('primary_cta' in parsed) updates.primary_cta = parsed.primary_cta ?? {}
  if ('href' in parsed) updates.href = parsed.href ?? null
  if ('resolved_at' in parsed) updates.resolved_at = parsed.resolved_at ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_alerts')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.alertId)
    .select(ALERT_SELECT)
    .single()

  if (error) throw error
  return mapAlertRow(data)
}

export async function listLatestBrowserOperatorAccountHealthSnapshots(input: {
  orgId: string
  browserAccountIds?: string[] | null
  limit?: number
}): Promise<BrowserOperatorAccountHealthSnapshot[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 250)
  let query = supabase
    .from('browser_operator_account_health_snapshots')
    .select(ACCOUNT_HEALTH_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.browserAccountIds?.length) query = query.in('browser_account_id', input.browserAccountIds)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listLatestBrowserOperatorAccountHealthSnapshots', input.orgId)
    return []
  }

  const seen = new Set<string>()
  const latest: BrowserOperatorAccountHealthSnapshot[] = []
  for (const snapshot of (data ?? []).map(mapAccountHealthSnapshotRow)) {
    if (seen.has(snapshot.browser_account_id)) continue
    seen.add(snapshot.browser_account_id)
    latest.push(snapshot)
  }
  return latest
}

export async function createBrowserOperatorAccountHealthSnapshot(
  input: CreateBrowserOperatorAccountHealthSnapshot,
): Promise<BrowserOperatorAccountHealthSnapshot> {
  const parsed = CreateBrowserOperatorAccountHealthSnapshotSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_account_health_snapshots')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      browser_account_id: parsed.browser_account_id,
      health_state: parsed.health_state,
      score: parsed.score ?? defaultBrowserOperatorAccountHealthScore(parsed.health_state),
      reasons: parsed.reasons ?? [],
      profile_status: parsed.profile_status ?? null,
      last_successful_run_at: parsed.last_successful_run_at ?? null,
      last_failed_run_at: parsed.last_failed_run_at ?? null,
      last_handoff_at: parsed.last_handoff_at ?? null,
      last_receipt_at: parsed.last_receipt_at ?? null,
      captcha_rate: parsed.captcha_rate ?? null,
      handoff_rate: parsed.handoff_rate ?? null,
      checkout_success_rate: parsed.checkout_success_rate ?? null,
      receipt_success_rate: parsed.receipt_success_rate ?? null,
      average_run_ms: parsed.average_run_ms ?? null,
      recommended_action: parsed.recommended_action ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(ACCOUNT_HEALTH_SELECT)
    .single()

  if (error) throw error
  return mapAccountHealthSnapshotRow(data)
}

export async function createBrowserOperatorCredentialRef(
  input: CreateBrowserOperatorCredentialRef,
): Promise<BrowserOperatorCredentialRef> {
  const parsed = CreateBrowserOperatorCredentialRefSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_credential_refs')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      browser_account_id: parsed.browser_account_id,
      provider: parsed.provider,
      storage_owner: parsed.storage_owner,
      secret_ref: parsed.secret_ref,
      credential_kind: parsed.credential_kind,
      status: parsed.status ?? 'active',
      requires_feature_flag: parsed.requires_feature_flag ?? null,
      consent_grant_id: parsed.consent_grant_id ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(CREDENTIAL_SELECT)
    .single()

  if (error) throw error
  return mapCredentialRow(data)
}

export async function listBrowserOperatorRuntimeCredentialRefs(input: {
  orgId: string
  browserAccountId: string
  limit?: number
}): Promise<BrowserOperatorRuntimeCredentialRef[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  const { data, error } = await supabase
    .from('browser_operator_credential_refs')
    .select(CREDENTIAL_SELECT)
    .eq('org_id', input.orgId)
    .eq('browser_account_id', input.browserAccountId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorRuntimeCredentialRefs', input.orgId)
    return []
  }
  return (data ?? []).map(mapCredentialRow).map(sanitizeBrowserOperatorCredentialRef)
}

export async function getBrowserOperatorCredentialRef(input: {
  orgId: string
  credentialRefId: string
}): Promise<BrowserOperatorCredentialRef | null> {
  const { data, error } = await supabase
    .from('browser_operator_credential_refs')
    .select(CREDENTIAL_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.credentialRefId)
    .maybeSingle()

  if (error) {
    captureBrowserOperatorDbError(error, 'getBrowserOperatorCredentialRef', input.orgId)
    return null
  }
  return data ? mapCredentialRow(data) : null
}

export async function markBrowserOperatorCredentialAccessed(input: {
  orgId: string
  credentialRefId: string
  opsRunId?: string | null
  auditEventId?: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('browser_operator_credential_refs')
    .update({
      last_used_at: new Date().toISOString(),
      last_access_audit_id: input.auditEventId ?? null,
      last_accessed_by_run_id: input.opsRunId ?? null,
    })
    .eq('org_id', input.orgId)
    .eq('id', input.credentialRefId)

  if (error) captureBrowserOperatorDbError(error, 'markBrowserOperatorCredentialAccessed', input.orgId)
}

export async function createBrowserOperatorConnectSession(
  input: CreateBrowserOperatorConnectSession,
): Promise<BrowserOperatorConnectSession> {
  const parsed = CreateBrowserOperatorConnectSessionSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_connect_sessions')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      browser_account_id: parsed.browser_account_id,
      provider: parsed.provider,
      status: parsed.status ?? 'requested',
      takeover_url: parsed.takeover_url ?? null,
      live_view_url: parsed.live_view_url ?? null,
      provider_session_ref: parsed.provider_session_ref ?? null,
      provider_profile_ref: parsed.provider_profile_ref ?? null,
      provider_context_ref: parsed.provider_context_ref ?? null,
      return_url: parsed.return_url ?? null,
      expires_at: parsed.expires_at ?? null,
      failure_reason: parsed.failure_reason ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(CONNECT_SESSION_SELECT)
    .single()

  if (error) throw error
  return mapConnectSessionRow(data)
}

export async function getBrowserOperatorConnectSession(input: {
  orgId: string
  connectSessionId: string
}): Promise<BrowserOperatorConnectSession | null> {
  const { data, error } = await supabase
    .from('browser_operator_connect_sessions')
    .select(CONNECT_SESSION_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.connectSessionId)
    .maybeSingle()

  if (error) {
    captureBrowserOperatorDbError(error, 'getBrowserOperatorConnectSession', input.orgId)
    return null
  }
  return data ? mapConnectSessionRow(data) : null
}

export async function listBrowserOperatorConnectSessions(input: {
  orgId: string
  browserAccountId?: string | null
  limit?: number
}): Promise<BrowserOperatorConnectSession[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100)
  let query = supabase
    .from('browser_operator_connect_sessions')
    .select(CONNECT_SESSION_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.browserAccountId) query = query.eq('browser_account_id', input.browserAccountId)
  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorConnectSessions', input.orgId)
    return []
  }
  return (data ?? []).map(mapConnectSessionRow)
}

export async function updateBrowserOperatorConnectSession(input: {
  orgId: string
  connectSessionId: string
  patch: UpdateBrowserOperatorConnectSession
}): Promise<BrowserOperatorConnectSession> {
  const parsed = UpdateBrowserOperatorConnectSessionSchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('status' in parsed) updates.status = parsed.status
  if ('takeover_url' in parsed) updates.takeover_url = parsed.takeover_url ?? null
  if ('live_view_url' in parsed) updates.live_view_url = parsed.live_view_url ?? null
  if ('provider_session_ref' in parsed) updates.provider_session_ref = parsed.provider_session_ref ?? null
  if ('provider_profile_ref' in parsed) updates.provider_profile_ref = parsed.provider_profile_ref ?? null
  if ('provider_context_ref' in parsed) updates.provider_context_ref = parsed.provider_context_ref ?? null
  if ('expires_at' in parsed) updates.expires_at = parsed.expires_at ?? null
  if ('connected_at' in parsed) updates.connected_at = parsed.connected_at ?? null
  if ('failure_reason' in parsed) updates.failure_reason = parsed.failure_reason ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_connect_sessions')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.connectSessionId)
    .select(CONNECT_SESSION_SELECT)
    .single()

  if (error) throw error
  return mapConnectSessionRow(data)
}

export async function listBrowserOperatorPurchasePassports(input: {
  orgId: string
  ownerUserId?: string | null
  projectId?: string | null
  status?: BrowserOperatorPurchasePassport['status'] | null
  limit?: number
}): Promise<BrowserOperatorPurchasePassport[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_purchase_passports')
    .select(PURCHASE_PASSPORT_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.ownerUserId) query = query.eq('owner_user_id', input.ownerUserId)
  if (input.projectId) query = query.eq('project_id', input.projectId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorPurchasePassports', input.orgId)
    return []
  }
  return (data ?? []).map(mapPurchasePassportRow)
}

export async function createBrowserOperatorPurchasePassport(
  input: CreateBrowserOperatorPurchasePassport,
): Promise<BrowserOperatorPurchasePassport> {
  const parsed = CreateBrowserOperatorPurchasePassportSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_purchase_passports')
    .insert({
      org_id: parsed.org_id,
      owner_user_id: parsed.owner_user_id ?? null,
      project_id: parsed.project_id ?? null,
      name: parsed.name,
      status: parsed.status ?? 'draft',
      scope: parsed.scope ?? 'personal',
      default_currency: parsed.default_currency,
      default_country: parsed.default_country ?? null,
      consent_policy: parsed.consent_policy ?? {},
      budget_policy: parsed.budget_policy ?? {},
      address_refs: parsed.address_refs ?? [],
      payment_method_refs: parsed.payment_method_refs ?? [],
      memory_scope: parsed.memory_scope ?? {},
      metadata: parsed.metadata ?? {},
    })
    .select(PURCHASE_PASSPORT_SELECT)
    .single()

  if (error) throw error
  return mapPurchasePassportRow(data)
}

export async function updateBrowserOperatorPurchasePassport(input: {
  orgId: string
  passportId: string
  patch: UpdateBrowserOperatorPurchasePassport
}): Promise<BrowserOperatorPurchasePassport> {
  const parsed = UpdateBrowserOperatorPurchasePassportSchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('owner_user_id' in parsed) updates.owner_user_id = parsed.owner_user_id ?? null
  if ('project_id' in parsed) updates.project_id = parsed.project_id ?? null
  if ('name' in parsed) updates.name = parsed.name
  if ('status' in parsed) updates.status = parsed.status
  if ('scope' in parsed) updates.scope = parsed.scope
  if ('default_currency' in parsed) updates.default_currency = parsed.default_currency
  if ('default_country' in parsed) updates.default_country = parsed.default_country ?? null
  if ('consent_policy' in parsed) updates.consent_policy = parsed.consent_policy ?? {}
  if ('budget_policy' in parsed) updates.budget_policy = parsed.budget_policy ?? {}
  if ('address_refs' in parsed) updates.address_refs = parsed.address_refs ?? []
  if ('payment_method_refs' in parsed) updates.payment_method_refs = parsed.payment_method_refs ?? []
  if ('memory_scope' in parsed) updates.memory_scope = parsed.memory_scope ?? {}
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_purchase_passports')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.passportId)
    .select(PURCHASE_PASSPORT_SELECT)
    .single()

  if (error) throw error
  return mapPurchasePassportRow(data)
}

export async function listBrowserOperatorPurchasePolicies(input: {
  orgId: string
  browserAccountId?: string | null
  status?: BrowserOperatorPurchasePolicy['status'] | null
  limit?: number
}): Promise<BrowserOperatorPurchasePolicy[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_purchase_policies')
    .select(POLICY_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.browserAccountId) query = query.eq('browser_account_id', input.browserAccountId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorPurchasePolicies', input.orgId)
    return []
  }
  return (data ?? []).map(mapPolicyRow)
}

export async function getBrowserOperatorPurchasePolicy(input: {
  orgId: string
  policyId: string
}): Promise<BrowserOperatorPurchasePolicy | null> {
  const { data, error } = await supabase
    .from('browser_operator_purchase_policies')
    .select(POLICY_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.policyId)
    .maybeSingle()

  if (error) {
    captureBrowserOperatorDbError(error, 'getBrowserOperatorPurchasePolicy', input.orgId)
    return null
  }
  return data ? mapPolicyRow(data) : null
}

export async function createBrowserOperatorPurchasePolicy(
  input: CreateBrowserOperatorPurchasePolicy,
): Promise<BrowserOperatorPurchasePolicy> {
  const parsed = CreateBrowserOperatorPurchasePolicySchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_purchase_policies')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      project_id: parsed.project_id ?? null,
      browser_account_id: parsed.browser_account_id ?? null,
      name: parsed.name,
      status: parsed.status ?? 'draft',
      schedule: parsed.schedule ?? {},
      max_total_amount: parsed.max_total?.amount ?? null,
      max_total_currency: parsed.max_total?.currency ?? null,
      allowed_merchant_domains: parsed.allowed_merchant_domains ?? [],
      blocked_merchant_domains: parsed.blocked_merchant_domains ?? [],
      allowed_categories: parsed.allowed_categories ?? [],
      blocked_categories: parsed.blocked_categories ?? [],
      max_item_count: parsed.max_item_count ?? null,
      allow_substitutions: parsed.allow_substitutions ?? false,
      max_substitution_delta_percent: parsed.max_substitution_delta_percent ?? 0,
      requires_human_approval: parsed.requires_human_approval ?? true,
      auto_approve_inside_policy: parsed.auto_approve_inside_policy ?? false,
      expires_at: parsed.expires_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(POLICY_SELECT)
    .single()

  if (error) throw error
  return mapPolicyRow(data)
}

export async function updateBrowserOperatorPurchasePolicy(input: {
  orgId: string
  policyId: string
  patch: UpdateBrowserOperatorPurchasePolicy
}): Promise<BrowserOperatorPurchasePolicy> {
  const parsed = UpdateBrowserOperatorPurchasePolicySchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('project_id' in parsed) updates.project_id = parsed.project_id ?? null
  if ('browser_account_id' in parsed) updates.browser_account_id = parsed.browser_account_id ?? null
  if ('name' in parsed) updates.name = parsed.name
  if ('status' in parsed) updates.status = parsed.status
  if ('schedule' in parsed) updates.schedule = parsed.schedule ?? {}
  if ('max_total' in parsed) {
    updates.max_total_amount = parsed.max_total?.amount ?? null
    updates.max_total_currency = parsed.max_total?.currency ?? null
  }
  if ('allowed_merchant_domains' in parsed) updates.allowed_merchant_domains = parsed.allowed_merchant_domains ?? []
  if ('blocked_merchant_domains' in parsed) updates.blocked_merchant_domains = parsed.blocked_merchant_domains ?? []
  if ('allowed_categories' in parsed) updates.allowed_categories = parsed.allowed_categories ?? []
  if ('blocked_categories' in parsed) updates.blocked_categories = parsed.blocked_categories ?? []
  if ('max_item_count' in parsed) updates.max_item_count = parsed.max_item_count ?? null
  if ('allow_substitutions' in parsed) updates.allow_substitutions = parsed.allow_substitutions ?? false
  if ('max_substitution_delta_percent' in parsed) updates.max_substitution_delta_percent = parsed.max_substitution_delta_percent ?? 0
  if ('requires_human_approval' in parsed) updates.requires_human_approval = parsed.requires_human_approval ?? true
  if ('auto_approve_inside_policy' in parsed) updates.auto_approve_inside_policy = parsed.auto_approve_inside_policy ?? false
  if ('expires_at' in parsed) updates.expires_at = parsed.expires_at ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_purchase_policies')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.policyId)
    .select(POLICY_SELECT)
    .single()

  if (error) throw error
  return mapPolicyRow(data)
}

export async function createBrowserOperatorPurchaseRun(input: {
  orgId: string
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  browserAccountId?: string | null
  purchasePolicyId?: string | null
  agentCommerceSpendRequestId?: string | null
  idempotencyKey: string
  merchant: AgentCommerceMerchantInput
  status?: BrowserOperatorPurchaseRun['status']
  cartHash?: string | null
  cartTotal?: { amount: number; currency: string } | null
  policyDecision?: Record<string, unknown>
  approvalState?: BrowserOperatorPurchaseRun['approval_state']
  metadata?: Record<string, unknown>
  cartItems?: BrowserOperatorPurchaseCartItem[]
}): Promise<BrowserOperatorPurchaseRun> {
  const merchant = AgentCommerceMerchantSchema.parse(input.merchant)
  const { data, error } = await supabase
    .from('browser_operator_purchase_runs')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      user_id: input.userId ?? null,
      assistant_id: input.assistantId ?? null,
      ops_run_id: input.opsRunId ?? null,
      browser_account_id: input.browserAccountId ?? null,
      purchase_policy_id: input.purchasePolicyId ?? null,
      agent_commerce_spend_request_id: input.agentCommerceSpendRequestId ?? null,
      idempotency_key: input.idempotencyKey,
      merchant,
      status: input.status ?? 'draft',
      cart_hash: input.cartHash ?? null,
      cart_total_amount: input.cartTotal?.amount ?? null,
      cart_total_currency: input.cartTotal?.currency ?? null,
      policy_decision: input.policyDecision ?? {},
      approval_state: input.approvalState ?? 'required',
      metadata: input.metadata ?? {},
    })
    .select(PURCHASE_RUN_SELECT)
    .single()

  if (error) throw error
  const run = mapPurchaseRunRow(data)
  if (input.cartItems?.length) {
    await insertBrowserOperatorCartItems(run.id, input.cartItems)
  }
  return run
}

export async function getBrowserOperatorPurchaseRun(input: {
  orgId: string
  purchaseRunId: string
}): Promise<BrowserOperatorPurchaseRun | null> {
  const { data, error } = await supabase
    .from('browser_operator_purchase_runs')
    .select(PURCHASE_RUN_SELECT)
    .eq('org_id', input.orgId)
    .eq('id', input.purchaseRunId)
    .maybeSingle()

  if (error) {
    captureBrowserOperatorDbError(error, 'getBrowserOperatorPurchaseRun', input.orgId)
    return null
  }
  return data ? mapPurchaseRunRow(data) : null
}

export async function listBrowserOperatorPurchaseCartItems(input: {
  purchaseRunId: string
}): Promise<BrowserOperatorPurchaseCartItem[]> {
  const { data, error } = await supabase
    .from('browser_operator_purchase_cart_items')
    .select(CART_ITEM_SELECT)
    .eq('purchase_run_id', input.purchaseRunId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    ...normalizeNulls(row),
    quantity: Number((row as { quantity?: unknown }).quantity ?? 0),
    unit_price: (row as { unit_price?: unknown }).unit_price == null
      ? undefined
      : Number((row as { unit_price?: unknown }).unit_price),
    total_price: (row as { total_price?: unknown }).total_price == null
      ? undefined
      : Number((row as { total_price?: unknown }).total_price),
  })) as BrowserOperatorPurchaseCartItem[]
}

export async function updateBrowserOperatorPurchaseRun(input: {
  orgId: string
  purchaseRunId: string
  patch: Partial<Pick<BrowserOperatorPurchaseRun,
    'status' | 'approval_state' | 'receipt_ref' | 'failure_reason' | 'metadata'
  >> & {
    cartTotal?: { amount: number; currency: string } | null
  }
}): Promise<BrowserOperatorPurchaseRun> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('status' in input.patch) updates.status = input.patch.status
  if ('approval_state' in input.patch) updates.approval_state = input.patch.approval_state
  if ('receipt_ref' in input.patch) updates.receipt_ref = input.patch.receipt_ref ?? null
  if ('failure_reason' in input.patch) updates.failure_reason = input.patch.failure_reason ?? null
  if ('metadata' in input.patch) updates.metadata = input.patch.metadata ?? {}
  if ('cartTotal' in input.patch) {
    updates.cart_total_amount = input.patch.cartTotal?.amount ?? null
    updates.cart_total_currency = input.patch.cartTotal?.currency ?? null
  }

  const { data, error } = await supabase
    .from('browser_operator_purchase_runs')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.purchaseRunId)
    .select(PURCHASE_RUN_SELECT)
    .single()

  if (error) throw error
  return mapPurchaseRunRow(data)
}

export async function createBrowserOperatorPurchaseReceipt(
  input: CreateBrowserOperatorPurchaseReceipt,
): Promise<BrowserOperatorPurchaseReceipt> {
  const parsed = CreateBrowserOperatorPurchaseReceiptSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_purchase_receipts')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      browser_account_id: parsed.browser_account_id ?? null,
      purchase_run_id: parsed.purchase_run_id,
      provider: parsed.provider,
      merchant_order_id: parsed.merchant_order_id ?? null,
      receipt_url: parsed.receipt_url ?? null,
      receipt_artifact_uri: parsed.receipt_artifact_uri ?? null,
      total_amount: parsed.total?.amount ?? null,
      total_currency: parsed.total?.currency ?? null,
      purchased_at: parsed.purchased_at ?? null,
      raw_receipt: parsed.raw_receipt ?? {},
      metadata: parsed.metadata ?? {},
    })
    .select(PURCHASE_RECEIPT_SELECT)
    .single()

  if (error) throw error
  return mapPurchaseReceiptRow(data)
}

export async function listBrowserOperatorProfiles(input: {
  orgId: string
  browserAccountId?: string | null
  status?: BrowserOperatorProfile['status'] | null
  limit?: number
}): Promise<BrowserOperatorProfile[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_profiles')
    .select(PROFILE_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.browserAccountId) query = query.eq('browser_account_id', input.browserAccountId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorProfiles', input.orgId)
    return []
  }
  return (data ?? []).map(mapProfileRow)
}

export async function createBrowserOperatorProfile(
  input: CreateBrowserOperatorProfile,
): Promise<BrowserOperatorProfile> {
  const parsed = CreateBrowserOperatorProfileSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_profiles')
    .insert({
      org_id: parsed.org_id,
      user_id: parsed.user_id ?? null,
      browser_account_id: parsed.browser_account_id,
      provider: parsed.provider,
      profile_artifact_ref: parsed.profile_artifact_ref ?? null,
      provider_profile_ref: parsed.provider_profile_ref ?? null,
      provider_context_ref: parsed.provider_context_ref ?? null,
      status: parsed.status ?? 'active',
      last_verified_at: parsed.last_verified_at ?? null,
      expires_at: parsed.expires_at ?? null,
      migration_status: parsed.migration_status ?? 'not_required',
      degraded_reason: parsed.degraded_reason ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(PROFILE_SELECT)
    .single()

  if (error) throw error
  return mapProfileRow(data)
}

export async function updateBrowserOperatorProfile(input: {
  orgId: string
  profileId: string
  patch: UpdateBrowserOperatorProfile
}): Promise<BrowserOperatorProfile> {
  const parsed = UpdateBrowserOperatorProfileSchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('profile_artifact_ref' in parsed) updates.profile_artifact_ref = parsed.profile_artifact_ref ?? null
  if ('provider_profile_ref' in parsed) updates.provider_profile_ref = parsed.provider_profile_ref ?? null
  if ('provider_context_ref' in parsed) updates.provider_context_ref = parsed.provider_context_ref ?? null
  if ('status' in parsed) updates.status = parsed.status
  if ('last_verified_at' in parsed) updates.last_verified_at = parsed.last_verified_at ?? null
  if ('expires_at' in parsed) updates.expires_at = parsed.expires_at ?? null
  if ('migration_status' in parsed) updates.migration_status = parsed.migration_status ?? 'not_required'
  if ('degraded_reason' in parsed) updates.degraded_reason = parsed.degraded_reason ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_profiles')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.profileId)
    .select(PROFILE_SELECT)
    .single()

  if (error) throw error
  return mapProfileRow(data)
}

export async function listBrowserOperatorByoRuntimes(input: {
  orgId: string
  status?: BrowserOperatorByoRuntime['status'] | null
  limit?: number
}): Promise<BrowserOperatorByoRuntime[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_byo_runtimes')
    .select(BYO_RUNTIME_SELECT)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.status) query = query.eq('status', input.status)
  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorByoRuntimes', input.orgId)
    return []
  }
  return (data ?? []).map(mapByoRuntimeRow)
}

export async function createBrowserOperatorByoRuntime(
  input: CreateBrowserOperatorByoRuntime,
): Promise<BrowserOperatorByoRuntime> {
  const parsed = CreateBrowserOperatorByoRuntimeSchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_byo_runtimes')
    .insert({
      org_id: parsed.org_id,
      name: parsed.name,
      provider: 'remote_cdp',
      cdp_endpoint_ref: parsed.cdp_endpoint_ref,
      token_ref: parsed.token_ref ?? null,
      org_connection_id: parsed.org_connection_id ?? null,
      auth_provider: parsed.auth_provider ?? null,
      auth_connection_id: parsed.auth_connection_id ?? null,
      status: parsed.status ?? 'draft',
      allowlisted_domains: parsed.allowlisted_domains ?? [],
      privacy_mode: parsed.privacy_mode ?? 'customer_managed',
      cost_policy: parsed.cost_policy ?? {},
      health: parsed.health ?? {},
      metadata: parsed.metadata ?? {},
    })
    .select(BYO_RUNTIME_SELECT)
    .single()

  if (error) throw error
  return mapByoRuntimeRow(data)
}

export async function updateBrowserOperatorByoRuntime(input: {
  orgId: string
  runtimeId: string
  patch: UpdateBrowserOperatorByoRuntime
}): Promise<BrowserOperatorByoRuntime> {
  const parsed = UpdateBrowserOperatorByoRuntimeSchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('name' in parsed) updates.name = parsed.name
  if ('cdp_endpoint_ref' in parsed) updates.cdp_endpoint_ref = parsed.cdp_endpoint_ref
  if ('token_ref' in parsed) updates.token_ref = parsed.token_ref ?? null
  if ('org_connection_id' in parsed) updates.org_connection_id = parsed.org_connection_id ?? null
  if ('auth_provider' in parsed) updates.auth_provider = parsed.auth_provider ?? null
  if ('auth_connection_id' in parsed) updates.auth_connection_id = parsed.auth_connection_id ?? null
  if ('status' in parsed) updates.status = parsed.status
  if ('allowlisted_domains' in parsed) updates.allowlisted_domains = parsed.allowlisted_domains ?? []
  if ('privacy_mode' in parsed) updates.privacy_mode = parsed.privacy_mode ?? 'customer_managed'
  if ('cost_policy' in parsed) updates.cost_policy = parsed.cost_policy ?? {}
  if ('health' in parsed) updates.health = parsed.health ?? {}
  if ('last_checked_at' in parsed) updates.last_checked_at = parsed.last_checked_at ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_byo_runtimes')
    .update(updates)
    .eq('org_id', input.orgId)
    .eq('id', input.runtimeId)
    .select(BYO_RUNTIME_SELECT)
    .single()

  if (error) throw error
  return mapByoRuntimeRow(data)
}

export async function listBrowserOperatorMerchantNativeCapabilities(input: {
  merchantKey?: string | null
  merchantDomain?: string | null
  country?: string | null
  status?: BrowserOperatorMerchantNativeCapability['status'] | null
  limit?: number
}): Promise<BrowserOperatorMerchantNativeCapability[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  let query = supabase
    .from('browser_operator_merchant_native_capabilities')
    .select(NATIVE_CAPABILITY_SELECT)
    .order('last_verified_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.merchantKey) query = query.eq('merchant_key', input.merchantKey)
  if (input.merchantDomain) query = query.eq('merchant_domain', input.merchantDomain)
  if (input.country) query = query.eq('country', input.country)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    captureBrowserOperatorDbError(error, 'listBrowserOperatorMerchantNativeCapabilities')
    return []
  }
  return (data ?? []).map(mapNativeCapabilityRow)
}

export async function createBrowserOperatorMerchantNativeCapability(
  input: CreateBrowserOperatorMerchantNativeCapability,
): Promise<BrowserOperatorMerchantNativeCapability> {
  const parsed = CreateBrowserOperatorMerchantNativeCapabilitySchema.parse(input)
  const { data, error } = await supabase
    .from('browser_operator_merchant_native_capabilities')
    .insert({
      merchant_key: parsed.merchant_key,
      merchant_domain: parsed.merchant_domain ?? null,
      country: parsed.country ?? null,
      provider: parsed.provider,
      capability_level: parsed.capability_level,
      rail_id: parsed.rail_id,
      status: parsed.status ?? 'research',
      access_model: parsed.access_model,
      supported_operations: parsed.supported_operations ?? [],
      required_credentials: parsed.required_credentials ?? [],
      required_env: parsed.required_env ?? [],
      countries: parsed.countries ?? [],
      promotion_evidence: parsed.promotion_evidence ?? {},
      source_urls: parsed.source_urls ?? [],
      last_verified_at: parsed.last_verified_at ?? null,
      metadata: parsed.metadata ?? {},
    })
    .select(NATIVE_CAPABILITY_SELECT)
    .single()

  if (error) throw error
  return mapNativeCapabilityRow(data)
}

export async function updateBrowserOperatorMerchantNativeCapability(input: {
  capabilityId: string
  patch: UpdateBrowserOperatorMerchantNativeCapability
}): Promise<BrowserOperatorMerchantNativeCapability> {
  const parsed = UpdateBrowserOperatorMerchantNativeCapabilitySchema.parse(input.patch)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('merchant_domain' in parsed) updates.merchant_domain = parsed.merchant_domain ?? null
  if ('country' in parsed) updates.country = parsed.country ?? null
  if ('provider' in parsed) updates.provider = parsed.provider
  if ('capability_level' in parsed) updates.capability_level = parsed.capability_level
  if ('rail_id' in parsed) updates.rail_id = parsed.rail_id
  if ('status' in parsed) updates.status = parsed.status
  if ('access_model' in parsed) updates.access_model = parsed.access_model
  if ('supported_operations' in parsed) updates.supported_operations = parsed.supported_operations ?? []
  if ('required_credentials' in parsed) updates.required_credentials = parsed.required_credentials ?? []
  if ('required_env' in parsed) updates.required_env = parsed.required_env ?? []
  if ('countries' in parsed) updates.countries = parsed.countries ?? []
  if ('promotion_evidence' in parsed) updates.promotion_evidence = parsed.promotion_evidence ?? {}
  if ('source_urls' in parsed) updates.source_urls = parsed.source_urls ?? []
  if ('last_verified_at' in parsed) updates.last_verified_at = parsed.last_verified_at ?? null
  if ('metadata' in parsed) updates.metadata = parsed.metadata ?? {}

  const { data, error } = await supabase
    .from('browser_operator_merchant_native_capabilities')
    .update(updates)
    .eq('id', input.capabilityId)
    .select(NATIVE_CAPABILITY_SELECT)
    .single()

  if (error) throw error
  return mapNativeCapabilityRow(data)
}

export async function recordBrowserOperatorAuditEvent(input: {
  orgId: string
  browserAccountId?: string | null
  credentialRefId?: string | null
  purchaseRunId?: string | null
  opsRunId?: string | null
  actorType?: 'user' | 'agent' | 'runtime' | 'provider' | 'system'
  actorId?: string | null
  eventType: string
  severity?: 'info' | 'warn' | 'error' | 'block'
  reason?: string | null
  result?: string | null
  metadata?: Record<string, unknown>
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('browser_operator_audit_events')
    .insert({
      org_id: input.orgId,
      browser_account_id: input.browserAccountId ?? null,
      credential_ref_id: input.credentialRefId ?? null,
      purchase_run_id: input.purchaseRunId ?? null,
      ops_run_id: input.opsRunId ?? null,
      actor_type: input.actorType ?? 'system',
      actor_id: input.actorId ?? null,
      event_type: input.eventType,
      severity: input.severity ?? 'info',
      reason: input.reason ?? null,
      result: input.result ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()

  if (error) {
    captureBrowserOperatorDbError(error, 'recordBrowserOperatorAuditEvent', input.orgId)
    return null
  }
  return data as { id: string }
}

async function insertBrowserOperatorCartItems(
  purchaseRunId: string,
  cartItems: BrowserOperatorPurchaseCartItem[],
): Promise<void> {
  const rows = cartItems.map((item) => ({
    purchase_run_id: purchaseRunId,
    merchant_item_id: item.merchant_item_id ?? null,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit ?? null,
    unit_price: item.unit_price ?? null,
    total_price: item.total_price ?? null,
    currency: item.currency,
    category: item.category ?? null,
    substitution_for: item.substitution_for ?? null,
    policy_flags: item.policy_flags ?? [],
    metadata: item.metadata ?? {},
  }))
  const { error } = await supabase
    .from('browser_operator_purchase_cart_items')
    .insert(rows)

  if (error) throw error
}

function mapAccountRow(row: unknown): BrowserOperatorAccount {
  return BrowserOperatorAccountSchema.parse(normalizeNulls(row))
}

function mapAlertRow(row: unknown): BrowserOperatorAlert {
  return BrowserOperatorAlertSchema.parse(normalizeNulls(row))
}

function mapAccountHealthSnapshotRow(row: unknown): BrowserOperatorAccountHealthSnapshot {
  const record = normalizeNulls(row)
  return BrowserOperatorAccountHealthSnapshotSchema.parse({
    ...record,
    score: Number(record.score ?? 0),
    captcha_rate: record.captcha_rate == null ? undefined : Number(record.captcha_rate),
    handoff_rate: record.handoff_rate == null ? undefined : Number(record.handoff_rate),
    checkout_success_rate: record.checkout_success_rate == null
      ? undefined
      : Number(record.checkout_success_rate),
    receipt_success_rate: record.receipt_success_rate == null
      ? undefined
      : Number(record.receipt_success_rate),
    average_run_ms: record.average_run_ms == null ? undefined : Number(record.average_run_ms),
  })
}

function mapConnectSessionRow(row: unknown): BrowserOperatorConnectSession {
  return BrowserOperatorConnectSessionSchema.parse(normalizeNulls(row))
}

function mapCredentialRow(row: unknown): BrowserOperatorCredentialRef {
  return BrowserOperatorCredentialRefSchema.parse(normalizeNulls(row))
}

function mapPolicyRow(row: unknown): BrowserOperatorPurchasePolicy {
  const record = normalizeNulls(row)
  return BrowserOperatorPurchasePolicySchema.parse({
    ...record,
    max_substitution_delta_percent: Number(record.max_substitution_delta_percent ?? 0),
    max_total: record.max_total_amount != null && record.max_total_currency
      ? {
          amount: Number(record.max_total_amount),
          currency: String(record.max_total_currency),
        }
      : undefined,
  })
}

function mapPurchasePassportRow(row: unknown): BrowserOperatorPurchasePassport {
  return BrowserOperatorPurchasePassportSchema.parse(normalizeNulls(row))
}

function mapPurchaseRunRow(row: unknown): BrowserOperatorPurchaseRun {
  const record = normalizeNulls(row)
  return BrowserOperatorPurchaseRunSchema.parse({
    ...record,
    cart_total: record.cart_total_amount != null && record.cart_total_currency
      ? {
          amount: Number(record.cart_total_amount),
          currency: String(record.cart_total_currency),
        }
      : undefined,
  })
}

function mapPurchaseReceiptRow(row: unknown): BrowserOperatorPurchaseReceipt {
  const record = normalizeNulls(row)
  return BrowserOperatorPurchaseReceiptSchema.parse({
    ...record,
    total: record.total_amount != null && record.total_currency
      ? {
          amount: Number(record.total_amount),
          currency: String(record.total_currency),
        }
      : undefined,
  })
}

function mapProfileRow(row: unknown): BrowserOperatorProfile {
  return BrowserOperatorProfileSchema.parse(normalizeNulls(row))
}

function mapByoRuntimeRow(row: unknown): BrowserOperatorByoRuntime {
  return BrowserOperatorByoRuntimeSchema.parse(normalizeNulls(row))
}

function mapNativeCapabilityRow(row: unknown): BrowserOperatorMerchantNativeCapability {
  return BrowserOperatorMerchantNativeCapabilitySchema.parse(normalizeNulls(row))
}

function normalizeNulls(value: unknown): Record<string, unknown> {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, item === null ? undefined : item]),
  )
}

function defaultBrowserOperatorAccountHealthScore(
  state: BrowserOperatorAccountHealthSnapshot['health_state'],
): number {
  switch (state) {
    case 'ready':
      return 100
    case 'needs_attention':
      return 70
    case 'needs_login':
      return 45
    case 'expired':
      return 35
    case 'blocked':
    case 'revoked':
      return 0
    case 'unknown':
    default:
      return 50
  }
}

function captureBrowserOperatorDbError(error: unknown, operation: string, orgId?: string): void {
  ErrorService.captureException(error, {
    severity: 'warning',
    context: { orgId, operation },
    tags: { layer: 'database', stack: 'browser-operator' },
  })
}
