'use client'

import { useMemo, type ReactNode } from 'react'
import { useRealtimeQuery } from '@/hooks/use-realtime-query'
import { WorkerHealthPanel } from '@/components/mission-control/system/worker-health-panel'
import { ErrorLog } from '@/components/mission-control/system/error-log'
import { RemediationDashboard } from '@/components/mission-control/system/remediation-dashboard'
import { RuntimesPanel } from '@/components/mission-control/system/runtimes-panel'
import { IngestHealthPanel } from '@/components/mission-control/system/ingest-health-panel'
import { ProposedChangesOpsPanel } from '@/components/mission-control/system/native-mutation-ops-panel'
import { CapabilityGate } from '@/components/mission-control/capability-gate'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Database, Fingerprint, Radio } from 'lucide-react'
import type { RealtimeSubscription } from '@/hooks/use-supabase-realtime'
import type { NativeMutationOpsSummary } from '@/lib/db/mission-control'

interface SystemData {
  health: {
    pending_events: number
    dead_letters: number
    oldest_pending_age_seconds: number | null
    errors_last_hour: number
    recent_errors: Array<{
      id: string
      assistant_id: string
      agent_name: string
      error_message: string | null
      created_at: string
    }>
  } | null
  policies: Array<{
    id: string
    name: string
    enabled: boolean
    trigger_type: string
    action_type: string
    last_triggered_at: string | null
  }>
  remediationLog: Array<{
    id: string
    action_taken: string
    outcome: string | null
    details: Record<string, unknown>
    triggered_at: string
  }>
  proposedChanges: NativeMutationOpsSummary | null
}

interface SystemClientProps {
  orgId: string
  workspaceSlug: string
}

export function SystemClient({ orgId, workspaceSlug }: SystemClientProps) {
  const subscriptions: RealtimeSubscription[] = useMemo(() => [
    { table: 'assistant_outbound_events', events: ['INSERT'] },
    { table: 'mc_remediation_log', events: ['INSERT'] },
    { table: 'mc_native_mutation_candidates', events: ['INSERT', 'UPDATE'] },
  ], [])

  const queryFn = useMemo(() => {
    return async (): Promise<SystemData> => {
      const [healthRes, remRes, mutationRes] = await Promise.all([
        fetch(`/api/mission-control/system?org_id=${orgId}`),
        fetch(`/api/mission-control/system/remediation?org_id=${orgId}`),
        fetch(`/api/mission-control/native-mutations?org_id=${orgId}&limit=25`),
      ])
      const remData = remRes.ok ? await remRes.json() : { policies: [], log: [] }
      const mutationData = mutationRes.ok ? await mutationRes.json() : { summary: null }
      return {
        health: healthRes.ok ? await healthRes.json() : null,
        policies: remData.policies ?? [],
        remediationLog: remData.log ?? [],
        proposedChanges: mutationData.summary ?? null,
      }
    }
  }, [orgId])

  const { data } = useRealtimeQuery<SystemData>({
    queryFn,
    realtimeConfig: {
      channelName: `mc-system-${orgId}`,
      subscriptions,
      orgId,
    },
    initialData: { health: null, policies: [], remediationLog: [], proposedChanges: null },
    pollInterval: 15_000,
  })

  if (!data.health) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <WorkerHealthPanel
        pendingEvents={data.health.pending_events}
        deadLetters={data.health.dead_letters}
        oldestPendingAge={data.health.oldest_pending_age_seconds}
        errorsLastHour={data.health.errors_last_hour}
      />

      <IngestHealthPanel />

      <SystemGapDoctor
        pendingEvents={data.health.pending_events}
        deadLetters={data.health.dead_letters}
        errorsLastHour={data.health.errors_last_hour}
        remediationPolicyCount={data.policies.length}
      />

      {data.proposedChanges ? (
        <ProposedChangesOpsPanel workspaceSlug={workspaceSlug} summary={data.proposedChanges} />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-medium mb-3">Recent Errors</h3>
          <ErrorLog errors={data.health.recent_errors} />
        </section>

        <RemediationDashboard policies={data.policies} log={data.remediationLog} />
      </div>

      <CapabilityGate
        capability="runtime:dedicated"
        fallback={<DedicatedRuntimeUnavailable />}
      >
        <RuntimesPanel orgId={orgId} workspaceSlug={workspaceSlug} />
      </CapabilityGate>
    </div>
  )
}

function DedicatedRuntimeUnavailable() {
  return (
    <section className="rounded-lg border border-dashed bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-full border border-border bg-background p-2 text-muted-foreground">
          <Radio className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-medium">Dedicated runtimes unavailable</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            This workspace can still use Lucid Cloud runtime capacity. Dedicated runtime controls appear here when the
            workspace plan or deployment mode supports self-hosted runtimes.
          </p>
        </div>
      </div>
    </section>
  )
}

function SystemGapDoctor({
  pendingEvents,
  deadLetters,
  errorsLastHour,
  remediationPolicyCount,
}: {
  pendingEvents: number
  deadLetters: number
  errorsLastHour: number
  remediationPolicyCount: number
}) {
  const sourceGap = deadLetters > 0 || errorsLastHour > 0
  const embeddingGap = pendingEvents > 100
  const channelGap = remediationPolicyCount === 0 || errorsLastHour > 0

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-medium">System Gap Doctor</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Source, embedding, and channel gaps that can make Mission Control look healthy while agents lose evidence or reach.
          </p>
        </div>
        <Badge variant={sourceGap || embeddingGap || channelGap ? 'destructive' : 'secondary'}>
          {sourceGap || embeddingGap || channelGap ? 'Review gaps' : 'No gaps flagged'}
        </Badge>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <GapDoctorItem
          icon={<Database className="h-4 w-4" />}
          title="Source Gap"
          status={sourceGap ? 'review' : 'clear'}
          detail={sourceGap
            ? `${deadLetters} dead letters and ${errorsLastHour} errors may hide missing source events.`
            : 'Inbound source events are not showing queue or error pressure.'}
        />
        <GapDoctorItem
          icon={<Fingerprint className="h-4 w-4" />}
          title="Embedding Gap"
          status={embeddingGap ? 'review' : 'clear'}
          detail={embeddingGap
            ? `${pendingEvents} pending events can delay Knowledge embedding and retrieval freshness.`
            : 'Pending event pressure is low enough for normal Knowledge freshness.'}
        />
        <GapDoctorItem
          icon={<Radio className="h-4 w-4" />}
          title="Channel Gap"
          status={channelGap ? 'review' : 'clear'}
          detail={channelGap
            ? `${remediationPolicyCount} remediation policies and ${errorsLastHour} errors need channel review.`
            : 'Channel remediation and runtime error signals are within expected range.'}
        />
      </div>
    </section>
  )
}

function GapDoctorItem({
  icon,
  title,
  status,
  detail,
}: {
  icon: ReactNode
  title: string
  status: 'clear' | 'review'
  detail: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        {status === 'review' ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <Badge variant="outline">Clear</Badge>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
