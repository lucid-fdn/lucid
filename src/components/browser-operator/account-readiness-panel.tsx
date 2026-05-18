'use client'

import { useState } from 'react'
import { Activity, ExternalLink, KeyRound, RotateCw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { formatBrowserDate, formatBrowserLabel, shortId } from './format'
import type {
  BrowserOperatorAccount,
  BrowserOperatorAccountHealthSnapshot,
  BrowserOperatorAlert,
  BrowserOperatorConnectSession,
  BrowserOperatorProfile,
} from './types'

interface BrowserAccountReadinessPanelProps {
  accounts: BrowserOperatorAccount[]
  profiles: BrowserOperatorProfile[]
  connectSessions: BrowserOperatorConnectSession[]
  alerts: BrowserOperatorAlert[]
  healthSnapshots: BrowserOperatorAccountHealthSnapshot[]
  orgId: string
  workspaceSlug: string
  loading?: boolean
  onChanged?: () => Promise<void> | void
}

export function BrowserAccountReadinessPanel({
  accounts,
  profiles,
  connectSessions,
  alerts,
  healthSnapshots,
  orgId,
  workspaceSlug,
  loading,
  onChanged,
}: BrowserAccountReadinessPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const readyCount = accounts.filter((account) => healthFor(healthSnapshots, account.id)?.health_state === 'ready' || account.auth_state === 'connected').length
  const blockedCount = accounts.filter((account) => {
    const health = healthFor(healthSnapshots, account.id)
    return health?.health_state === 'blocked'
      || health?.health_state === 'expired'
      || account.auth_state === 'captcha_required'
      || account.auth_state === 'mfa_required'
  }).length

  const requestConnectSession = async (account: BrowserOperatorAccount) => {
    setBusy(`connect:${account.id}`)
    try {
      const payload = await browserOperatorWrite(`/api/browser-operator/accounts/${account.id}/connect-session`, {
        orgId,
        return_url: `${window.location.origin}/${workspaceSlug}/mission-control/browser`,
        metadata: { source: 'mission_control_browser_operator_readiness' },
      }) as { connect_session?: BrowserOperatorConnectSession & { takeover_url?: string | null } }
      if (payload.connect_session?.takeover_url) {
        window.open(payload.connect_session.takeover_url, '_blank', 'noopener,noreferrer')
      }
      toast.info('Secure takeover ready', 'Log in once, then mark the merchant account connected.')
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start secure takeover')
    } finally {
      setBusy(null)
    }
  }

  const testAccount = async (account: BrowserOperatorAccount) => {
    setBusy(`test:${account.id}`)
    try {
      await browserOperatorWrite(`/api/browser-operator/accounts/${account.id}/test`, {
        orgId,
        workspaceSlug,
        metadata: { source: 'mission_control_browser_operator_readiness' },
      })
      toast.success('Account health refreshed')
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not test merchant account')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Authenticated browser readiness</h2>
          <p className="text-xs text-muted-foreground">
            Merchant sessions are connected once, reused by policy, and routed to assisted handoff when CAPTCHA, MFA, expiry, or provider drift appears.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{readyCount}/{accounts.length} ready</Badge>
          {blockedCount > 0 ? <Badge variant="destructive">{blockedCount} need help</Badge> : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {loading ? (
          <EmptyCard label="Loading account readiness..." />
        ) : accounts.length === 0 ? (
          <EmptyCard label="No merchant accounts yet. Add one below, then connect it through secure takeover." />
        ) : accounts.map((account) => {
          const health = healthFor(healthSnapshots, account.id)
          const latestProfile = profiles.find((profile) => profile.browser_account_id === account.id) ?? null
          const latestSession = connectSessions.find((session) => session.browser_account_id === account.id) ?? null
          const activeAlerts = alerts.filter((alert) => alert.browser_account_id === account.id && ['open', 'acknowledged'].includes(alert.status))
          return (
            <article
              key={account.id}
              className="rounded-xl border bg-background p-4"
              data-testid={`browser-account-readiness-${account.merchant_key}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <h3 className="truncate text-sm font-semibold">{account.merchant_name}</h3>
                    <Badge variant={healthVariant(health, account)}>
                      {formatBrowserLabel(health?.health_state ?? account.auth_state)}
                    </Badge>
                    <Badge variant="secondary">{formatBrowserLabel(account.provider)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.merchant_key} · account {shortId(account.id)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{health?.score ?? fallbackScore(account)}</p>
                  <p className="text-[11px] text-muted-foreground">health score</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <ReadinessLine label="Last verified" value={account.last_verified_at ? formatBrowserDate(account.last_verified_at) : 'Never'} />
                <ReadinessLine label="Profile" value={latestProfile ? `${formatBrowserLabel(latestProfile.status)} · ${shortId(latestProfile.provider_profile_ref)}` : 'No reusable profile'} />
                <ReadinessLine label="Context" value={shortId(account.provider_context_ref ?? latestProfile?.provider_context_ref)} />
                <ReadinessLine label="Alerts" value={activeAlerts.length ? `${activeAlerts.length} active` : 'None'} />
              </div>

              {health && (health.reasons.length || health.recommended_action) ? (
                <div className="mt-4 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  {health.reasons.slice(0, 2).map((reason) => (
                    <p key={reason} className="text-muted-foreground">{reason}</p>
                  ))}
                  {health.recommended_action ? (
                    <p className="mt-1 font-medium">{health.recommended_action}</p>
                  ) : null}
                </div>
              ) : null}

              {latestSession ? (
                <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Latest takeover: <span className="font-medium">{formatBrowserLabel(latestSession.status)}</span>
                    </span>
                    <a
                      className="font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-300"
                      href={`/${workspaceSlug}/mission-control/browser/connect/${latestSession.id}`}
                    >
                      Review
                    </a>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => { void testAccount(account) }}
                >
                  <Activity className="h-4 w-4" />
                  Test
                </Button>
                <Button
                  variant={needsReconnect(health, account) ? 'default' : 'outline'}
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => { void requestConnectSession(account) }}
                >
                  <RotateCw className="h-4 w-4" />
                  Reconnect
                </Button>
                {latestSession?.takeover_url ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={latestSession.takeover_url} target="_blank" rel="noreferrer">
                      Open takeover
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
      <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
        Passwords and payment secrets stay outside agent context. Lucid stores account/policy state and provider profile references; risky checkout still goes through Trust Shield.
      </div>
    </section>
  )
}

async function browserOperatorWrite(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const csrf = await getCSRFTokenFromCookie()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Browser Operator request failed (${response.status})`)
  }
  return payload
}

function healthFor(
  snapshots: BrowserOperatorAccountHealthSnapshot[],
  accountId: string,
): BrowserOperatorAccountHealthSnapshot | null {
  return snapshots.find((snapshot) => snapshot.browser_account_id === accountId) ?? null
}

function healthVariant(
  health: BrowserOperatorAccountHealthSnapshot | null,
  account: BrowserOperatorAccount,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  const state = health?.health_state ?? account.auth_state
  if (state === 'ready' || state === 'connected') return 'outline'
  if (state === 'blocked' || state === 'revoked' || state === 'failed' || state === 'captcha_required') return 'destructive'
  if (state === 'needs_login' || state === 'expired' || state === 'mfa_required') return 'secondary'
  return 'default'
}

function needsReconnect(
  health: BrowserOperatorAccountHealthSnapshot | null,
  account: BrowserOperatorAccount,
): boolean {
  const state = health?.health_state ?? account.auth_state
  return ['needs_login', 'expired', 'blocked', 'needs_connect', 'mfa_required', 'captcha_required', 'failed'].includes(state)
}

function fallbackScore(account: BrowserOperatorAccount): number {
  switch (account.auth_state) {
    case 'connected':
      return 90
    case 'needs_connect':
      return 45
    case 'expired':
      return 35
    case 'mfa_required':
      return 40
    case 'captcha_required':
      return 20
    case 'revoked':
    case 'disabled':
    case 'failed':
      return 0
    default:
      return 50
  }
}

function ReadinessLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <span className="font-medium text-foreground">{label}:</span> {value}
    </div>
  )
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground lg:col-span-2">
      {label}
    </div>
  )
}
