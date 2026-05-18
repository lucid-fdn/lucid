'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, GitCompare, History, Play, RefreshCw, RotateCcw, Save, Settings2, Timer, Users } from 'lucide-react'
import { formatRoutineStatus, RoutineStatusBadge } from '@/components/routines/routine-status-badge'
import { RoutineScheduleEditor } from '@/components/routines/routine-schedule-editor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix-tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { RoutineDefinition, RoutineRuntimeSelector, RoutineTargetType, RoutineTriggerKind, UpdateRoutineInput } from '@/lib/routines/types'
import type { ScheduledTaskVersion } from '@/lib/mission-control/types'

interface RoutineRunReceipt {
  id: string
  task_id: string
  status: string
  target_type: string
  task_kind: string
  scheduled_for: string | null
  started_at: string | null
  completed_at: string | null
  output_summary: string | null
  error_message: string | null
  crew_run_id: string | null
  agent_ops_run_id: string | null
  browser_run_id: string | null
  engine_home_refs: Record<string, unknown>
  work_graph_refs: Record<string, unknown>
  knowledge_refs: Record<string, unknown>
  trustgate_refs: Record<string, unknown>
  dispatch_summary: Record<string, unknown>
  sanitized_evidence: Record<string, unknown>
  created_at: string
}

interface RoutineDrift {
  drifted: boolean
  checks: Array<{ name: string; status: 'ok' | 'unknown'; detail?: string }>
}

