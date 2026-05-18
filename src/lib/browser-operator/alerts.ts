import 'server-only'

import type {
  BrowserOperatorAccount,
  BrowserOperatorAccountHealthSnapshot,
  BrowserOperatorAlert,
  BrowserOperatorAlertSeverity,
  BrowserOperatorAlertType,
  BrowserOperatorProfile,
  CreateBrowserOperatorAccountHealthSnapshot,
} from '@contracts/browser-operator'
import {
  createBrowserOperatorAccountHealthSnapshot,
  createBrowserOperatorAlert,
  listBrowserOperatorAlerts,
  updateBrowserOperatorAlert,
} from '@/lib/db/browser-operator'

const ACCOUNT_ALERT_TYPES: BrowserOperatorAlertType[] = [
  'account_needs_connect',
  'account_expired',
  'account_mfa_required',
  'account_captcha_required',
  'account_failed',
  'profile_degraded',
]

export function browserOperatorAlertDedupeKey(parts: {
  alertType: BrowserOperatorAlertType
  browserAccountId?: string | null
  purchaseRunId?: string | null
  opsRunId?: string | null
  merchantKey?: string | null
  provider?: string | null
}): string {
  return [
    parts.alertType,
    parts.browserAccountId ? `account:${parts.browserAccountId}` : null,
    parts.purchaseRunId ? `purchase:${parts.purchaseRunId}` : null,
    parts.opsRunId ? `ops:${parts.opsRunId}` : null,
    parts.merchantKey ? `merchant:${parts.merchantKey}` : null,
    parts.provider ? `provider:${parts.provider}` : null,
  ].filter(Boolean).join('|')
}

export function deriveBrowserOperatorAccountHealth(input: {
  account: BrowserOperatorAccount
  profiles?: BrowserOperatorProfile[]
  now?: Date
}): Omit<CreateBrowserOperatorAccountHealthSnapshot, 'org_id' | 'browser_account_id' | 'user_id'> {
  const { account } = input
  const now = input.now ?? new Date()
  const latestProfile = input.profiles?.[0] ?? null
  const reasons: string[] = []
  let healthState: BrowserOperatorAccountHealthSnapshot['health_state'] = 'unknown'
  let score = 50
  let recommendedAction = 'Review account status before autonomous browser work.'

  const accountExpired = isPast(account.expires_at, now)
  const profileExpired = isPast(latestProfile?.expires_at, now)

  switch (account.auth_state) {
    case 'connected':
      if (accountExpired || profileExpired || latestProfile?.status === 'expired') {
        healthState = 'expired'
        score = 35
        reasons.push('The merchant session or provider profile is expired.')
        recommendedAction = 'Reconnect the merchant account through secure takeover.'
      } else if (latestProfile?.status === 'degraded') {
        healthState = 'needs_attention'
        score = 70
        reasons.push(latestProfile.degraded_reason ?? 'The provider profile is degraded.')
        recommendedAction = 'Run an account health test, then reconnect if the session cannot be reused.'
      } else if (!account.provider_profile_ref && !account.provider_context_ref && !latestProfile) {
        healthState = 'needs_attention'
        score = 75
        reasons.push('The account is marked connected, but no reusable profile/context is recorded.')
        recommendedAction = 'Create a secure takeover session to refresh the browser profile.'
      } else {
        healthState = 'ready'
        score = 100
        reasons.push('Reusable merchant session is available.')
        recommendedAction = 'Ready for policy-gated browsing and assisted checkout.'
      }
      break
    case 'needs_connect':
      healthState = 'needs_login'
      score = 45
      reasons.push('The merchant account has not been connected yet.')
      recommendedAction = 'Open secure takeover and log in once.'
      break
    case 'expired':
      healthState = 'expired'
      score = 35
      reasons.push('The merchant account session has expired.')
      recommendedAction = 'Reconnect the merchant account through secure takeover.'
      break
    case 'mfa_required':
      healthState = 'needs_login'
      score = 40
      reasons.push('The merchant account requires MFA before agents can continue.')
      recommendedAction = 'Complete MFA in secure takeover, then resume the agent.'
      break
    case 'captcha_required':
      healthState = 'blocked'
      score = 20
      reasons.push('The merchant is asking for CAPTCHA or human verification.')
      recommendedAction = 'Use assisted handoff. Lucid should not bypass CAPTCHA.'
      break
    case 'failed':
      healthState = 'blocked'
      score = 10
      reasons.push('The latest merchant connection attempt failed.')
      recommendedAction = 'Review the failed takeover session and reconnect.'
      break
    case 'revoked':
    case 'disabled':
      healthState = 'revoked'
      score = 0
      reasons.push('The account is revoked or disabled.')
      recommendedAction = 'Create a new merchant account connection if this merchant should be used again.'
      break
    default:
      reasons.push('Account state is unknown.')
  }

  return {
    health_state: healthState,
    score,
    reasons,
    profile_status: latestProfile?.status,
    recommended_action: recommendedAction,
    metadata: {
      account_auth_state: account.auth_state,
      provider: account.provider,
      latest_profile_id: latestProfile?.id ?? null,
      derived_at: now.toISOString(),
    },
  }
}

