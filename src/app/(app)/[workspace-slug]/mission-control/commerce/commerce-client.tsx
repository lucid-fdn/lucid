'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  Link2,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  AgentCommerceConnection,
  AgentCommerceEvent,
  AgentCommerceProviderManifest,
  AgentSpendRequest,
  AgentSpendRequestStatus,
} from '@contracts/agent-commerce'
import type {
  AgentCommerceDashboardLedgerAggregates,
  AgentCommerceProductionDashboardSummary,
} from '@/lib/agent-commerce/dashboard-metrics'
import type { AgentCommerceProviderPromotionResult } from '@/lib/agent-commerce/provider-promotion'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { CapabilityGate } from '@/components/mission-control/capability-gate'
import { EmptyState } from '@/components/mission-control/empty-state'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { cn } from '@/lib/utils'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import type { SharedContextRecordType } from '@contracts/shared-context'

interface ProviderHealthRecord {
  provider: string
  mode: 'live' | 'preview' | 'waitlist' | 'disabled'
  status: 'healthy' | 'degraded' | 'disabled'
  last_success_at?: string
  last_failure_at?: string
  failure_count: number
  metadata: Record<string, unknown>
  updated_at: string
}

interface ProviderEventMismatch {
  event_id: string
  provider?: string
  event_type: string
  entity_type: string
  entity_id: string
  reason: string
  created_at: string
}

interface CommerceKnowledgeEvidenceEvent {
  id: string
  org_id: string
  commerce_event_id: string
  operation_id: string
  surface: string
  success: boolean
  output_summary: string | null
  metadata: Record<string, unknown>
  created_at: string
}

interface CommerceContextRecordLink {
  id: string
  scope_type: string
  scope_id: string
  record_type: string
  title: string
  source_type: string | null
  source_id: string | null
  created_at?: string
}

interface TeamTarget {
  id: string
  name: string
}

interface CommerceClientProps {
  orgId: string
  workspaceSlug: string
  currentUserId: string
}

interface CommerceData {
  summary: {
    total: number
    open_approval: number
    waiting_connection: number
    issuing: number
    completed: number
    failed_or_declined: number
    by_status: Record<string, number>
  }
  budget_summary: {
    total: number
    reserved: number
    captured: number
    released_or_expired: number
    failed: number
    by_status: Record<string, number>
  }
  provider_promotion: AgentCommerceProviderPromotionResult[]
  production_event_counts: Record<string, number>
  production_ledger_aggregates: AgentCommerceDashboardLedgerAggregates
  production_provider_mismatch_count: number
  production_summary: AgentCommerceProductionDashboardSummary
  spend_requests: AgentSpendRequest[]
  connections: AgentCommerceConnection[]
  provider_manifests: AgentCommerceProviderManifest[]
  provider_health: ProviderHealthRecord[]
  provider_event_mismatches: ProviderEventMismatch[]
  provider_promotion_block_events: AgentCommerceEvent[]
  commerce_knowledge_evidence: CommerceKnowledgeEvidenceEvent[]
  events: AgentCommerceEvent[]
}

const EMPTY_DATA: CommerceData = {
  summary: {
    total: 0,
    open_approval: 0,
    waiting_connection: 0,
    issuing: 0,
    completed: 0,
    failed_or_declined: 0,
    by_status: {},
  },
  budget_summary: {
    total: 0,
    reserved: 0,
    captured: 0,
    released_or_expired: 0,
    failed: 0,
    by_status: {},
  },
  provider_promotion: [],
  production_event_counts: {},
  production_provider_mismatch_count: 0,
  production_ledger_aggregates: {
    spend: {
      total_requests: 0,
      completed_requests: 0,
      spend_failures: 0,
      requested_volume: { by_currency: {} },
      completed_volume: { by_currency: {} },
      captured_budget: { by_currency: {} },
    },
    budget: {
      budget_failures: 0,
    },
    revenue: {
      completed_grants: 0,
      active_entitlements: 0,
      revoked_or_expired_entitlements: 0,
      completed_volume: { by_currency: {} },
    },
  },
  production_summary: {
    spend: {
      total_requests: 0,
      completed_requests: 0,
      requested_volume: { by_currency: {} },
      completed_volume: { by_currency: {} },
      captured_budget: { by_currency: {} },
    },
    failures: {
      total: 0,
      spend_failures: 0,
      budget_failures: 0,
      provider_mismatches: 0,
      provider_promotion_blocks: 0,
    },
    replay: {
      claimed_proofs: 0,
      replayed_proofs: 0,
      replay_rate: 0,
    },
    providers: {
      total: 0,
      live: 0,
      healthy: 0,
      degraded: 0,
      disabled: 0,
      global_failure_count: 0,
    },
    revenue: {
      completed_grants: 0,
      active_entitlements: 0,
      revoked_or_expired_entitlements: 0,
      completed_volume: { by_currency: {} },
    },
  },
  spend_requests: [],
  connections: [],
  provider_manifests: [],
  provider_health: [],
  provider_event_mismatches: [],
  provider_promotion_block_events: [],
  commerce_knowledge_evidence: [],
  events: [],
}

