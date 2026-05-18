'use client'

import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { formatBrowserDate, formatBrowserLabel, shortId } from './format'
import type {
  BrowserOperatorAccount,
  BrowserOperatorCheckoutAdapterManifest,
  BrowserOperatorConnectSession,
  BrowserOperatorPurchasePolicy,
} from './types'

interface BrowserAccountPolicyPanelProps {
  accounts: BrowserOperatorAccount[]
  connectSessions: BrowserOperatorConnectSession[]
  policies: BrowserOperatorPurchasePolicy[]
  checkoutAdapters: BrowserOperatorCheckoutAdapterManifest[]
  orgId: string
  workspaceSlug: string
  loading?: boolean
  onChanged?: () => Promise<void> | void
}

export function BrowserAccountPolicyPanel({
  accounts,
  connectSessions,
  policies,
  checkoutAdapters,
  orgId,
  workspaceSlug,
  loading,
  onChanged,
}: BrowserAccountPolicyPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState({
    merchantName: '',
    merchantKey: '',
    provider: 'lucid_managed',
    authProvider: '',
    authConnectionId: '',
  })
  const [policyForm, setPolicyForm] = useState({
    name: '',
    browserAccountId: '',
    maxTotal: '',
    domains: '',
    categories: '',
  })
  const activePolicies = policies.filter((policy) => policy.status === 'active')
  const connectedAccounts = accounts.filter((account) => account.auth_state === 'connected')

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('create-account')
    try {
      await browserOperatorWrite('/api/browser-operator/accounts', {
        org_id: orgId,
        merchant_name: accountForm.merchantName,
        merchant_key: accountForm.merchantKey || slugify(accountForm.merchantName),
        provider: accountForm.provider,
        auth_provider: accountForm.authProvider || undefined,
        auth_connection_id: accountForm.authConnectionId || undefined,
        auth_state: 'needs_connect',
        metadata: { source: 'mission_control_browser_operator_accounts' },
      })
      toast.success('Merchant account created', 'Use secure takeover to connect it before autonomous runs.')
      setAccountForm({ merchantName: '', merchantKey: '', provider: 'lucid_managed', authProvider: '', authConnectionId: '' })
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create merchant account')
    } finally {
      setBusy(null)
    }
  }

  const submitPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('create-policy')
    try {
      const maxTotal = Number(policyForm.maxTotal)
      await browserOperatorWrite('/api/browser-operator/purchase-policies', {
        org_id: orgId,
        browser_account_id: policyForm.browserAccountId || undefined,
        name: policyForm.name,
        status: 'active',
        max_total: Number.isFinite(maxTotal) && maxTotal > 0
          ? { amount: Math.round(maxTotal * 100), currency: 'usd' }
          : undefined,
        allowed_merchant_domains: splitCsv(policyForm.domains),
        allowed_categories: splitCsv(policyForm.categories),
        requires_human_approval: true,
        auto_approve_inside_policy: false,
        metadata: { source: 'mission_control_browser_operator_policies' },
      })
      toast.success('Standing policy created', 'Checkout remains approval-gated until you explicitly enable autonomy.')
      setPolicyForm({ name: '', browserAccountId: '', maxTotal: '', domains: '', categories: '' })
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create purchase policy')
    } finally {
      setBusy(null)
    }
  }

  const requestConnectSession = async (account: BrowserOperatorAccount) => {
    setBusy(`connect:${account.id}`)
    try {
      const payload = await browserOperatorWrite(`/api/browser-operator/accounts/${account.id}/connect-session`, {
        orgId,
        return_url: `${window.location.origin}/${workspaceSlug}/mission-control/browser`,
        metadata: { source: 'mission_control_browser_operator_accounts' },
      }) as { connect_session?: BrowserOperatorConnectSession & { takeover_url?: string | null } }
      if (payload.connect_session?.takeover_url) {
        window.open(payload.connect_session.takeover_url, '_blank', 'noopener,noreferrer')
      }
      toast.info('Secure takeover ready', 'Open the takeover session, log in once, then mark the account connected.')
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not request connect session')
    } finally {
      setBusy(null)
    }
  }

  const revokeAccount = async (account: BrowserOperatorAccount) => {
    setBusy(`revoke:${account.id}`)
    try {
      await browserOperatorWrite(`/api/browser-operator/accounts/${account.id}?orgId=${encodeURIComponent(orgId)}`, undefined, 'DELETE')
      toast.success('Merchant account revoked')
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke merchant account')
    } finally {
      setBusy(null)
    }
  }

  const revokePolicy = async (policy: BrowserOperatorPurchasePolicy) => {
    setBusy(`policy:${policy.id}`)
    try {
      await browserOperatorWrite(`/api/browser-operator/purchase-policies/${policy.id}?orgId=${encodeURIComponent(orgId)}`, undefined, 'DELETE')
      toast.success('Purchase policy revoked')
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke purchase policy')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-lg border bg-card">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Merchant accounts</h2>
            <p className="text-xs text-muted-foreground">
              Lucid-owned account state. Provider profiles and sessions are adapter handles only.
            </p>
          </div>
          <Badge variant="outline">{connectedAccounts.length}/{accounts.length} connected</Badge>
        </div>
        <form onSubmit={submitAccount} className="grid gap-2 border-b bg-muted/20 p-4 md:grid-cols-[1fr_0.7fr_0.6fr_auto]">
          <Input
            placeholder="Merchant name, e.g. Instacart"
            value={accountForm.merchantName}
            onChange={(event) => setAccountForm((current) => ({ ...current, merchantName: event.target.value }))}
            required
          />
          <Input
            placeholder="Key, e.g. instacart"
            value={accountForm.merchantKey}
            onChange={(event) => setAccountForm((current) => ({ ...current, merchantKey: event.target.value }))}
          />
          <Select
            value={accountForm.provider}
            onValueChange={(provider) => setAccountForm((current) => ({ ...current, provider }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lucid_managed">Lucid managed</SelectItem>
              <SelectItem value="browserbase">Browserbase</SelectItem>
              <SelectItem value="steel">Steel</SelectItem>
              <SelectItem value="browserless">Browserless</SelectItem>
              <SelectItem value="playwright">Playwright</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={Boolean(busy)}>
            Add
          </Button>
          <Input
            className="md:col-span-2"
            placeholder="Nango auth provider, e.g. browserbase or steel"
            value={accountForm.authProvider}
            onChange={(event) => setAccountForm((current) => ({ ...current, authProvider: event.target.value }))}
          />
          <Input
            className="md:col-span-2"
            placeholder="Nango connectionId for provider auth"
            value={accountForm.authConnectionId}
            onChange={(event) => setAccountForm((current) => ({ ...current, authConnectionId: event.target.value }))}
          />
        </form>
        <div className="divide-y">
          {loading ? (
            <EmptyRow label="Loading merchant accounts..." />
          ) : accounts.length === 0 ? (
            <EmptyRow label="No merchant accounts connected yet." />
          ) : accounts.map((account) => (
            <div
              key={account.id}
              data-testid={`browser-account-${account.merchant_key}`}
              className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                {latestSessionForAccount(connectSessions, account.id) ? (
                  <LatestConnectSession
                    session={latestSessionForAccount(connectSessions, account.id)!}
                    workspaceSlug={workspaceSlug}
                  />
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{account.merchant_name}</span>
                  <Badge variant={account.auth_state === 'connected' ? 'outline' : 'secondary'}>
                    {formatBrowserLabel(account.auth_state)}
                  </Badge>
                  <Badge variant="secondary">{formatBrowserLabel(account.provider)}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  account {shortId(account.id)} · profile {shortId(account.provider_profile_ref)} · context {shortId(account.provider_context_ref)}
                </p>
                {account.auth_connection_id ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Nango auth {account.auth_provider ?? 'provider'} · connection {shortId(account.auth_connection_id)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <span className="text-xs text-muted-foreground">
                  {account.last_verified_at ? `Verified ${formatBrowserDate(account.last_verified_at)}` : `Updated ${formatBrowserDate(account.updated_at)}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => { void requestConnectSession(account) }}
                >
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => { void revokeAccount(account) }}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Standing purchase policies</h2>
            <p className="text-xs text-muted-foreground">
              Autonomy rules for buying: budget, merchants, categories, substitutions, and approval mode.
            </p>
          </div>
          <Badge variant="outline">{activePolicies.length}/{policies.length} active</Badge>
        </div>
        <form onSubmit={submitPolicy} className="grid gap-2 border-b bg-muted/20 p-4 md:grid-cols-[1fr_0.7fr_0.55fr_auto]">
          <Input
            placeholder="Policy name, e.g. Weekly groceries"
            value={policyForm.name}
            onChange={(event) => setPolicyForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
          <Select
            value={policyForm.browserAccountId || 'none'}
            onValueChange={(browserAccountId) => setPolicyForm((current) => ({
              ...current,
              browserAccountId: browserAccountId === 'none' ? '' : browserAccountId,
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No account yet</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.merchant_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Max $"
            value={policyForm.maxTotal}
            onChange={(event) => setPolicyForm((current) => ({ ...current, maxTotal: event.target.value }))}
          />
          <Button type="submit" disabled={Boolean(busy)}>
            Add
          </Button>
          <Input
            className="md:col-span-2"
            placeholder="Allowed domains, comma-separated"
            value={policyForm.domains}
            onChange={(event) => setPolicyForm((current) => ({ ...current, domains: event.target.value }))}
          />
          <Input
            className="md:col-span-2"
            placeholder="Allowed categories, comma-separated"
            value={policyForm.categories}
            onChange={(event) => setPolicyForm((current) => ({ ...current, categories: event.target.value }))}
          />
        </form>
        <div className="divide-y">
          {loading ? (
            <EmptyRow label="Loading purchase policies..." />
          ) : policies.length === 0 ? (
            <EmptyRow label="No standing purchase policies yet." />
          ) : policies.map((policy) => (
            <div key={policy.id} data-testid={`browser-policy-${policy.id}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{policy.name}</span>
                  <Badge variant={policy.status === 'active' ? 'outline' : 'secondary'}>
                    {formatBrowserLabel(policy.status)}
                  </Badge>
                  <Badge variant={policy.auto_approve_inside_policy ? 'outline' : 'secondary'}>
                    {policy.auto_approve_inside_policy ? 'Auto inside policy' : 'Approval gated'}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() => { void revokePolicy(policy) }}
                >
                  Revoke
                </Button>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <PolicyLine label="Max" value={formatMoney(policy.max_total)} />
                <PolicyLine label="Domains" value={formatList(policy.allowed_merchant_domains, 'Any allowed')} />
                <PolicyLine label="Categories" value={formatList(policy.allowed_categories, 'Any category')} />
                <PolicyLine
                  label="Substitutions"
                  value={policy.allow_substitutions ? `Allowed up to ${policy.max_substitution_delta_percent}%` : 'Not allowed'}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Checkout adapters</h2>
            <p className="text-xs text-muted-foreground">
              Real buying is merchant-specific. Planned adapters stay fail-closed until the flow, profile, approval, idempotency, and receipt parser are verified.
            </p>
          </div>
          <Badge variant="outline">
            {checkoutAdapters.filter((adapter) => adapter.reliability?.tier === 'live_supported').length}/{checkoutAdapters.length} auto-buy
          </Badge>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {checkoutAdapters.length === 0 ? (
            <div className="text-sm text-muted-foreground">No checkout adapter registry loaded.</div>
          ) : checkoutAdapters.map((adapter) => (
            <div key={adapter.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">{adapter.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{formatList(adapter.merchantDomains, 'No domains')}</p>
                </div>
                <Badge variant={reliabilityBadgeVariant(adapter)}>
                  {reliabilityLabel(adapter)}
                </Badge>
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <PolicyLine label="Mode" value={formatBrowserLabel(adapter.mode)} />
                <PolicyLine label="Receipts" value={formatBrowserLabel(adapter.receiptStrategy)} />
                <PolicyLine label="Preferred" value={formatList(adapter.reliability?.preferredProviders ?? adapter.supportedProviders, 'Any')} />
                <PolicyLine label="Capabilities" value={formatList(adapter.reliability?.capabilities ?? [], 'Research only')} />
                {adapter.reliability?.knownFailureReasons.length ? (
                  <PolicyLine label="Risks" value={formatList(adapter.reliability.knownFailureReasons, 'No known risks')} />
                ) : null}
                {adapter.reliability?.requiresTakeover ? (
                  <PolicyLine label="Takeover" value="Required for risky checkout steps" />
                ) : null}
                {adapter.reliability?.tier !== 'live_supported' ? (
                  <PolicyLine label="Missing" value={formatList(adapter.requiredAccountCapabilities, 'Merchant implementation')} />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

async function browserOperatorWrite(
  url: string,
  body?: Record<string, unknown>,
  method = 'POST',
): Promise<unknown> {
  const csrf = await getCSRFTokenFromCookie()
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Browser Operator request failed (${response.status})`)
  }
  return payload
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'merchant'
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{label}</div>
}

function LatestConnectSession({
  session,
  workspaceSlug,
}: {
  session: BrowserOperatorConnectSession
  workspaceSlug: string
}) {
  const href = `/${workspaceSlug}/mission-control/browser/connect/${session.id}`
  return (
    <div className="mb-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Latest takeover: <span className="font-medium">{formatBrowserLabel(session.status)}</span>
        </span>
        <a className="font-medium text-blue-700 underline-offset-4 hover:underline dark:text-blue-300" href={href}>
          Review
        </a>
      </div>
    </div>
  )
}

function PolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <span className="font-medium text-foreground">{label}:</span> {value}
    </div>
  )
}

function formatMoney(value: { amount: number; currency: string } | null | undefined): string {
  if (!value) return 'No fixed cap'
  return `${(value.amount / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: value.currency.toUpperCase(),
  })}`
}

function formatList(values: string[], fallback: string): string {
  if (values.length === 0) return fallback
  return values.slice(0, 3).join(', ') + (values.length > 3 ? ` +${values.length - 3}` : '')
}

function reliabilityLabel(adapter: BrowserOperatorCheckoutAdapterManifest): string {
  switch (adapter.reliability?.tier) {
    case 'live_supported':
      return 'Auto-buy supported'
    case 'assisted':
      return 'Assisted checkout'
    case 'research_only':
      return 'Research only'
    case 'blocked':
      return 'Blocked'
    default:
      return adapter.status === 'available' ? 'Executable' : 'Planned'
  }
}

function reliabilityBadgeVariant(adapter: BrowserOperatorCheckoutAdapterManifest): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (adapter.reliability?.tier) {
    case 'live_supported':
      return 'outline'
    case 'assisted':
      return 'secondary'
    case 'research_only':
      return 'secondary'
    case 'blocked':
      return 'destructive'
    default:
      return adapter.status === 'available' ? 'outline' : 'secondary'
  }
}

function latestSessionForAccount(
  sessions: BrowserOperatorConnectSession[],
  accountId: string,
): BrowserOperatorConnectSession | null {
  return sessions.find((session) => session.browser_account_id === accountId) ?? null
}