export async function refreshBrowserOperatorAccountHealth(input: {
  orgId: string
  userId?: string | null
  account: BrowserOperatorAccount
  profiles?: BrowserOperatorProfile[]
  workspaceSlug?: string | null
  metadata?: Record<string, unknown>
}): Promise<{
  snapshot: BrowserOperatorAccountHealthSnapshot
  alert: BrowserOperatorAlert | null
}> {
  const health = deriveBrowserOperatorAccountHealth({
    account: input.account,
    profiles: input.profiles,
  })
  const snapshot = await createBrowserOperatorAccountHealthSnapshot({
    org_id: input.orgId,
    user_id: input.userId ?? input.account.user_id,
    browser_account_id: input.account.id,
    ...health,
    metadata: {
      ...(health.metadata ?? {}),
      ...(input.metadata ?? {}),
    },
  })

  const alert = await reconcileBrowserOperatorAccountHealthAlerts({
    orgId: input.orgId,
    userId: input.userId ?? input.account.user_id,
    account: input.account,
    snapshot,
    workspaceSlug: input.workspaceSlug,
  })

  return { snapshot, alert }
}

export async function reconcileBrowserOperatorAccountHealthAlerts(input: {
  orgId: string
  userId?: string | null
  account: BrowserOperatorAccount
  snapshot: BrowserOperatorAccountHealthSnapshot
  workspaceSlug?: string | null
}): Promise<BrowserOperatorAlert | null> {
  if (input.snapshot.health_state === 'ready') {
    await resolveOpenAccountAlerts({
      orgId: input.orgId,
      browserAccountId: input.account.id,
      reason: 'Account health is ready.',
    })
    return null
  }

  const alertType = alertTypeForAccountHealth(input.account, input.snapshot)
  const severity = severityForAccountHealth(input.snapshot)
  const href = input.workspaceSlug
    ? `/${input.workspaceSlug}/mission-control/browser`
    : '/mission-control/browser'

  return createBrowserOperatorAlert({
    org_id: input.orgId,
    user_id: input.userId ?? input.account.user_id,
    browser_account_id: input.account.id,
    alert_type: alertType,
    severity,
    dedupe_key: browserOperatorAlertDedupeKey({
      alertType,
      browserAccountId: input.account.id,
    }),
    title: titleForAccountHealth(input.account, input.snapshot),
    message: input.snapshot.recommended_action
      ?? input.snapshot.reasons[0]
      ?? 'Review this merchant account before running autonomous browser work.',
    href,
    primary_cta: {
      label: ctaLabelForAccountHealth(input.snapshot),
      href,
      action: 'review_browser_account',
    },
    metadata: {
      health_snapshot_id: input.snapshot.id,
      health_state: input.snapshot.health_state,
      score: input.snapshot.score,
      reasons: input.snapshot.reasons,
      merchant_key: input.account.merchant_key,
      provider: input.account.provider,
    },
  })
}

async function resolveOpenAccountAlerts(input: {
  orgId: string
  browserAccountId: string
  reason: string
}): Promise<void> {
  const openAlerts = await listBrowserOperatorAlerts({
    orgId: input.orgId,
    browserAccountId: input.browserAccountId,
    status: ['open', 'acknowledged'],
    limit: 25,
  })
  await Promise.all(openAlerts
    .filter((alert) => ACCOUNT_ALERT_TYPES.includes(alert.alert_type))
    .map((alert) => updateBrowserOperatorAlert({
      orgId: input.orgId,
      alertId: alert.id,
      patch: {
        status: 'resolved',
        metadata: {
          ...(alert.metadata ?? {}),
          resolved_reason: input.reason,
          resolved_by: 'browser_operator_account_health',
        },
      },
    }).catch(() => null)))
}

function alertTypeForAccountHealth(
  account: BrowserOperatorAccount,
  snapshot: BrowserOperatorAccountHealthSnapshot,
): BrowserOperatorAlertType {
  if (account.auth_state === 'mfa_required') return 'account_mfa_required'
  if (account.auth_state === 'captcha_required') return 'account_captcha_required'
  if (account.auth_state === 'failed') return 'account_failed'
  if (snapshot.health_state === 'expired') return 'account_expired'
  if (snapshot.profile_status === 'degraded') return 'profile_degraded'
  return 'account_needs_connect'
}

function severityForAccountHealth(
  snapshot: BrowserOperatorAccountHealthSnapshot,
): BrowserOperatorAlertSeverity {
  switch (snapshot.health_state) {
    case 'blocked':
    case 'revoked':
      return 'critical'
    case 'expired':
    case 'needs_login':
      return 'warning'
    case 'needs_attention':
      return 'needs_attention'
    case 'ready':
      return 'info'
    case 'unknown':
    default:
      return 'needs_attention'
  }
}

function titleForAccountHealth(
  account: BrowserOperatorAccount,
  snapshot: BrowserOperatorAccountHealthSnapshot,
): string {
  switch (snapshot.health_state) {
    case 'blocked':
      return `${account.merchant_name} needs human takeover`
    case 'expired':
      return `${account.merchant_name} session expired`
    case 'needs_login':
      return `${account.merchant_name} needs secure login`
    case 'needs_attention':
      return `${account.merchant_name} account needs attention`
    case 'revoked':
      return `${account.merchant_name} account is disabled`
    default:
      return `${account.merchant_name} account status changed`
  }
}

function ctaLabelForAccountHealth(snapshot: BrowserOperatorAccountHealthSnapshot): string {
  switch (snapshot.health_state) {
    case 'blocked':
      return 'Open assisted handoff'
    case 'expired':
    case 'needs_login':
      return 'Reconnect account'
    case 'needs_attention':
      return 'Review account'
    default:
      return 'Open Browser Operator'
  }
}

function isPast(value: string | null | undefined, now: Date): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= now.getTime()
}