const FILTERS: Array<{ id: 'all' | AgentSpendRequestStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'requires_approval', label: 'Approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'credential_issuing', label: 'Issuing' },
  { id: 'completed', label: 'Done' },
  { id: 'failed', label: 'Failed' },
]

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-transparent',
  requires_connection: 'bg-amber-500/15 text-amber-600 border-transparent',
  requires_approval: 'bg-blue-500/15 text-blue-600 border-transparent',
  approved: 'bg-cyan-500/15 text-cyan-600 border-transparent',
  credential_issuing: 'bg-amber-500/15 text-amber-600 border-transparent',
  credential_issued: 'bg-emerald-500/15 text-emerald-600 border-transparent',
  completed: 'bg-emerald-500/15 text-emerald-600 border-transparent',
  declined: 'bg-red-500/15 text-red-600 border-transparent',
  expired: 'bg-muted text-muted-foreground border-transparent',
  failed: 'bg-red-500/15 text-red-600 border-transparent',
  cancelled: 'bg-muted text-muted-foreground border-transparent',
}

const HEALTH_TONE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-600 border-transparent',
  degraded: 'bg-amber-500/15 text-amber-600 border-transparent',
  disabled: 'bg-muted text-muted-foreground border-transparent',
}

const PROVIDER_PROMOTION_BLOCKED_EVENT_TYPE = 'provider_promotion.blocked'
const CONTEXT_ATTACH_TYPES = ['thesis', 'signal', 'feedback', 'daily_intel', 'risk'] as const

type CommerceAttachScope = 'workspace' | 'project' | 'team'
type CommerceAttachRecordType = Extract<
  SharedContextRecordType,
  'thesis' | 'signal' | 'feedback' | 'daily_intel' | 'risk'
>

function moneyLabel(request: AgentSpendRequest): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: request.amount.currency.toUpperCase(),
  }).format(request.amount.amount / 100)
}

function moneyRollupLabel(rollup: AgentCommerceProductionDashboardSummary['spend']['completed_volume']): string {
  if (!rollup.primary) return '$0'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: rollup.primary.currency.toUpperCase(),
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(rollup.primary.amount / 100)
}

function providerHealthLabel(summary: AgentCommerceProductionDashboardSummary['providers']): string {
  if (summary.total === 0) return '0'
  return `${summary.healthy}/${summary.total}`
}

