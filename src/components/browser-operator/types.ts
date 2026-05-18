export type BrowserOperatorHealth = 'ready' | 'needs_review' | 'blocked' | 'empty'
export type BrowserOperatorTrustState = 'active' | 'draft' | 'deprecated' | 'quarantined' | 'blocked'
export type BrowserOperatorSessionStatus = 'active' | 'handoff_required' | 'resumable' | 'completed' | 'failed'

export interface BrowserOperatorProcedure {
  id: string
  name: string
  hostPattern: string
  procedureType: string
  scope: string
  trustState: BrowserOperatorTrustState
  sourceRunId: string | null
  triggerPreview: string
  updatedAt: string
}

export interface BrowserOperatorPlaybook {
  id: string
  title: string
  hostPattern: string
  scope: string
  trustState: BrowserOperatorTrustState
  successfulUses: number
  securityFlagsCount: number
  lastUsedAt: string | null
  updatedAt: string
}

export interface BrowserOperatorSession {
  sessionKey: string
  runId: string
  browserSessionId: string | null
  status: BrowserOperatorSessionStatus
  trustState: 'protected' | 'degraded' | 'blocked'
  latestEventType: string
  latestMessage: string | null
  currentUrl: string | null
  screenshotUri: string | null
  handoffState: string | null
  eventCount: number
  shareCount: number
  activeShareCount: number
  sharedActionCount: number
  blockingTrustEventCount: number
  warningTrustEventCount: number
  updatedAt: string | null
}