export function RoutineDetailClient({
  orgId,
  workspaceSlug,
  routineId,
}: {
  orgId: string
  workspaceSlug: string
  routineId: string
}) {
  const [routine, setRoutine] = useState<RoutineDefinition | null>(null)
  const [runs, setRuns] = useState<RoutineRunReceipt[]>([])
  const [versions, setVersions] = useState<ScheduledTaskVersion[]>([])
  const [drift, setDrift] = useState<RoutineDrift | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ org_id: orgId })
      const [routineRes, runsRes, versionsRes, driftRes] = await Promise.all([
        fetch(`/api/routines/${routineId}?${params}`),
        fetch(`/api/routines/${routineId}/runs?${params}`),
        fetch(`/api/routines/${routineId}/versions?${params}`),
        fetch(`/api/routines/${routineId}/drift?${params}`),
      ])
      const routineJson = await routineRes.json()
      if (!routineRes.ok) throw new Error(routineJson.error ?? 'Routine not found')
      setRoutine(routineJson.routine)
      setRuns(runsRes.ok ? (await runsRes.json()).runs ?? [] : [])
      setVersions(versionsRes.ok ? (await versionsRes.json()).versions ?? [] : [])
      setDrift(driftRes.ok ? (await driftRes.json()).drift ?? null : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load routine')
    } finally {
      setLoading(false)
    }
  }, [orgId, routineId])

  useEffect(() => {
    void load()
  }, [load])

  const latestRun = useMemo(() => runs[0] ?? null, [runs])
  const runHealth = useMemo(() => summarizeRunHealth(runs), [runs])

  async function runNow() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/routines/${routineId}/run-now?org_id=${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Unable to queue routine')
      setNotice('Routine queued for immediate execution.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to queue routine')
    } finally {
      setBusy(false)
    }
  }

  async function restore(version: ScheduledTaskVersion) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/routines/${routineId}/versions/${version.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Unable to restore version')
      setNotice(`Restored version ${version.version}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore version')
    } finally {
      setBusy(false)
    }
  }

  async function saveRoutine(updates: UpdateRoutineInput) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/routines/${routineId}?org_id=${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Unable to update routine')
      setRoutine(json.routine)
      setNotice('Routine updated.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update routine')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !routine) {
    return <RoutineDetailSkeleton />
  }

  if (error && !routine) {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="mx-auto max-w-5xl rounded-lg border bg-background p-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={`/${workspaceSlug}/mission-control/routines`}>
              <ArrowLeft className="h-4 w-4" />
              Back to routines
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!routine) return null

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-background px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
              <Link href={`/${workspaceSlug}/mission-control/routines`}>
                <ArrowLeft className="h-4 w-4" />
                Routines
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{routine.name}</h1>
              <RoutineStatusBadge routine={routine} />
              <Badge variant="outline" className="rounded-md capitalize">{routine.target_type.replaceAll('_', ' ')}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {routine.description || routine.task_prompt}
            </p>
          </div>
          <Button type="button" onClick={() => void runNow()} disabled={busy}>
            <Play className="h-4 w-4" />
            Run now
          </Button>
        </div>

        {notice ? <InfoBanner tone="success" text={notice} /> : null}
        {error ? <InfoBanner tone="danger" text={error} /> : null}

        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
          <DetailMetric label="Next run" value={routine.next_run_at ? formatDateTime(routine.next_run_at) : 'None'} />
          <DetailMetric label="Last run" value={routine.last_run_at ? formatDateTime(routine.last_run_at) : 'Never'} />
          <DetailMetric label="Latest receipt" value={latestRun ? latestRun.status : 'None'} />
          <DetailMetric label="Source" value={routine.source_kind.replaceAll('_', ' ')} />
          <DetailMetric label="Dispatch health" value={runHealth.label} tone={runHealth.tone} />
        </div>

        <RoutineHealthPanel health={runHealth} latestRun={latestRun} />

        <RoutineEditorPanel
          routine={routine}
          busy={busy}
          onSave={(updates) => void saveRoutine(updates)}
        />

        <Tabs defaultValue="runs" className="rounded-lg border bg-background p-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="adapter">Adapter</TabsTrigger>
            <TabsTrigger value="team">Team Dispatch</TabsTrigger>
            <TabsTrigger value="policy">Policy</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="drift">Drift</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="mt-4">
            {runs.length === 0 ? (
              <EmptyPanel title="No run receipts" detail="This routine has not produced a Routine receipt yet." />
            ) : (
              <div className="divide-y rounded-lg border">
                {runs.map((run) => (
                  <div key={run.id} className="grid gap-3 px-4 py-3 md:grid-cols-[160px_minmax(0,1fr)_180px] md:items-center">
                    <Badge variant={run.status === 'failed' || run.status === 'dead_letter' ? 'destructive' : 'outline'} className={cn('w-fit rounded-md', run.status === 'skipped' && 'border-zinc-500/30 bg-zinc-500/10')}>
                      {formatRoutineStatus(run.status)}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{run.output_summary || sanitizeRoutineErrorForOperator(run.error_message) || run.task_kind}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRunReference(run)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground md:text-right">
                      {formatDateTime(run.completed_at || run.started_at || run.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="evidence" className="mt-4">
            {runs.length === 0 ? (
              <EmptyPanel title="No evidence refs" detail="Routine evidence refs appear after a run writes to Work Graph, Browser Operator, Knowledge, EHV, Agent Ops, or TrustGate." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {runs.slice(0, 10).map((run) => (
                  <div key={run.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{run.target_type.replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(run.completed_at || run.started_at || run.created_at)}</p>
                      </div>
                      <Badge variant="outline" className="rounded-md">{run.status}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <RefPill label="Agent Ops" value={run.agent_ops_run_id} />
                      <RefPill label="Browser" value={run.browser_run_id} />
                      <CompactJson title="Work Graph" value={run.work_graph_refs} />
                      <CompactJson title="Knowledge" value={run.knowledge_refs} />
                      <CompactJson title="Engine Home" value={run.engine_home_refs} />
                      <CompactJson title="TrustGate" value={run.trustgate_refs} />
                      <CompactJson title="Sanitized Evidence" value={run.sanitized_evidence} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="adapter" className="mt-4">
            {latestRun ? (
              <div className="grid gap-3 md:grid-cols-2">
                <JsonPanel title="Latest dispatch summary" value={latestRun.dispatch_summary} />
                <JsonPanel title="Latest sanitized evidence" value={latestRun.sanitized_evidence} />
                <JsonPanel title="Trigger config" value={routine.trigger_config} />
                <JsonPanel title="Context policy" value={routine.context_policy} />
              </div>
            ) : (
              <EmptyPanel title="No adapter status" detail="Adapter dispatch, blockers, and sanitized evidence appear after the first run." />
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <TeamDispatchPanel routine={routine} runs={runs} />
          </TabsContent>

          <TabsContent value="policy" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <JsonPanel title="Runtime selector" value={routine.runtime_selector} />
              <JsonPanel title="Capabilities" value={routine.capability_requirements} />
              <JsonPanel title="Team policy" value={routine.team_policy} />
              <JsonPanel title="TrustGate policy" value={routine.trustgate_policy} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {versions.length === 0 ? (
              <EmptyPanel title="No revisions" detail="Version history will appear after create, update, cancel, restore, or run-now changes." />
            ) : (
              <div className="divide-y rounded-lg border">
                {versions.map((version) => (
                  <div key={version.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Version {version.version}</p>
                        <Badge variant="outline" className="rounded-md">{version.change_type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {version.summary || 'No summary'} · {formatDateTime(version.created_at)}
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void restore(version)}>
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="drift" className="mt-4">
            {!drift ? (
              <EmptyPanel title="No drift data" detail="Drift checks are unavailable for this routine." />
            ) : (
              <div className="space-y-3">
                <div className={cn(
                  'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
                  drift.drifted ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5',
                )}>
                  <GitCompare className="h-4 w-4" />
                  {drift.drifted ? 'Drift detected' : 'No drift detected'}
                </div>
                <div className="divide-y rounded-lg border">
                  {drift.checks.map((check) => (
                    <div key={check.name} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium capitalize">{check.name.replaceAll('_', ' ')}</p>
                        {check.detail ? <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p> : null}
                      </div>
                      <Badge variant="outline" className="rounded-md">{check.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

const TARGET_OPTIONS: Array<{ value: RoutineTargetType; label: string }> = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'team', label: 'Team' },
  { value: 'work_graph', label: 'Work Graph' },
  { value: 'agent_ops', label: 'Agent Ops' },
  { value: 'browser_procedure', label: 'Browser Procedure' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'engine_home', label: 'Engine Home' },
  { value: 'plugin_job', label: 'Plugin Job' },
  { value: 'pm_sync', label: 'PM Sync' },
]

function RoutineEditorPanel({
  routine,
  busy,
  onSave,
}: {
  routine: RoutineDefinition
  busy: boolean
  onSave: (updates: UpdateRoutineInput) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(routine.name)
  const [description, setDescription] = useState(routine.description ?? '')
  const [instruction, setInstruction] = useState(routine.task_prompt)
  const [targetType, setTargetType] = useState<RoutineTargetType>(routine.target_type)
  const [targetId, setTargetId] = useState(routine.target_id ?? '')
  const [assistantId, setAssistantId] = useState(routine.assistant_id ?? '')
  const [teamId, setTeamId] = useState(routine.team_id ?? '')
  const [projectId, setProjectId] = useState(routine.project_id ?? '')
  const [workItemId, setWorkItemId] = useState(routine.work_item_id ?? '')
  const [triggerKind, setTriggerKind] = useState<RoutineTriggerKind>(routine.trigger_kind)
  const [cronExpression, setCronExpression] = useState(routine.cron_expression ?? '0 9 * * 1-5')
  const [runAt, setRunAt] = useState(toDateTimeLocal(routine.run_at))
  const [timezone, setTimezone] = useState(routine.timezone ?? 'UTC')
  const [concurrencyPolicy, setConcurrencyPolicy] = useState(routine.concurrency_policy)
  const [catchUpPolicy, setCatchUpPolicy] = useState(routine.catch_up_policy)
  const [catchUpLimit, setCatchUpLimit] = useState(String(routine.catch_up_limit ?? 1))
  const [maxRetries, setMaxRetries] = useState(String(routine.max_retries ?? 3))
  const [nativeScheduler, setNativeScheduler] = useState<RoutineRuntimeSelector['nativeScheduler']>(routine.runtime_selector?.nativeScheduler ?? 'disabled')
  const [engine, setEngine] = useState(routine.runtime_selector?.engine ?? 'any')
  const [runtimeFlavor, setRuntimeFlavor] = useState(routine.runtime_selector?.runtimeFlavor ?? 'any')
  const [runtimeId, setRuntimeId] = useState(routine.runtime_selector?.runtimeId ?? '')
  const [triggerConfigJson, setTriggerConfigJson] = useState(jsonText(routine.trigger_config))
  const [runtimeJson, setRuntimeJson] = useState(jsonText(stripRuntimeSelectorControls(routine.runtime_selector)))
  const [policyError, setPolicyError] = useState<string | null>(null)

  useEffect(() => {
    setName(routine.name)
    setDescription(routine.description ?? '')
    setInstruction(routine.task_prompt)
    setTargetType(routine.target_type)
    setTargetId(routine.target_id ?? '')
    setAssistantId(routine.assistant_id ?? '')
    setTeamId(routine.team_id ?? '')
    setProjectId(routine.project_id ?? '')
    setWorkItemId(routine.work_item_id ?? '')
    setTriggerKind(routine.trigger_kind)
    setCronExpression(routine.cron_expression ?? '0 9 * * 1-5')
    setRunAt(toDateTimeLocal(routine.run_at))
    setTimezone(routine.timezone ?? 'UTC')
    setConcurrencyPolicy(routine.concurrency_policy)
    setCatchUpPolicy(routine.catch_up_policy)
    setCatchUpLimit(String(routine.catch_up_limit ?? 1))
    setMaxRetries(String(routine.max_retries ?? 3))
    setNativeScheduler(routine.runtime_selector?.nativeScheduler ?? 'disabled')
    setEngine(routine.runtime_selector?.engine ?? 'any')
    setRuntimeFlavor(routine.runtime_selector?.runtimeFlavor ?? 'any')
    setRuntimeId(routine.runtime_selector?.runtimeId ?? '')
    setTriggerConfigJson(jsonText(routine.trigger_config))
    setRuntimeJson(jsonText(stripRuntimeSelectorControls(routine.runtime_selector)))
    setPolicyError(null)
  }, [routine])

  function save() {
    setPolicyError(null)
    const triggerConfig = parseJsonObject(triggerConfigJson, 'Trigger config')
    if (triggerConfig.error) return setPolicyError(triggerConfig.error)
    const runtimeExtra = parseJsonObject(runtimeJson, 'Runtime selector metadata')
    if (runtimeExtra.error) return setPolicyError(runtimeExtra.error)
    const triggerConfigValue: Record<string, unknown> = triggerConfig.value ?? {}
    const runtimeExtraValue: Record<string, unknown> = runtimeExtra.value ?? {}

    const runtimeSelector: RoutineRuntimeSelector = {
      ...runtimeExtraValue,
      nativeScheduler,
      engine: engine === 'any' ? null : engine as 'openclaw' | 'hermes',
      runtimeFlavor: runtimeFlavor === 'any' ? null : runtimeFlavor as 'shared' | 'dedicated' | 'byo',
      runtimeId: runtimeId.trim() || null,
    }

    onSave({
      name: name.trim(),
      description: description.trim() || null,
      task_prompt: instruction.trim(),
      target_type: targetType,
      target_id: targetId.trim() || null,
      assistant_id: assistantId.trim() || null,
      team_id: teamId.trim() || null,
      project_id: projectId.trim() || null,
      work_item_id: workItemId.trim() || null,
      trigger_kind: triggerKind,
      trigger_config: triggerConfigValue,
      cron_expression: triggerKind === 'cron' ? cronExpression.trim() : null,
      run_at: triggerKind === 'one_shot' && runAt ? new Date(runAt).toISOString() : null,
      timezone: timezone.trim() || 'UTC',
      concurrency_policy: concurrencyPolicy,
      catch_up_policy: catchUpPolicy,
      catch_up_limit: Math.max(0, Math.min(100, Number(catchUpLimit) || 0)),
      max_retries: Math.max(0, Math.min(20, Number(maxRetries) || 0)),
      runtime_selector: runtimeSelector,
    })
  }

  return (
    <section className="rounded-lg border bg-background">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">Routine definition</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Edit target, trigger, policy, runtime, and retry behavior from one canonical surface.</p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-md">{open ? 'Open' : 'Edit'}</Badge>
      </button>

      {open ? (
        <div className="grid gap-4 border-t p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Field label="Target">
              <Select value={targetType} onValueChange={(value) => setTargetType(value as RoutineTargetType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Target ID">
              <Input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="UUID or domain id" />
            </Field>
            <Field label="Execution assistant">
              <Input value={assistantId} onChange={(event) => setAssistantId(event.target.value)} placeholder="Assistant UUID" />
            </Field>
            <Field label="Team ID">
              <Input value={teamId} onChange={(event) => setTeamId(event.target.value)} placeholder="Team UUID" />
            </Field>
            <Field label="Project ID">
              <Input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="Project UUID" />
            </Field>
            <Field label="Work item ID">
              <Input value={workItemId} onChange={(event) => setWorkItemId(event.target.value)} placeholder="Work item UUID" />
            </Field>
            <RoutineScheduleEditor
              className="md:col-span-2"
              triggerKind={triggerKind}
              onTriggerKindChange={setTriggerKind}
              cronExpression={cronExpression}
              onCronExpressionChange={setCronExpression}
              runAt={runAt}
              onRunAtChange={setRunAt}
              timezone={timezone}
              onTimezoneChange={setTimezone}
            />
            <Field label="Instruction" className="md:col-span-2">
              <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} className="min-h-24" />
            </Field>
            <Field label="Trigger config JSON" className="md:col-span-2">
              <Textarea value={triggerConfigJson} onChange={(event) => setTriggerConfigJson(event.target.value)} className="min-h-28 font-mono text-xs" />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <h3 className="text-sm font-medium">Execution policy</h3>
              <div className="mt-3 grid gap-3">
                <Field label="Concurrency">
                  <Select value={concurrencyPolicy} onValueChange={(value) => setConcurrencyPolicy(value as typeof concurrencyPolicy)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip_if_running">Skip if running</SelectItem>
                      <SelectItem value="queue_one">Queue one</SelectItem>
                      <SelectItem value="parallel">Parallel</SelectItem>
                      <SelectItem value="replace">Replace</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Catch-up">
                  <Select value={catchUpPolicy} onValueChange={(value) => setCatchUpPolicy(value as typeof catchUpPolicy)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="latest_only">Latest only</SelectItem>
                      <SelectItem value="bounded">Bounded</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Catch-up limit">
                  <Input type="number" min={0} max={100} value={catchUpLimit} onChange={(event) => setCatchUpLimit(event.target.value)} />
                </Field>
                <Field label="Max retries">
                  <Input type="number" min={0} max={20} value={maxRetries} onChange={(event) => setMaxRetries(event.target.value)} />
                </Field>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <h3 className="text-sm font-medium">Runtime selector</h3>
              <div className="mt-3 grid gap-3">
                <Field label="Engine">
                  <Select value={engine} onValueChange={setEngine}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="openclaw">OpenClaw</SelectItem>
                      <SelectItem value="hermes">Hermes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Runtime">
                  <Select value={runtimeFlavor} onValueChange={setRuntimeFlavor}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                      <SelectItem value="dedicated">Dedicated</SelectItem>
                      <SelectItem value="byo">BYO / local</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Runtime ID">
                  <Input value={runtimeId} onChange={(event) => setRuntimeId(event.target.value)} placeholder="Optional runtime UUID" />
                </Field>
                <Field label="Native scheduler">
                  <Select value={nativeScheduler} onValueChange={(value) => setNativeScheduler(value as RoutineRuntimeSelector['nativeScheduler'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">Lucid managed</SelectItem>
                      <SelectItem value="observe">Observe native</SelectItem>
                      <SelectItem value="import">Import native</SelectItem>
                      <SelectItem value="delegate_experimental">Delegate experimental</SelectItem>
                      <SelectItem value="delegate_supported">Delegate supported</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Selector metadata JSON">
                  <Textarea value={runtimeJson} onChange={(event) => setRuntimeJson(event.target.value)} className="min-h-24 font-mono text-xs" />
                </Field>
              </div>
            </div>

            {policyError ? <InfoBanner tone="danger" text={policyError} /> : null}
            <Button type="button" className="w-full" disabled={busy} onClick={save}>
              <Save className="h-4 w-4" />
              Save routine
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function formatRunReference(run: RoutineRunReceipt): string {
  if (run.crew_run_id) return `Crew run ${run.crew_run_id}`
  if (run.browser_run_id) return `Browser run ${run.browser_run_id}`
  if (run.agent_ops_run_id) return `Agent Ops run ${run.agent_ops_run_id}`
  return `${run.target_type} · ${run.task_kind}`
}

function summarizeRunHealth(runs: RoutineRunReceipt[]) {
  const latest = runs[0] ?? null
  const deadLetter = runs.filter((run) => run.status === 'dead_letter').length
  const failed = runs.filter((run) => run.status === 'failed').length
  const skipped = runs.filter((run) => run.status === 'skipped').length
  const blocked = runs.filter((run) => hasDispatchSignal(run, 'blocked')).length
  const stale = runs.filter(isStaleRun).length

  if (deadLetter > 0) return { label: 'Dead letter', tone: 'danger' as const, deadLetter, failed, skipped, blocked, stale, latest }
  if (blocked > 0) return { label: 'Blocked', tone: 'warning' as const, deadLetter, failed, skipped, blocked, stale, latest }
  if (stale > 0) return { label: 'Stale', tone: 'warning' as const, deadLetter, failed, skipped, blocked, stale, latest }
  if (failed > 0) return { label: 'Failed', tone: 'danger' as const, deadLetter, failed, skipped, blocked, stale, latest }
  if (skipped > 0) return { label: 'Skipped', tone: 'muted' as const, deadLetter, failed, skipped, blocked, stale, latest }
  return { label: latest ? 'Healthy' : 'No receipts', tone: 'success' as const, deadLetter, failed, skipped, blocked, stale, latest }
}

function hasDispatchSignal(run: RoutineRunReceipt, signal: string): boolean {
  const haystack = [
    run.status,
    run.error_message ?? '',
    JSON.stringify(run.dispatch_summary ?? {}),
    JSON.stringify(run.sanitized_evidence ?? {}),
  ].join(' ').toLowerCase()
  return haystack.includes(signal)
}

function isStaleRun(run: RoutineRunReceipt): boolean {
  if (!['queued', 'claimed', 'running'].includes(run.status)) return false
  const anchor = run.started_at || run.created_at
  const timestamp = new Date(anchor).getTime()
  return Number.isFinite(timestamp) && Date.now() - timestamp > 15 * 60 * 1000
}

function RoutineHealthPanel({
  health,
  latestRun,
}: {
  health: ReturnType<typeof summarizeRunHealth>
  latestRun: RoutineRunReceipt | null
}) {
  if (!latestRun && health.tone === 'success') return null

  const Icon = health.tone === 'danger'
    ? AlertTriangle
    : health.tone === 'warning'
      ? Ban
      : health.tone === 'muted'
        ? Timer
        : CheckCircle2

  return (
    <div className={cn(
      'rounded-lg border px-4 py-3 text-sm',
      health.tone === 'danger' && 'border-destructive/30 bg-destructive/5 text-destructive',
      health.tone === 'warning' && 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300',
      health.tone === 'muted' && 'border-border bg-muted/30 text-muted-foreground',
      health.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    )}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Routine state: {health.label}</p>
            <p className="mt-1 text-xs opacity-80">
              Dead letters {health.deadLetter} · Failed {health.failed} · Blocked {health.blocked} · Stale {health.stale} · Skipped {health.skipped}
            </p>
          </div>
        </div>
        {latestRun?.error_message ? <p className="max-w-xl truncate text-xs opacity-80">{sanitizeRoutineErrorForOperator(latestRun.error_message)}</p> : null}
      </div>
    </div>
  )
}

function sanitizeRoutineErrorForOperator(message: string | null | undefined): string | null {
  if (!message) return null

  const compact = message
    .replace(/\s+/g, ' ')
    .replace(/session_id:\s*[A-Za-z0-9_-]+/gi, '')
    .replace(/\/(?:Users|private|tmp|var|home)\/[^\s'")]+/g, '[internal path]')
    .trim()

  if (/invalid api key|unauthorized|401/i.test(compact)) {
    return 'Provider credentials were rejected. Check the selected key or TrustGate route.'
  }

  const providerMessage = compact.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1]
  if (providerMessage) {
    return `Provider rejected the request: ${providerMessage}.`
  }

  if (/\[internal path\]|Cannot find (?:module|package)|imported from/i.test(compact)) {
    return 'Runtime execution failed before completion. Check worker diagnostics for details.'
  }

  return compact.slice(0, 240)
}

function TeamDispatchPanel({
  routine,
  runs,
}: {
  routine: RoutineDefinition
  runs: RoutineRunReceipt[]
}) {
  const teamRuns = runs.filter((run) => run.target_type === 'team' || run.crew_run_id || Object.keys(run.dispatch_summary ?? {}).length > 0)
  const summary = summarizeTeamDispatch(teamRuns)

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">Dispatch receipts</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Team fanout, crew run refs, and per-adapter outcomes stay normalized here.</p>
          </div>
        </div>
        <div className="grid gap-2 border-b bg-muted/20 p-3 sm:grid-cols-4">
          <DispatchMetric label="Child runs" value={String(summary.childRuns)} />
          <DispatchMetric label="Partial" value={String(summary.partial)} tone={summary.partial > 0 ? 'warning' : 'default'} />
          <DispatchMetric label="Blocked" value={String(summary.blocked)} tone={summary.blocked > 0 ? 'warning' : 'default'} />
          <DispatchMetric label="Refused" value={String(summary.refused)} tone={summary.refused > 0 ? 'danger' : 'default'} />
        </div>
        {teamRuns.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyPanel title="No team dispatch yet" detail="Team dispatch data appears after a team routine or a run with crew/member fanout executes." />
          </div>
        ) : (
          <div className="divide-y">
            {teamRuns.slice(0, 12).map((run) => (
              <div key={run.id} className="grid gap-3 px-4 py-3 md:grid-cols-[140px_minmax(0,1fr)]">
                <div>
                  <Badge variant="outline" className="rounded-md">{formatRoutineStatus(run.status)}</Badge>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(run.completed_at || run.started_at || run.created_at)}</p>
                </div>
                <div className="min-w-0 space-y-2">
                  <RefPill label="Crew run" value={run.crew_run_id} />
                  <ChildRunList run={run} />
                  <CompactJson title="Dispatch" value={run.dispatch_summary} />
                  <CompactJson title="Evidence" value={run.sanitized_evidence} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <JsonPanel title="Team policy" value={routine.team_policy} />
    </div>
  )
}

function summarizeTeamDispatch(runs: RoutineRunReceipt[]) {
  let childRuns = 0
  let partial = 0
  let blocked = 0
  let refused = 0

  for (const run of runs) {
    const children = extractChildRuns(run)
    childRuns += children.length
    const summary = JSON.stringify(run.dispatch_summary ?? {}).toLowerCase()
    if (run.status === 'skipped' || summary.includes('partial')) partial += 1
    if (hasDispatchSignal(run, 'blocked') || children.some((child) => child.status.includes('blocked'))) blocked += 1
    if (hasDispatchSignal(run, 'refused') || children.some((child) => child.status.includes('refused'))) refused += 1
  }

  return { childRuns, partial, blocked, refused }
}

function ChildRunList({ run }: { run: RoutineRunReceipt }) {
  const childRuns = extractChildRuns(run)
  if (childRuns.length === 0) return null

  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-xs font-medium">Child runs</p>
      <div className="mt-2 grid gap-1">
        {childRuns.slice(0, 8).map((child, index) => (
          <div key={`${child.id}-${index}`} className="flex items-center justify-between gap-3 rounded-sm bg-muted/40 px-2 py-1 text-xs">
            <span className="min-w-0 truncate">{child.label}</span>
            <Badge variant={child.status.includes('failed') || child.status.includes('refused') ? 'destructive' : 'outline'} className="rounded-md">
              {child.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function extractChildRuns(run: RoutineRunReceipt): Array<{ id: string; label: string; status: string }> {
  const summary = run.dispatch_summary ?? {}
  const candidates = [
    (summary as { child_runs?: unknown }).child_runs,
    (summary as { childRuns?: unknown }).childRuns,
    (summary as { members?: unknown }).members,
    (summary as { fanout?: unknown }).fanout,
  ]
  const items = candidates.find(Array.isArray)
  if (!Array.isArray(items)) return []

  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => ({
      id: String(item.id ?? item.run_id ?? item.assistant_id ?? index),
      label: String(item.name ?? item.assistant_name ?? item.agent_name ?? item.id ?? `Child ${index + 1}`),
      status: String(item.status ?? item.state ?? 'unknown').replaceAll('_', ' '),
    }))
}

function DispatchMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warning' | 'danger'
}) {
  return (
    <div className={cn(
      'rounded-md border bg-background px-3 py-2',
      tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
      tone === 'danger' && 'border-destructive/30 bg-destructive/5',
    )}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function DetailMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted' }) {
  return (
    <div className={cn(
      'rounded-lg border bg-background px-4 py-3',
      tone === 'success' && 'border-emerald-500/30 bg-emerald-500/5',
      tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
      tone === 'danger' && 'border-destructive/30 bg-destructive/5',
      tone === 'muted' && 'bg-muted/30',
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium capitalize">{value}</p>
    </div>
  )
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs text-muted-foreground">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  )
}

function CompactJson({ title, value }: { title: string; value: unknown }) {
  const hasValue = value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0
  return (
    <details className="rounded-md border bg-background px-3 py-2 text-xs" open={false}>
      <summary className="cursor-pointer font-medium">
        {title}
        <span className="ml-2 text-muted-foreground">{hasValue ? 'refs' : 'empty'}</span>
      </summary>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  )
}

function RefPill({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-xs">
      <span className="font-medium">{label}</span>
      <span className="truncate text-muted-foreground">{value}</span>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border px-4 py-12 text-center">
      <RefreshCw className="h-5 w-5 text-muted-foreground" />
      <h3 className="mt-2 text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function InfoBanner({ tone, text }: { tone: 'success' | 'danger'; text: string }) {
  return (
    <div className={cn(
      'rounded-lg border px-4 py-3 text-sm',
      tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
        : 'border-destructive/30 bg-destructive/5 text-destructive',
    )}>
      {text}
    </div>
  )
}

function RoutineDetailSkeleton() {
  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-32 rounded-lg bg-muted/60" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 rounded-lg bg-muted/60" />)}
        </div>
        <div className="h-96 rounded-lg bg-muted/60" />
      </div>
    </div>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function jsonText(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

function parseJsonObject(value: string, label: string): { value: Record<string, unknown>; error: null } | { value: null; error: string } {
  if (!value.trim()) return { value: {}, error: null }
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: `${label} must be a JSON object.` }
    }
    return { value: parsed as Record<string, unknown>, error: null }
  } catch (error) {
    return { value: null, error: `${label} is invalid JSON: ${error instanceof Error ? error.message : 'parse error'}` }
  }
}

function stripRuntimeSelectorControls(selector: RoutineRuntimeSelector | null | undefined): Record<string, unknown> {
  const { engine: _engine, runtimeFlavor: _runtimeFlavor, runtimeId: _runtimeId, nativeScheduler: _nativeScheduler, ...rest } = selector ?? {}
  return rest
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}
