'use client'

import { useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { formatBrowserDate, formatBrowserLabel, shortId } from './format'
import type {
  BrowserOperatorByoRuntime,
  BrowserOperatorCapacity,
  BrowserOperatorProfile,
} from './types'

interface BrowserCapacityPanelProps {
  orgId: string
  capacity: BrowserOperatorCapacity | null
  profiles: BrowserOperatorProfile[]
  byoRuntimes: BrowserOperatorByoRuntime[]
  loading?: boolean
  onChanged?: () => Promise<void> | void
}

export function BrowserCapacityPanel({
  orgId,
  capacity,
  profiles,
  byoRuntimes,
  loading,
  onChanged,
}: BrowserCapacityPanelProps) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '',
    cdpEndpointRef: '',
    domains: '',
    authProvider: '',
    authConnectionId: '',
  })
  const pool = extractPool(capacity?.gateway)
  const poolPressure = stringValue(pool?.pressure, 'unknown')
  const activeLeases = numberValue(pool?.activeLeases)
  const queuedRequests = numberValue(pool?.queuedRequests)
  const avgLeaseWaitMs = numberValue(pool?.avgLeaseWaitMs)
  const estimatedActiveCostUsdPerHour = numberValue(pool?.estimatedActiveCostUsdPerHour)

  const submitByoRuntime = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      await browserOperatorWrite('/api/browser-operator/byo-runtimes', {
        org_id: orgId,
        name: form.name,
        cdp_endpoint_ref: form.cdpEndpointRef,
        auth_provider: form.authProvider || undefined,
        auth_connection_id: form.authConnectionId || undefined,
        allowlisted_domains: splitCsv(form.domains),
        privacy_mode: 'customer_managed',
        status: 'draft',
        metadata: { source: 'mission_control_browser_capacity' },
      })
      toast.success('BYO runtime saved', 'Enable BYO routing only after its health check is green.')
      setForm({ name: '', cdpEndpointRef: '', domains: '', authProvider: '', authConnectionId: '' })
      await onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save BYO runtime')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Browser capacity</h2>
          <p className="text-xs text-muted-foreground">
            Lucid Playwright is the default. Hosted providers and BYO CDP are explicit capacity choices, not automatic lock-in.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <CapacityTile label="Default route" value={formatBrowserLabel(capacity?.default_provider ?? 'playwright')} />
          <CapacityTile label="Gateway" value={pool?.ok === false ? 'Degraded' : 'Ready'} variant={pool?.ok === false ? 'destructive' : 'outline'} />
          <CapacityTile label="External providers" value={capacity?.external_providers_enabled ? 'Enabled' : 'Disabled'} />
          <CapacityTile label="BYO runtime" value={capacity?.byo_providers_enabled ? 'Enabled' : 'Disabled'} />
          <CapacityTile label="Premium fallback" value={capacity?.premium_fallback_enabled ? 'Enabled' : 'Disabled'} />
          <CapacityTile label="Pool pressure" value={formatBrowserLabel(poolPressure)} />
        </div>
        <div className="border-t p-4 text-xs text-muted-foreground">
          <div className="grid gap-2 sm:grid-cols-2">
            <span>Active sessions: {activeLeases}</span>
            <span>Queued: {queuedRequests}</span>
            <span>Avg lease wait: {avgLeaseWaitMs}ms</span>
            <span>Estimated active cost: ${estimatedActiveCostUsdPerHour}/h</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Pinned profiles</h2>
          <p className="text-xs text-muted-foreground">
            Authenticated accounts and checkout runs stay attached to a profile. If it degrades, Lucid asks for reconnect instead of unsafe fallback.
          </p>
        </div>
        <div className="divide-y">
          {loading ? (
            <EmptyRow label="Loading profiles..." />
          ) : profiles.length === 0 ? (
            <EmptyRow label="No browser profiles recorded yet." />
          ) : profiles.map((profile) => (
            <div key={profile.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Profile {shortId(profile.id)}</span>
                  <Badge variant={profile.status === 'active' ? 'outline' : 'secondary'}>{formatBrowserLabel(profile.status)}</Badge>
                  <Badge variant="secondary">{formatBrowserLabel(profile.provider)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  account {shortId(profile.browser_account_id)} · migration {formatBrowserLabel(profile.migration_status)}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {profile.last_verified_at ? `Verified ${formatBrowserDate(profile.last_verified_at)}` : `Updated ${formatBrowserDate(profile.updated_at)}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card xl:col-span-2">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">BYO CDP runtimes</h2>
          <p className="text-xs text-muted-foreground">
            Customer-heavy usage can bring its own browser runtime. Lucid stores encrypted refs and policy; the browser endpoint remains customer-managed.
          </p>
        </div>
        <form onSubmit={submitByoRuntime} className="grid gap-2 border-b bg-muted/20 p-4 md:grid-cols-[0.8fr_1fr_1fr_auto]">
          <Input
            placeholder="Runtime name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
          <Input
            placeholder="Encrypted CDP endpoint ref"
            value={form.cdpEndpointRef}
            onChange={(event) => setForm((current) => ({ ...current, cdpEndpointRef: event.target.value }))}
            required
          />
          <Input
            placeholder="Allowed domains, comma-separated"
            value={form.domains}
            onChange={(event) => setForm((current) => ({ ...current, domains: event.target.value }))}
          />
          <Button type="submit" disabled={busy || loading}>Add</Button>
          <Input
            className="md:col-span-2"
            placeholder="Nango auth provider for runtime token"
            value={form.authProvider}
            onChange={(event) => setForm((current) => ({ ...current, authProvider: event.target.value }))}
          />
          <Input
            className="md:col-span-2"
            placeholder="Nango connectionId for runtime auth"
            value={form.authConnectionId}
            onChange={(event) => setForm((current) => ({ ...current, authConnectionId: event.target.value }))}
          />
        </form>
        <div className="divide-y">
          {loading ? (
            <EmptyRow label="Loading BYO runtimes..." />
          ) : byoRuntimes.length === 0 ? (
            <EmptyRow label="No BYO runtime configured." />
          ) : byoRuntimes.map((runtime) => (
            <div key={runtime.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{runtime.name}</span>
                  <Badge variant={runtime.status === 'healthy' ? 'outline' : 'secondary'}>{formatBrowserLabel(runtime.status)}</Badge>
                  <Badge variant="secondary">{formatBrowserLabel(runtime.privacy_mode)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  endpoint ref {shortId(runtime.cdp_endpoint_ref)} · domains {runtime.allowlisted_domains.slice(0, 3).join(', ') || 'not limited yet'}
                </p>
                {runtime.auth_connection_id ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nango auth {runtime.auth_provider ?? 'provider'} · connection {shortId(runtime.auth_connection_id)}
                  </p>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {runtime.last_checked_at ? `Checked ${formatBrowserDate(runtime.last_checked_at)}` : `Created ${formatBrowserDate(runtime.created_at)}`}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function CapacityTile({
  label,
  value,
  variant = 'outline',
}: {
  label: string
  value: string
  variant?: 'outline' | 'secondary' | 'destructive'
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Badge className="mt-1" variant={variant}>{value}</Badge>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{label}</div>
}

async function browserOperatorWrite(url: string, body: Record<string, unknown>): Promise<unknown> {
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

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function extractPool(gateway: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const payload = gateway?.payload
  if (!payload || typeof payload !== 'object') return null
  const pool = (payload as { pool?: unknown }).pool
  return pool && typeof pool === 'object' ? pool as Record<string, unknown> : null
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