export interface BrowserSecurityEvent {
  id: string
  orgId: string
  projectId: string | null
  opsRunId: string | null
  browserSessionId: string | null
  eventType: string
  severity: 'info' | 'warn' | 'block'
  layer: string
  host: string | null
  urlHash: string | null
  contentHash: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface BrowserOperatorAccount {
  id: string
  org_id: string
  user_id?: string | null
  project_id?: string | null
  merchant_key: string
  merchant_name: string
  provider: string
  provider_account_ref?: string | null
  org_connection_id?: string | null
  auth_provider?: string | null
  auth_connection_id?: string | null
  provider_profile_ref?: string | null
  provider_context_ref?: string | null
  auth_state: string
  capabilities: string[]
  default_credential_ref_id?: string | null
  last_verified_at?: string | null
  expires_at?: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorConnectSession {
  id: string
  org_id: string
  user_id?: string | null
  browser_account_id: string
  provider: string
  status: string
  takeover_url?: string | null
  live_view_url?: string | null
  provider_session_ref?: string | null
  provider_profile_ref?: string | null
  provider_context_ref?: string | null
  return_url?: string | null
  expires_at?: string | null
  connected_at?: string | null
  failure_reason?: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorPurchasePolicy {
  id: string
  org_id: string
  user_id?: string | null
  project_id?: string | null
  browser_account_id?: string | null
  name: string
  status: string
  max_total?: { amount: number; currency: string } | null
  allowed_merchant_domains: string[]
  blocked_merchant_domains: string[]
  allowed_categories: string[]
  blocked_categories: string[]
  max_item_count?: number | null
  allow_substitutions: boolean
  max_substitution_delta_percent: number
  requires_human_approval: boolean
  auto_approve_inside_policy: boolean
  expires_at?: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorCheckoutAdapterManifest {
  id: string
  label: string
  status: 'available' | 'planned'
  lifecycle?: string
  mode: 'sandbox' | 'merchant_specific'
  merchantKeys: string[]
  merchantDomains: string[]
  supportedProviders: string[]
  countries?: string[]
  requiredEnv: string[]
  requiredAccountCapabilities: string[]
  receiptStrategy: 'synthetic_sandbox' | 'merchant_receipt_page' | 'email_or_order_history'
  reliability?: {
    tier: 'live_supported' | 'assisted' | 'research_only' | 'blocked'
    capabilities: string[]
    knownFailureReasons: string[]
    requiresTakeover: boolean
    apiAvailable: boolean
    preferredProviders: string[]
    lastVerifiedAt?: string | null
    telemetry?: {
      successRate?: number
      takeoverRate?: number
      captchaRate?: number
      receiptParseSuccessRate?: number
      checkoutDriftRate?: number
      averageDurationMs?: number
      sampleSize?: number
    }
  }
  failClosedReason?: string | null
  notes: string[]
}

export interface BrowserOperatorProfile {
  id: string
  org_id: string
  user_id?: string | null
  browser_account_id: string
  provider: string
  profile_artifact_ref?: string | null
  provider_profile_ref?: string | null
  provider_context_ref?: string | null
  status: string
  last_verified_at?: string | null
  expires_at?: string | null
  migration_status: string
  degraded_reason?: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorAlert {
  id: string
  org_id: string
  user_id?: string | null
  browser_account_id?: string | null
  purchase_run_id?: string | null
  ops_run_id?: string | null
  alert_type: string
  severity: 'info' | 'needs_attention' | 'warning' | 'critical'
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed'
  dedupe_key: string
  title: string
  message?: string | null
  primary_cta: {
    label?: string
    href?: string
    action?: string
  }
  href?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorAccountHealthSnapshot {
  id: string
  org_id: string
  user_id?: string | null
  browser_account_id: string
  health_state: 'ready' | 'needs_login' | 'needs_attention' | 'expired' | 'blocked' | 'revoked' | 'unknown'
  score: number
  reasons: string[]
  profile_status?: string | null
  last_successful_run_at?: string | null
  last_failed_run_at?: string | null
  last_handoff_at?: string | null
  last_receipt_at?: string | null
  captcha_rate?: number | null
  handoff_rate?: number | null
  checkout_success_rate?: number | null
  receipt_success_rate?: number | null
  average_run_ms?: number | null
  recommended_action?: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorByoRuntime {
  id: string
  org_id: string
  name: string
  provider: 'remote_cdp'
  cdp_endpoint_ref: string
  token_ref?: string | null
  org_connection_id?: string | null
  auth_provider?: string | null
  auth_connection_id?: string | null
  status: string
  allowlisted_domains: string[]
  privacy_mode: string
  cost_policy: Record<string, unknown>
  health: Record<string, unknown>
  last_checked_at?: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BrowserOperatorCapacity {
  default_provider: string
  external_providers_enabled: boolean
  byo_providers_enabled: boolean
  premium_fallback_enabled: boolean
  gateway?: Record<string, unknown> | null
}

export interface BrowserSessionEvent {
  id: string
  orgId: string
  runId: string
  browserSessionId: string | null
  sessionKey: string
  eventType: string
  severity: 'info' | 'warn' | 'error'
  handoffState: string | null
  currentUrl: string | null
  artifactId: string | null
  screenshotUri: string | null
  message: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface BrowserOperatorConsoleData {
  schemaVersion: 1
  health: BrowserOperatorHealth
  summary: {
    procedureCount: number
    activeProcedureCount: number
    quarantinedProcedureCount: number
    playbookCount: number
    activePlaybookCount: number
    sessionCount: number
    activeSessionCount: number
    handoffSessionCount: number
    resumableSessionCount: number
    blockingTrustEventCount: number
    warningTrustEventCount: number
    activeShareCount: number
  }
  procedures: BrowserOperatorProcedure[]
  playbooks: BrowserOperatorPlaybook[]
  sessions: BrowserOperatorSession[]
  warnings: string[]
}

export interface BrowserProcedureVersion {
  id: string
  procedureId: string
  version: number
  definitionKind: string
  definition: Record<string, unknown>
  fixtureArtifactId: string | null
  testDefinition: Record<string, unknown>
  capabilities: string[]
  riskLevel: 'low' | 'medium' | 'high'
  approvalPolicy: Record<string, unknown>
  contentHash: string
  createdByUserId: string | null
  createdAt: string
}

export interface BrowserProcedureDetail {
  procedure: {
    id: string
    name: string
    slug?: string
    hostPattern: string
    description: string
    intentTriggers: string[]
    procedureType: string
    scope: string
    trustState: BrowserOperatorTrustState
    sourceRunId: string | null
    metadata?: Record<string, unknown>
    updatedAt: string
  }
  versions: BrowserProcedureVersion[]
}

export interface BrowserOperatorOverview {
  browserOperator?: BrowserOperatorConsoleData
  browserSecurityEvents?: BrowserSecurityEvent[]
  browserSessionEvents?: BrowserSessionEvent[]
}

export type ProcedureTrustAction = 'promote' | 'deprecate' | 'quarantine' | 'block' | 'restore_draft'
export type PlaybookTrustAction = 'promote' | 'deprecate' | 'quarantine' | 'block'
export type BrowserSessionAction = 'resolve' | 'resume'