function ageLabel(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const mins = Math.max(0, Math.floor(diffMs / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function payloadStringList(payload: AgentCommerceEvent['payload'] | undefined, key: string): string[] {
  const value = payload?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function payloadString(payload: AgentCommerceEvent['payload'] | undefined, key: string): string | null {
  const value = payload?.[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function metadataRecord(metadata: Record<string, unknown> | undefined, key: string): Record<string, unknown> | null {
  const value = metadata?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function eventEvidenceMetadata(evidence: CommerceKnowledgeEvidenceEvent[]): Record<string, unknown> {
  return evidence[0]?.metadata ?? {}
}

function evidenceMetadataString(evidence: CommerceKnowledgeEvidenceEvent[], key: string): string | null {
  return metadataString(eventEvidenceMetadata(evidence), key)
}

function commerceEventTitle(event: AgentCommerceEvent): string {
  return event.event_type.replace(/[._]/g, ' ')
}

function evidenceField(
  event: AgentCommerceEvent,
  evidence: CommerceKnowledgeEvidenceEvent[],
  key: string,
): string | null {
  return evidenceMetadataString(evidence, key) ?? payloadString(event.payload, key)
}

function selectedProjectId(event: AgentCommerceEvent, evidence: CommerceKnowledgeEvidenceEvent[]): string | null {
  return evidenceField(event, evidence, 'project_id')
}

function selectedTeamId(event: AgentCommerceEvent, evidence: CommerceKnowledgeEvidenceEvent[]): string | null {
  return evidenceField(event, evidence, 'team_id')
}

function summarizeUnknown(value: unknown, maxLength = 900): string {
  if (value === null || value === undefined) return 'Not attached'
  if (typeof value === 'string') return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const json = JSON.stringify(value, null, 2)
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json
  } catch {
    return 'Unserializable value'
  }
}

function compactPayloadSummary(payload: AgentCommerceEvent['payload'] | undefined): string {
  if (!payload || Object.keys(payload).length === 0) return 'No payload recorded.'
  const entries = Object.entries(payload)
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${summarizeUnknown(value, 160).replace(/\s+/g, ' ')}`)
  return entries.join('\n')
}

function evidenceRows(event: AgentCommerceEvent): Array<{ label: string; value: string }> {
  return [
    { label: 'Commerce event', value: event.id ?? 'pending' },
    { label: 'Entity', value: `${event.entity_type}:${event.entity_id}` },
    { label: 'Provider event', value: event.provider_event_id ?? payloadString(event.payload, 'provider_event_id') ?? 'not attached' },
    { label: 'Request', value: event.request_id ?? payloadString(event.payload, 'request_id') ?? 'not attached' },
    { label: 'Run', value: event.run_id ?? payloadString(event.payload, 'run_id') ?? 'not attached' },
    { label: 'Outcome', value: payloadString(event.payload, 'outcome') ?? payloadString(event.payload, 'reason') ?? payloadString(event.payload, 'status') ?? 'recorded' },
  ]
}

function provenanceRows(
  event: AgentCommerceEvent,
  evidence: CommerceKnowledgeEvidenceEvent[],
): Array<{ label: string; value: string }> {
  const latestEvidence = evidence[0]
  return [
    { label: 'Commerce event', value: event.id ?? 'pending' },
    { label: 'Knowledge row', value: latestEvidence?.id ?? 'not mirrored yet' },
    { label: 'Operation', value: latestEvidence?.operation_id ?? 'not mirrored yet' },
    { label: 'Provider', value: event.provider ?? evidenceField(event, evidence, 'provider') ?? 'not attached' },
    { label: 'Provider event', value: event.provider_event_id ?? evidenceField(event, evidence, 'provider_event_id') ?? 'not attached' },
    { label: 'Provider request', value: evidenceField(event, evidence, 'provider_request_id') ?? 'not attached' },
    { label: 'Provider payment', value: evidenceField(event, evidence, 'provider_payment_id') ?? 'not attached' },
    { label: 'Request', value: event.request_id ?? evidenceField(event, evidence, 'request_id') ?? 'not attached' },
    { label: 'Run', value: event.run_id ?? evidenceField(event, evidence, 'run_id') ?? 'not attached' },
    { label: 'Idempotency', value: evidenceField(event, evidence, 'idempotency_key') ?? 'not attached' },
    { label: 'Budget', value: evidenceField(event, evidence, 'budget_reservation_id') ?? 'not attached' },
    { label: 'Seller', value: evidenceField(event, evidence, 'seller_id') ?? 'not attached' },
    { label: 'Ledger', value: evidenceField(event, evidence, 'ledger_id') ?? 'not attached' },
    { label: 'Project', value: selectedProjectId(event, evidence) ?? 'not attached' },
    { label: 'Team', value: selectedTeamId(event, evidence) ?? 'not attached' },
    { label: 'Agent', value: evidenceField(event, evidence, 'assistant_id') ?? 'not attached' },
  ]
}

function commerceContextBody(event: AgentCommerceEvent, evidence: CommerceKnowledgeEvidenceEvent[]): string {
  const latestEvidence = evidence[0]
  const metadata = eventEvidenceMetadata(evidence)
  const amount = metadata.amount ?? event.payload?.amount
  const currency = metadataString(metadata, 'currency') ?? payloadString(event.payload, 'currency')
  const amountLabel = typeof amount === 'number' && currency
    ? `${amount} ${currency.toUpperCase()}`
    : typeof amount === 'string'
      ? amount
      : null
  return [
    latestEvidence?.output_summary ?? `Commerce event: ${event.event_type}.`,
    `Entity: ${event.entity_type}:${event.entity_id}`,
    `Provider: ${event.provider ?? metadataString(metadata, 'provider') ?? 'commerce'}`,
    metadataString(metadata, 'status') ? `Status: ${metadataString(metadata, 'status')}` : null,
    metadataString(metadata, 'outcome') ? `Outcome: ${metadataString(metadata, 'outcome')}` : null,
    amountLabel ? `Amount: ${amountLabel}` : null,
    `Evidence: ${latestEvidence?.id ?? 'pending Knowledge mirror'}`,
  ].filter(Boolean).join('\n')
}

function compactCommerceMetadata(event: AgentCommerceEvent, evidence: CommerceKnowledgeEvidenceEvent[]): Record<string, unknown> {
  const metadata = eventEvidenceMetadata(evidence)
  return {
    commerce_event_id: event.id ?? null,
    knowledge_operation_event_id: evidence[0]?.id ?? null,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    event_type: event.event_type,
    provider: event.provider ?? metadataString(metadata, 'provider'),
    request_id: event.request_id ?? metadataString(metadata, 'request_id'),
    run_id: event.run_id ?? metadataString(metadata, 'run_id'),
    provider_event_id: event.provider_event_id ?? metadataString(metadata, 'provider_event_id'),
    idempotency_key: metadataString(metadata, 'idempotency_key'),
    budget_reservation_id: metadataString(metadata, 'budget_reservation_id'),
    seller_id: metadataString(metadata, 'seller_id'),
    ledger_id: metadataString(metadata, 'ledger_id'),
    source: 'mission_control_commerce',
  }
}

function contextRecordHref({
  workspaceSlug,
  projectSlug,
  record,
}: {
  workspaceSlug: string
  projectSlug: string | null
  record: Pick<CommerceContextRecordLink, 'scope_type' | 'scope_id'>
}): string {
  if (record.scope_type === 'project' && projectSlug) {
    return `/${workspaceSlug}/projects/${projectSlug}/settings`
  }
  if (record.scope_type === 'team' && projectSlug) {
    return `/${workspaceSlug}/projects/${projectSlug}/teams/${record.scope_id}`
  }
  return `/${workspaceSlug}/dashboard`
}

function riskSignals(request: AgentSpendRequest): string[] {
  const signals: string[] = []
  if (request.amount.amount >= 50_000) signals.push('High amount')
  if (!['usd', 'eur', 'gbp'].includes(request.amount.currency.toLowerCase())) signals.push('Currency')
  if (request.provider === 'crypto_wallet' || request.rail === 'crypto_wallet_transfer') signals.push('Wallet rail')
  if (request.router_decision?.reason_codes?.includes('risk_manual_review')) signals.push('Manual risk')
  if (request.merchant.country && !['US', 'CA', 'GB', 'FR', 'DE', 'NL', 'ES', 'IT'].includes(request.merchant.country)) {
    signals.push('Merchant geo')
  }
  return signals
}

export function CommerceClient(props: CommerceClientProps) {
  return (
    <CapabilityGate
      capability="standard:economics"
      fallback={
        <div className="p-6">
          <EmptyState
            icon={<CreditCard className="h-8 w-8" />}
            title="Commerce unavailable"
            description="This workspace cannot access Commerce operations."
          />
        </div>
      }
    >
      <CommerceInner {...props} />
    </CapabilityGate>
  )
}

function CommerceInner({ orgId, workspaceSlug, currentUserId }: CommerceClientProps) {
  const [filter, setFilter] = useState<'all' | AgentSpendRequestStatus>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedCommerceEvent, setSelectedCommerceEvent] = useState<AgentCommerceEvent | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    { table: 'agent_spend_requests', events: ['INSERT', 'UPDATE'] },
    { table: 'agent_commerce_budget_reservations', events: ['INSERT', 'UPDATE'] },
    { table: 'agent_commerce_events', events: ['INSERT'] },
    { table: 'agent_commerce_connections', events: ['INSERT', 'UPDATE'] },
    { table: 'agent_commerce_provider_health', events: ['INSERT', 'UPDATE'] },
  ], [])

  const queryFn = useMemo(() => {
    return async (): Promise<CommerceData> => {
      const params = new URLSearchParams({
        org_id: orgId,
        limit: '100',
      })
      if (filter !== 'all') params.set('status', filter)
      const res = await fetch(`/api/mission-control/commerce?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Commerce fetch failed (${res.status})`)
      return await res.json() as CommerceData
    }
  }, [orgId, filter])

  const { data, isLoading, refetch } = useRealtimeQuery<CommerceData>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-commerce-${orgId}`,
      subscriptions,
      orgId,
    },
    initialData: EMPTY_DATA,
    pollInterval: 15_000,
  })

  const selected = useMemo(() => {
    if (selectedId) {
      const found = data.spend_requests.find((request) => request.id === selectedId)
      if (found) return found
    }
    return data.spend_requests[0] ?? null
  }, [data.spend_requests, selectedId])

  const providerPromotionBlocks = useMemo(
    () => data.provider_promotion_block_events
      .filter((event) => event.event_type === PROVIDER_PROMOTION_BLOCKED_EVENT_TYPE),
    [data.provider_promotion_block_events],
  )

  const knowledgeEvidenceByCommerceEventId = useMemo(() => {
    const byId = new Map<string, CommerceKnowledgeEvidenceEvent[]>()
    for (const evidence of data.commerce_knowledge_evidence) {
      const next = byId.get(evidence.commerce_event_id) ?? []
      next.push(evidence)
      byId.set(evidence.commerce_event_id, next)
    }
    return byId
  }, [data.commerce_knowledge_evidence])

  const mutateSpendRequest = useCallback(async (id: string, action: 'approve' | 'cancel') => {
    setBusy(`${action}:${id}`)
    setError(null)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/agent-commerce/spend-requests/${id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({ orgId }),
      })
      if (!res.ok) throw new Error(`Unable to ${action} spend request (${res.status})`)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(null)
    }
  }, [orgId, refetch])

  const reconcile = useCallback(async () => {
    setBusy('reconcile')
    setError(null)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch('/api/mission-control/commerce/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({ orgId }),
      })
      if (!res.ok) throw new Error(`Reconcile failed (${res.status})`)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconcile failed')
    } finally {
      setBusy(null)
    }
  }, [orgId, refetch])

  const setProviderHealth = useCallback(async (
    provider: string,
    mode: ProviderHealthRecord['mode'],
    status: ProviderHealthRecord['status'],
  ) => {
    setBusy(`provider:${provider}`)
    setError(null)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/mission-control/commerce/providers/${provider}/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          orgId,
          mode,
          status,
          reason: status === 'disabled' ? 'operator_emergency_disable' : 'operator_mark_healthy',
        }),
      })
      if (!res.ok) throw new Error(`Provider health update failed (${res.status})`)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider update failed')
    } finally {
      setBusy(null)
    }
  }, [orgId, refetch])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Commerce</h2>
          <p className="text-xs text-muted-foreground">
            Spend approvals, provider health, and machine-payment ledger state.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={busy !== null}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => void reconcile()} disabled={busy !== null}>
            {busy === 'reconcile' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Reconcile
          </Button>
        </div>
      </div>

      {error ? <div className="border-b px-4 py-2 text-xs text-red-600">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 border-b p-4 md:grid-cols-6">
        <Metric icon={CreditCard} label="Spend" value={moneyRollupLabel(data.production_summary.spend.completed_volume)} />
        <Metric icon={DollarSign} label="Revenue" value={moneyRollupLabel(data.production_summary.revenue.completed_volume)} />
        <Metric icon={AlertTriangle} label="Failures" value={data.production_summary.failures.total} />
        <Metric icon={RefreshCw} label="Replays" value={data.production_summary.replay.replayed_proofs} />
        <Metric icon={PlugZap} label="Providers" value={providerHealthLabel(data.production_summary.providers)} />
        <Metric icon={Clock} label="Approvals" value={data.summary.open_approval} />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[420px] shrink-0 overflow-y-auto border-r">
          <div className="sticky top-0 z-10 flex gap-1 border-b bg-background p-3">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs transition-colors',
                  filter === item.id
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-20 rounded-md bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : data.spend_requests.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-8 w-8" />}
              title="No spend requests"
              description="Commerce ledger entries will appear here."
            />
          ) : (
            <ul className="divide-y">
              {data.spend_requests.map((request) => (
                <li key={request.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(request.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-accent/40',
                      selected?.id === request.id && 'bg-accent/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{request.merchant.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{request.context}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">{moneyLabel(request)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={cn('capitalize', STATUS_TONE[request.status])}>
                        {request.status.replaceAll('_', ' ')}
                      </Badge>
                      {riskSignals(request).slice(0, 2).map((signal) => (
                        <RiskBadge key={signal} label={signal} />
                      ))}
                      <span className="truncate text-[11px] text-muted-foreground">
                        {request.provider.replaceAll('_', ' ')}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {ageLabel(request.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <SpendRequestDetail
              request={selected}
              workspaceSlug={workspaceSlug}
              currentUserId={currentUserId}
              busy={busy}
              onApprove={() => void mutateSpendRequest(selected.id, 'approve')}
              onCancel={() => void mutateSpendRequest(selected.id, 'cancel')}
              events={data.events.filter((event) => event.entity_id === selected.id)}
              knowledgeEvidenceByCommerceEventId={knowledgeEvidenceByCommerceEventId}
              onOpenEvent={setSelectedCommerceEvent}
            />
          ) : (
            <EmptyState
              icon={<CreditCard className="h-8 w-8" />}
              title="Select a request"
              description="Choose a spend request to inspect the policy decision and activity."
            />
          )}

          <div className="grid gap-4 border-t p-4 lg:grid-cols-3">
            <ProviderHealthPanel
              manifests={data.provider_manifests}
              health={data.provider_health}
              connections={data.connections}
              promotions={data.provider_promotion}
              busy={busy}
              onSetHealth={setProviderHealth}
            />
            <MismatchesPanel
              workspaceSlug={workspaceSlug}
              mismatches={data.provider_event_mismatches}
              total={data.production_provider_mismatch_count}
            />
            <PromotionBlocksPanel events={providerPromotionBlocks} />
          </div>
        </main>
      </div>
      <CommerceEventDetailDrawer
        key={selectedCommerceEvent
          ? selectedCommerceEvent.id ?? `${selectedCommerceEvent.entity_type}:${selectedCommerceEvent.entity_id}:${selectedCommerceEvent.event_type}:${selectedCommerceEvent.created_at ?? 'pending'}`
          : 'commerce-event-drawer'}
        orgId={orgId}
        workspaceSlug={workspaceSlug}
        event={selectedCommerceEvent}
        evidence={selectedCommerceEvent?.id ? knowledgeEvidenceByCommerceEventId.get(selectedCommerceEvent.id) ?? [] : []}
        open={selectedCommerceEvent !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCommerceEvent(null)
        }}
      />
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function SpendRequestDetail({
  request,
  workspaceSlug,
  currentUserId,
  busy,
  onApprove,
  onCancel,
  events,
  knowledgeEvidenceByCommerceEventId,
  onOpenEvent,
}: {
  request: AgentSpendRequest
  workspaceSlug: string
  currentUserId: string
  busy: string | null
  onApprove: () => void
  onCancel: () => void
  events: AgentCommerceEvent[]
  knowledgeEvidenceByCommerceEventId: Map<string, CommerceKnowledgeEvidenceEvent[]>
  onOpenEvent: (event: AgentCommerceEvent) => void
}) {
  const canApprove = request.status === 'requires_approval'
  const canCancel = !['completed', 'declined', 'expired', 'failed', 'cancelled'].includes(request.status)

  return (
    <section className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn('capitalize', STATUS_TONE[request.status])}>
              {request.status.replaceAll('_', ' ')}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {request.rail.replaceAll('_', ' ')}
            </Badge>
            {riskSignals(request).map((signal) => (
              <RiskBadge key={signal} label={signal} />
            ))}
          </div>
          <h1 className="mt-2 truncate text-xl font-semibold">{request.merchant.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{request.context}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{moneyLabel(request)}</p>
          <p className="text-xs text-muted-foreground">{request.amount.currency.toUpperCase()}</p>
        </div>
      </div>

      <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
        <Info label="Provider" value={request.provider.replaceAll('_', ' ')} />
        <Info label="Requested" value={new Date(request.created_at).toLocaleString()} />
        <Info label="Approved by" value={request.approved_by === currentUserId ? 'You' : request.approved_by?.slice(0, 8) ?? 'Pending'} />
        <Info label="Merchant domain" value={request.merchant.domain ?? request.merchant.url ?? 'Not set'} />
        <Info label="Run" value={request.run_id ?? 'Not attached'} />
        <Info label="Workspace" value={workspaceSlug} />
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {canApprove ? (
          <Button size="sm" onClick={onApprove} disabled={busy !== null}>
            {busy === `approve:${request.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Approve
          </Button>
        ) : null}
        {canCancel ? (
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy !== null}>
            {busy === `cancel:${request.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Cancel
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 border-t pt-4 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold">Router Decision</h3>
          <div className="mt-2 rounded-md border bg-muted/20 p-3 text-xs">
            <p>
              <span className="font-medium text-foreground">Decision:</span>{' '}
              {request.router_decision?.decision?.replaceAll('_', ' ') ?? 'n/a'}
            </p>
            <p className="mt-1">
              <span className="font-medium text-foreground">Reasons:</span>{' '}
              {request.router_decision?.reason_codes?.join(', ') || 'none'}
            </p>
          </div>
        </section>
        <section>
          <h3 className="text-sm font-semibold">Activity</h3>
          <ol className="mt-2 space-y-2">
            {events.length === 0 ? (
              <li className="text-xs text-muted-foreground">No activity for this request.</li>
            ) : events.map((event) => {
              const evidenceRowsForEvent = event.id ? knowledgeEvidenceByCommerceEventId.get(event.id) ?? [] : []
              const latestEvidence = evidenceRowsForEvent[0] ?? null
              return (
              <li key={event.id} className="rounded-md border bg-background p-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{event.event_type.replaceAll('_', ' ')}</div>
                    <div className="text-muted-foreground">{new Date(event.created_at ?? '').toLocaleString()}</div>
                  </div>
                  <Badge className={cn(
                    'border-transparent',
                    latestEvidence
                      ? 'bg-cyan-500/15 text-cyan-600'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    {latestEvidence ? 'Knowledge evidence' : 'Evidence pending'}
                  </Badge>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => onOpenEvent(event)}
                  >
                    <Eye className="h-3 w-3" />
                    Detail
                  </Button>
                </div>
                {latestEvidence ? (
                  <div className="mt-2 rounded border bg-cyan-500/5 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{latestEvidence.operation_id}</span>
                    {latestEvidence.output_summary ? ` · ${latestEvidence.output_summary}` : null}
                  </div>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    ...evidenceRows(event),
                    ...(latestEvidence
                      ? [
                          { label: 'Knowledge row', value: latestEvidence.id },
                          { label: 'Evidence status', value: latestEvidence.success ? 'recorded' : 'failed' },
                        ]
                      : []),
                  ].map((row) => (
                    <div key={row.label} className="min-w-0 rounded border bg-muted/20 px-2 py-1.5">
                      <p className="text-[10px] uppercase text-muted-foreground">{row.label}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-foreground">{row.value}</p>
                    </div>
                  ))}
                </div>
              </li>
              )
            })}
          </ol>
        </section>
      </div>
    </section>
  )
}

function CommerceEventDetailDrawer({
  orgId,
  workspaceSlug,
  event,
  evidence,
  open,
  onOpenChange,
}: {
  orgId: string
  workspaceSlug: string
  event: AgentCommerceEvent | null
  evidence: CommerceKnowledgeEvidenceEvent[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const metadata = eventEvidenceMetadata(evidence)
  const projectId = event ? selectedProjectId(event, evidence) : null
  const initialTeamId = event ? selectedTeamId(event, evidence) ?? '' : ''
  const latestEvidence = evidence[0] ?? null
  const entitySnapshot = metadataRecord(metadata, 'entity_snapshot')
  const [attachScope, setAttachScope] = useState<CommerceAttachScope>(projectId ? 'project' : 'workspace')
  const [attachType, setAttachType] = useState<CommerceAttachRecordType>('signal')
  const [teamId, setTeamId] = useState(initialTeamId)
  const [recordBody, setRecordBody] = useState(event ? commerceContextBody(event, evidence) : '')
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachMessage, setAttachMessage] = useState<string | null>(null)
  const [attachedRecord, setAttachedRecord] = useState<CommerceContextRecordLink | null>(null)
  const [linkedRecords, setLinkedRecords] = useState<CommerceContextRecordLink[]>([])
  const [teamTargets, setTeamTargets] = useState<TeamTarget[]>([])
  const [projectSlug, setProjectSlug] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !event) return
    let cancelled = false

    const loadDrawerContext = async () => {
      const requests: Array<Promise<void>> = []

      if (projectId) {
        requests.push(fetch(`/api/crews?org_id=${encodeURIComponent(orgId)}&project_id=${encodeURIComponent(projectId)}`, {
          cache: 'no-store',
        })
          .then(async (res) => {
            if (!res.ok) return
            const payload = await res.json() as { crews?: Array<{ id?: string; name?: string }> }
            if (!cancelled) {
              setTeamTargets((payload.crews ?? []).flatMap((team) => (
                team.id && team.name ? [{ id: team.id, name: team.name }] : []
              )))
            }
          })
          .catch(() => undefined))

        requests.push(fetch(`/api/workspace?org_id=${encodeURIComponent(orgId)}&project_id=${encodeURIComponent(projectId)}`, {
          cache: 'no-store',
        })
          .then(async (res) => {
            if (!res.ok) return
            const payload = await res.json() as { project?: { slug?: string } }
            if (!cancelled) setProjectSlug(payload.project?.slug ?? null)
          })
          .catch(() => undefined))
      }

      if (event.id) {
        requests.push(fetch(`/api/workspaces/${encodeURIComponent(orgId)}/context?limit=200`, {
          cache: 'no-store',
        })
          .then(async (res) => {
            if (!res.ok) return
            const payload = await res.json() as { records?: CommerceContextRecordLink[] }
            if (!cancelled) {
              setLinkedRecords((payload.records ?? []).filter((record) => (
                record.source_type === 'commerce_event' && record.source_id === event.id
              )))
            }
          })
          .catch(() => undefined))
      }

      await Promise.all(requests)
    }

    setAttachedRecord(null)
    setAttachMessage(null)
    setProjectSlug(null)
    setTeamTargets([])
    setLinkedRecords([])
    void loadDrawerContext()

    return () => {
      cancelled = true
    }
  }, [event, open, orgId, projectId])

  const missingTarget = attachScope === 'project'
    ? !projectId
    : attachScope === 'team'
      ? !projectId || !teamId.trim()
      : false

  const attachToContext = useCallback(async () => {
    if (!event || missingTarget) return
    setAttachBusy(true)
    setAttachMessage(null)
    try {
      const csrf = getCSRFTokenFromCookie()
      const body = recordBody.trim() || commerceContextBody(event, evidence)
      const scopeId = attachScope === 'workspace'
        ? orgId
        : attachScope === 'project'
          ? projectId!
          : teamId.trim()
      const payload = {
        project_id: attachScope === 'workspace' ? null : projectId,
        scope_type: attachScope,
        scope_id: scopeId,
        record_type: attachType,
        title: `Commerce: ${commerceEventTitle(event)}`.slice(0, 200),
        body,
        source_type: 'commerce_event',
        source_id: event.id ?? `${event.entity_type}:${event.entity_id}`,
        confidence: latestEvidence?.success ? 0.9 : 0.65,
        status: 'active',
        metadata: compactCommerceMetadata(event, evidence),
        links: event.id ? [{
          target_type: 'commerce_event',
          target_id: event.id,
          label: event.event_type,
          provenance: 'Attached from Mission Control Commerce event detail',
          observed_at: event.created_at ?? latestEvidence?.created_at ?? null,
          confidence: latestEvidence?.success ? 0.9 : 0.65,
          metadata: compactCommerceMetadata(event, evidence),
        }] : [],
      }
      const endpoint = attachScope === 'workspace'
        ? `/api/workspaces/${encodeURIComponent(orgId)}/context`
        : attachScope === 'project'
          ? `/api/workspaces/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId!)}/context`
          : `/api/crews/${encodeURIComponent(teamId.trim())}/context?org_id=${encodeURIComponent(orgId)}&project_id=${encodeURIComponent(projectId!)}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Attach failed (${res.status})`)
      const responsePayload = await res.json() as { record?: CommerceContextRecordLink }
      const record = responsePayload.record ?? null
      setAttachedRecord(record)
      if (record) {
        setLinkedRecords((current) => [record, ...current.filter((item) => item.id !== record.id)])
      }
      setAttachMessage('Attached to context.')
    } catch (error) {
      setAttachMessage(error instanceof Error ? error.message : 'Attach failed')
    } finally {
      setAttachBusy(false)
    }
  }, [attachScope, attachType, event, evidence, latestEvidence, missingTarget, orgId, projectId, recordBody, teamId])

  const attachedHref = attachedRecord
    ? contextRecordHref({ workspaceSlug, projectSlug, record: attachedRecord })
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {event ? (
          <>
            <SheetHeader className="border-b px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <Badge variant="outline" className="capitalize">{event.entity_type.replaceAll('_', ' ')}</Badge>
                <Badge className={cn(
                  'border-transparent',
                  latestEvidence ? 'bg-cyan-500/15 text-cyan-600' : 'bg-muted text-muted-foreground',
                )}>
                  {latestEvidence ? 'Knowledge evidence' : 'Evidence pending'}
                </Badge>
              </div>
              <SheetTitle>{commerceEventTitle(event)}</SheetTitle>
              <SheetDescription>
                {event.id ?? `${event.entity_type}:${event.entity_id}`} · {event.created_at ? new Date(event.created_at).toLocaleString() : 'pending'}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-5 pb-6">
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Provenance
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {provenanceRows(event, evidence).map((row) => (
                    <div key={row.label} className="min-w-0 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                      <p className="uppercase text-muted-foreground">{row.label}</p>
                      <p className="mt-1 truncate font-mono text-[11px] text-foreground">{row.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold">Knowledge Rows</h3>
                {evidence.length === 0 ? (
                  <p className="mt-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                    No Knowledge evidence row has been mirrored for this Commerce event yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {evidence.map((row) => (
                      <li key={row.id} className="rounded-md border p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[11px]">{row.id}</span>
                          <Badge className={cn(
                            'border-transparent',
                            row.success ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600',
                          )}>
                            {row.success ? 'recorded' : 'failed'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{row.operation_id} · {row.surface}</p>
                        {row.output_summary ? <p className="mt-2 text-foreground">{row.output_summary}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid gap-3 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Event Payload</h3>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {compactPayloadSummary(event.payload)}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Entity Snapshot</h3>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {entitySnapshot ? summarizeUnknown(entitySnapshot, 2400) : 'No entity snapshot recorded.'}
                  </pre>
                </div>
              </section>

              <section className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Save className="h-4 w-4 text-muted-foreground" />
                  Attach to Context
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Scope</span>
                    <Select value={attachScope} onValueChange={(value) => setAttachScope(value as CommerceAttachScope)}>
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="workspace">Workspace</SelectItem>
                        <SelectItem value="project" disabled={!projectId}>Project</SelectItem>
                        <SelectItem value="team" disabled={!projectId}>Team</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Record</span>
                    <Select value={attachType} onValueChange={(value) => setAttachType(value as CommerceAttachRecordType)}>
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTEXT_ATTACH_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type.replaceAll('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Team</span>
                    {teamTargets.length > 0 ? (
                      <Select value={teamId} onValueChange={setTeamId} disabled={attachScope !== 'team'}>
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue placeholder="Team" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamTargets.map((team) => (
                            <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={teamId}
                        onChange={(change) => setTeamId(change.target.value)}
                        disabled={attachScope !== 'team'}
                        placeholder="Team id"
                        className="h-8 text-xs"
                      />
                    )}
                  </label>
                </div>
                <label className="mt-3 block space-y-1 text-xs">
                  <span className="font-medium">Body</span>
                  <Textarea
                    value={recordBody}
                    onChange={(change) => setRecordBody(change.target.value)}
                    rows={5}
                    className="text-xs"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className={cn(
                    'text-xs',
                    missingTarget ? 'text-amber-600' : 'text-muted-foreground',
                  )}>
                    {missingTarget ? 'Project or team target missing.' : latestEvidence ? 'Knowledge-backed provenance will be linked.' : 'Commerce event will be linked without a Knowledge row.'}
                  </p>
                  <Button size="sm" onClick={() => void attachToContext()} disabled={attachBusy || missingTarget}>
                    {attachBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Attach
                  </Button>
                </div>
                {attachMessage ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{attachMessage}</span>
                    {attachedHref ? (
                      <Link href={attachedHref} className="font-medium text-primary hover:underline">
                        Open context
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section>
                <h3 className="text-sm font-semibold">Linked Context</h3>
                {linkedRecords.length === 0 ? (
                  <p className="mt-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                    No context records are linked to this Commerce event yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {linkedRecords.slice(0, 6).map((record) => (
                      <li key={record.id} className="rounded-md border p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{record.title}</span>
                          <Badge variant="outline" className="capitalize">
                            {record.record_type.replaceAll('_', ' ')}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                          <span>{record.scope_type}</span>
                          <span className="font-mono text-[11px]">{record.id}</span>
                          <Link
                            href={contextRecordHref({ workspaceSlug, projectSlug, record })}
                            className="ml-auto font-medium text-primary hover:underline"
                          >
                            Open
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function RiskBadge({ label }: { label: string }) {
  return (
    <Badge className="border-transparent bg-red-500/15 text-red-600">
      {label}
    </Badge>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1 truncate">{value}</p>
    </div>
  )
}

function ProviderHealthPanel({
  manifests,
  health,
  connections,
  promotions,
  busy,
  onSetHealth,
}: {
  manifests: AgentCommerceProviderManifest[]
  health: ProviderHealthRecord[]
  connections: AgentCommerceConnection[]
  promotions: AgentCommerceProviderPromotionResult[]
  busy: string | null
  onSetHealth: (
    provider: string,
    mode: ProviderHealthRecord['mode'],
    status: ProviderHealthRecord['status'],
  ) => void
}) {
  const healthByProvider = new Map(health.map((item) => [item.provider, item]))
  const promotionByProvider = new Map(promotions.map((item) => [item.provider, item]))
  const connectionCounts = connections.reduce<Record<string, number>>((acc, connection) => {
    if (connection.status === 'active') acc[connection.provider] = (acc[connection.provider] ?? 0) + 1
    return acc
  }, {})

  return (
    <section>
      <h3 className="text-sm font-semibold">Provider Health</h3>
      <ul className="mt-2 space-y-2">
        {manifests.map((manifest) => {
          const providerHealth = healthByProvider.get(manifest.id)
          const promotion = promotionByProvider.get(manifest.id)
          const status = providerHealth?.status ?? (manifest.availability.mode === 'live' ? 'healthy' : 'disabled')
          const mode = providerHealth?.mode ?? manifest.availability.mode
          const promotionReady = promotion?.ready ?? false
          const promotionLabel = promotionReady
            ? 'promotion ready'
            : promotion?.live
              ? 'promotion blocked'
              : 'not live'
          return (
            <li key={manifest.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{manifest.label}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge className={cn('capitalize', HEALTH_TONE[status])}>{status}</Badge>
                  <Badge
                    className={cn(
                      'border-transparent',
                      promotionReady
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : promotion?.live
                          ? 'bg-amber-500/15 text-amber-600'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {promotionLabel}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>{manifest.availability.mode}</span>
                <span>{manifest.rails.join(', ')}</span>
                <span>{connectionCounts[manifest.id] ?? 0} active</span>
                <span>{providerHealth?.failure_count ?? 0} global failures</span>
              </div>
              {promotion && !promotion.ready ? (
                <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                  {promotion.blockers.slice(0, 3).join(', ') || promotion.missingEvidence.slice(0, 3).join(', ') || 'Promotion evidence pending'}
                </div>
              ) : null}
              <div className="mt-3 flex justify-end">
                {status === 'disabled' && mode === 'live' ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => onSetHealth(manifest.id, mode, 'healthy')}
                  >
                    {busy === `provider:${manifest.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Healthy
                  </Button>
                ) : status !== 'disabled' ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => onSetHealth(manifest.id, 'disabled', 'disabled')}
                  >
                    {busy === `provider:${manifest.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Disable
                  </Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function MismatchesPanel({
  workspaceSlug,
  mismatches,
  total,
}: {
  workspaceSlug: string
  mismatches: ProviderEventMismatch[]
  total: number
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Webhook Mismatches</h3>
        <Badge className={total > 0 ? 'border-transparent bg-amber-500/15 text-amber-600' : 'border-transparent bg-emerald-500/15 text-emerald-600'}>
          {total}
        </Badge>
      </div>
      {total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No mismatches detected.</p>
      ) : mismatches.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No recent mismatch rows.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {mismatches.slice(0, 6).map((item) => (
            <li key={item.event_id} className="rounded-md border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.reason.replaceAll('_', ' ')}</span>
                <span className="text-muted-foreground">{ageLabel(item.created_at)}</span>
              </div>
              <p className="mt-1 truncate text-muted-foreground">
                {item.provider ?? 'provider'} · {item.event_type}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/${workspaceSlug}/mission-control/system`}
        className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
      >
        System health
      </Link>
    </section>
  )
}

function PromotionBlocksPanel({ events }: { events: AgentCommerceEvent[] }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Promotion Blocks</h3>
        <Badge className={events.length > 0 ? 'border-transparent bg-amber-500/15 text-amber-600' : 'border-transparent bg-emerald-500/15 text-emerald-600'}>
          {events.length}
        </Badge>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No blocked live promotions.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {events.slice(0, 6).map((event) => {
            const blockers = payloadStringList(event.payload, 'blockers')
            const missingEvidence = payloadStringList(event.payload, 'missing_evidence')
            const reasons = [...blockers, ...missingEvidence].slice(0, 3)
            return (
              <li key={event.id ?? `${event.entity_id}:${event.created_at ?? event.event_type}`} className="rounded-md border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{event.provider?.replaceAll('_', ' ') ?? 'provider'}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {event.created_at ? ageLabel(event.created_at) : 'now'}
                  </span>
                </div>
                <p className="mt-1 break-words text-muted-foreground">
                  {reasons.join(', ') || 'Promotion evidence missing'}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
