'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, History, Save, ShieldCheck } from 'lucide-react'
import type { AppDeploymentEvent } from '@contracts/app-service'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

interface AppCommerceActionsProps {
  appId: string
  frontendManifest: Record<string, unknown>
  paymentEvents: AppDeploymentEvent[]
}

type CommerceMode = 'off' | 'shadow' | 'enforce'
type RefundPolicy = 'none' | 'manual_review' | 'provider_supported'
type ResourceType = 'generated_app_action' | 'generated_app_api' | 'mcp_resource'

interface PaidActionDraft {
  action: string
  name: string
  mode: CommerceMode
  amount: string
  currency: string
  provider: string
  rail: string
  resourceType: ResourceType
  resourceId: string
  label: string
  freeQuotaPerSession: string
  refundPolicy: RefundPolicy
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): string {
  return typeof value === 'number' ? String(value) : ''
}

function optionalPositiveInteger(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function formatActionLabel(action: string) {
  return action.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function publicActionWorkflows(manifest: Record<string, unknown>) {
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : []
  return workflows.flatMap((workflow) => {
    const record = recordValue(workflow)
    if (record.trigger !== 'public_action') return []
    const action = stringValue(record.public_action_key)
    if (!action) return []
    return [{
      action,
      name: stringValue(record.name) || formatActionLabel(action),
    }]
  })
}

function paidActions(manifest: Record<string, unknown>) {
  const commerce = recordValue(manifest.commerce)
  return recordValue(commerce.paid_actions)
}

function buildInitialDrafts(manifest: Record<string, unknown>): PaidActionDraft[] {
  const workflows = publicActionWorkflows(manifest)
  const workflowNames = new Map(workflows.map((workflow) => [workflow.action, workflow.name]))
  const paid = paidActions(manifest)
  const actions = [...new Set([...workflows.map((workflow) => workflow.action), ...Object.keys(paid)])].sort()

  return actions.map((action) => {
    const config = recordValue(paid[action])
    const amount = recordValue(config.amount)
    return {
      action,
      name: workflowNames.get(action) ?? formatActionLabel(action),
      mode: config.mode === 'shadow' || config.mode === 'enforce' ? config.mode : 'off',
      amount: numberValue(amount.amount),
      currency: stringValue(amount.currency) || 'usd',
      provider: stringValue(config.provider) || 'machine_payments_x402',
      rail: stringValue(config.rail) || 'machine_payment_x402',
      resourceType: config.resource_type === 'generated_app_api' || config.resource_type === 'mcp_resource'
        ? config.resource_type
        : 'generated_app_action',
      resourceId: stringValue(config.resource_id),
      label: stringValue(config.label),
      freeQuotaPerSession: numberValue(config.free_quota_per_session),
      refundPolicy: config.refund_policy === 'none' || config.refund_policy === 'provider_supported'
        ? config.refund_policy
        : 'manual_review',
    }
  })
}

function eventAmount(event: AppDeploymentEvent): { amount: number; currency: string } | null {
  const payload = recordValue(event.payload)
  const amount = recordValue(payload.amount)
  const rawAmount = amount.amount
  const currency = stringValue(amount.currency) || 'usd'
  return typeof rawAmount === 'number' && Number.isFinite(rawAmount)
    ? { amount: rawAmount, currency }
    : null
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

async function warmCsrf() {
  await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => undefined)
  return getCSRFTokenFromCookie()
}

export function AppCommerceActions({
  appId,
  frontendManifest,
  paymentEvents,
}: AppCommerceActionsProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState(() => buildInitialDrafts(frontendManifest))
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const metrics = useMemo(() => {
    const claimed = paymentEvents.filter((event) => event.event_type === 'public_action_payment_claimed')
    const gross = claimed.reduce((sum, event) => sum + (eventAmount(event)?.amount ?? 0), 0)
    const currency = claimed.map(eventAmount).find(Boolean)?.currency ?? 'usd'
    return {
      configured: drafts.filter((draft) => draft.mode !== 'off').length,
      shadow: drafts.filter((draft) => draft.mode === 'shadow').length,
      enforced: drafts.filter((draft) => draft.mode === 'enforce').length,
      claimed: claimed.length,
      gross,
      currency,
    }
  }, [drafts, paymentEvents])

  function setDraft(action: string, patch: Partial<PaidActionDraft>) {
    setDrafts((current) => current.map((draft) => (
      draft.action === action ? { ...draft, ...patch } : draft
    )))
  }

  async function submitCommerce() {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    setMessage(null)

    try {
      const paidActions = Object.fromEntries(drafts.map((draft) => {
        if (draft.mode === 'off') {
          return [draft.action, {
            mode: 'off',
            resource_type: draft.resourceType,
            refund_policy: draft.refundPolicy,
          }]
        }

        const amount = optionalPositiveInteger(draft.amount)
        if (!amount || amount <= 0) {
          throw new Error(`${draft.name} needs a positive minor-unit amount.`)
        }

        const freeQuota = optionalPositiveInteger(draft.freeQuotaPerSession)
        return [draft.action, {
          mode: draft.mode,
          amount: {
            amount,
            currency: draft.currency.trim().toLowerCase() || 'usd',
          },
          provider: draft.provider || undefined,
          rail: draft.rail || undefined,
          resource_type: draft.resourceType,
          resource_id: draft.resourceId.trim() || undefined,
          label: draft.label.trim() || undefined,
          free_quota_per_session: freeQuota,
          refund_policy: draft.refundPolicy,
        }]
      }))

      const csrf = await warmCsrf()
      const response = await fetch(`/api/app-services/${appId}/settings`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          commerce: { paid_actions: paidActions },
        }),
      })

      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Commerce settings update failed.')
      }

      setMessage('Commerce settings saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commerce settings update failed.')
    } finally {
      setIsSaving(false)
    }
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        No public actions are declared for this app.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Configured" value={String(metrics.configured)} icon={<ShieldCheck className="h-4 w-4" />} />
        <Metric label="Shadow" value={String(metrics.shadow)} icon={<ShieldCheck className="h-4 w-4" />} />
        <Metric label="Enforced" value={String(metrics.enforced)} icon={<DollarSign className="h-4 w-4" />} />
        <Metric label="Claimed" value={metrics.claimed ? formatMoney(metrics.gross, metrics.currency) : '0'} icon={<History className="h-4 w-4" />} />
      </div>

      <div className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.action} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{draft.name}</p>
                <p className="text-xs text-muted-foreground">{draft.action}</p>
              </div>
              <select
                value={draft.mode}
                onChange={(event) => setDraft(draft.action, { mode: event.target.value as CommerceMode })}
                className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="off">Off</option>
                <option value="shadow">Shadow</option>
                <option value="enforce">Enforce</option>
              </select>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Amount</span>
                <input
                  value={draft.amount}
                  inputMode="numeric"
                  onChange={(event) => setDraft(draft.action, { amount: event.target.value })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Currency</span>
                <input
                  value={draft.currency}
                  maxLength={12}
                  onChange={(event) => setDraft(draft.action, { currency: event.target.value.toLowerCase() })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Free quota</span>
                <input
                  value={draft.freeQuotaPerSession}
                  inputMode="numeric"
                  onChange={(event) => setDraft(draft.action, { freeQuotaPerSession: event.target.value })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Refund</span>
                <select
                  value={draft.refundPolicy}
                  onChange={(event) => setDraft(draft.action, { refundPolicy: event.target.value as RefundPolicy })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="manual_review">Manual review</option>
                  <option value="provider_supported">Provider supported</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Provider</span>
                <select
                  value={draft.provider}
                  onChange={(event) => setDraft(draft.action, { provider: event.target.value })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="machine_payments_x402">Machine x402</option>
                  <option value="machine_payments_mpp">Machine MPP</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Rail</span>
                <select
                  value={draft.rail}
                  onChange={(event) => setDraft(draft.action, { rail: event.target.value })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="machine_payment_x402">x402</option>
                  <option value="machine_payment_mpp">MPP</option>
                  <option value="manual_approval">Manual</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Resource</span>
                <select
                  value={draft.resourceType}
                  onChange={(event) => setDraft(draft.action, { resourceType: event.target.value as ResourceType })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="generated_app_action">Action</option>
                  <option value="generated_app_api">API</option>
                  <option value="mcp_resource">MCP</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-foreground">Resource ID</span>
                <input
                  value={draft.resourceId}
                  onChange={(event) => setDraft(draft.action, { resourceId: event.target.value })}
                  className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>

            <label className="mt-3 grid gap-1 text-sm">
              <span className="font-medium text-foreground">Label</span>
              <input
                value={draft.label}
                onChange={(event) => setDraft(draft.action, { label: event.target.value })}
                className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <button
        type="button"
        onClick={() => void submitCommerce()}
        disabled={isSaving}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {isSaving ? 'Saving...' : 'Save commerce'}
      </button>

      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Payment Proof History</h4>
        {paymentEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment proof events yet.</p>
        ) : (
          <ol className="space-y-2">
            {paymentEvents.slice(0, 8).map((event) => {
              const amount = eventAmount(event)
              return (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{event.event_type.replaceAll('_', ' ')}</p>
                    <p className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
                  </div>
                  <span className="text-muted-foreground">
                    {amount ? formatMoney(amount.amount, amount.currency) : 'No amount'}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}
