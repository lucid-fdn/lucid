'use client'

import { useState } from 'react'
import { FlaskConical, Sparkles } from 'lucide-react'
import { RoutinePanel } from '@/components/routines/routine-panel'
import { RoutineScheduleEditor } from '@/components/routines/routine-schedule-editor'
import { ROUTINE_PRESETS, type RoutinePreset } from '@/components/routines/routine-presets'
import { useRoutines } from '@/hooks/use-routines'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { CreateRoutineInput, RoutineSimulation, RoutineTriggerKind } from '@/lib/routines/types'

interface RoutinesClientProps {
  orgId: string
  workspaceSlug: string
}

export function RoutinesClient({ orgId, workspaceSlug }: RoutinesClientProps) {
  const simulator = useRoutines({ orgId })
  const [panelVersion, setPanelVersion] = useState(0)

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <RoutineSimulator
          orgId={orgId}
          onSimulate={simulator.simulate}
          onCreate={simulator.create}
          onCreated={() => setPanelVersion((value) => value + 1)}
        />

        <RoutinePanel
          key={panelVersion}
          orgId={orgId}
          detailHref={(routine) => `/${workspaceSlug}/mission-control/routines/${routine.id}`}
        />
      </div>
    </div>
  )
}

function RoutineSimulator({
  orgId,
  onSimulate,
  onCreate,
  onCreated,
}: {
  orgId: string
  onSimulate: (input: CreateRoutineInput) => Promise<RoutineSimulation>
  onCreate: (input: CreateRoutineInput) => Promise<unknown>
  onCreated?: () => void
}) {
  const [targetType, setTargetType] = useState<CreateRoutineInput['target_type']>('assistant')
  const [triggerKind, setTriggerKind] = useState<RoutineTriggerKind>('cron')
  const [name, setName] = useState('Morning operating check')
  const [targetId, setTargetId] = useState('')
  const [assistantId, setAssistantId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workItemId, setWorkItemId] = useState('')
  const [cron, setCron] = useState('0 9 * * 1-5')
  const [runAt, setRunAt] = useState(toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000).toISOString()))
  const [timezone, setTimezone] = useState('UTC')
  const [concurrencyPolicy, setConcurrencyPolicy] = useState<NonNullable<CreateRoutineInput['concurrency_policy']>>('skip_if_running')
  const [catchUpPolicy, setCatchUpPolicy] = useState<NonNullable<CreateRoutineInput['catch_up_policy']>>('latest_only')
  const [catchUpLimit, setCatchUpLimit] = useState('1')
  const [maxRetries, setMaxRetries] = useState('3')
  const [engine, setEngine] = useState('any')
  const [runtimeFlavor, setRuntimeFlavor] = useState('any')
  const [runtimeId, setRuntimeId] = useState('')
  const [nativeScheduler, setNativeScheduler] = useState('disabled')
  const [triggerConfigJson, setTriggerConfigJson] = useState('{}')
  const [prompt, setPrompt] = useState('Review current work, summarize blockers, and propose next actions.')
  const [simulation, setSimulation] = useState<RoutineSimulation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function applyPreset(preset: RoutinePreset) {
    setTargetType(preset.targetType)
    setTriggerKind(preset.triggerKind)
    setName(preset.label)
    setCron(preset.cronExpression)
    setConcurrencyPolicy(preset.concurrencyPolicy)
    setCatchUpPolicy(preset.catchUpPolicy)
    setPrompt(preset.prompt)
    setTriggerConfigJson(JSON.stringify(preset.triggerConfig, null, 2))
    setSimulation(null)
    setError(null)
    setNotice(null)
  }

  function buildInput(): CreateRoutineInput {
    const triggerConfig = parseJsonObject(triggerConfigJson, 'Trigger config')
    if (triggerConfig.error) {
      throw new Error(triggerConfig.error)
    }

    return {
      org_id: orgId,
      name,
      task_prompt: prompt,
      target_type: targetType,
      target_id: targetId || undefined,
      assistant_id: targetType === 'assistant' ? assistantId || targetId || undefined : assistantId || undefined,
      team_id: targetType === 'team' ? teamId || targetId || undefined : teamId || undefined,
      project_id: projectId || undefined,
      work_item_id: workItemId || undefined,
      trigger_kind: triggerKind,
      cron_expression: triggerKind === 'cron' ? cron : undefined,
      run_at: triggerKind === 'one_shot' && runAt ? new Date(runAt).toISOString() : undefined,
      timezone,
      trigger_config: triggerConfig.value ?? {},
      concurrency_policy: concurrencyPolicy,
      catch_up_policy: catchUpPolicy,
      catch_up_limit: Math.max(0, Math.min(100, Number(catchUpLimit) || 0)),
      max_retries: Math.max(0, Math.min(20, Number(maxRetries) || 0)),
      runtime_selector: {
        engine: engine === 'any' ? null : engine as 'openclaw' | 'hermes',
        runtimeFlavor: runtimeFlavor === 'any' ? null : runtimeFlavor as 'shared' | 'dedicated' | 'byo',
        runtimeId: runtimeId.trim() || null,
        nativeScheduler: nativeScheduler as 'disabled' | 'observe' | 'import' | 'delegate_experimental' | 'delegate_supported',
      },
    }
  }

  async function simulate() {
    setBusy(true)
    setError(null)
    setNotice(null)
    setSimulation(null)
    try {
      setSimulation(await onSimulate(buildInput()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to simulate routine')
    } finally {
      setBusy(false)
    }
  }

  async function createRoutine() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await onCreate(buildInput())
      setNotice('Routine created and ready for review.')
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create routine')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border bg-background">
      <div className="flex flex-col gap-2 border-b px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-medium">Routine simulator</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Validate schedule, target, and capability shape before creating or promoting a routine.
          </p>
        </div>
        <Badge variant="outline" className="rounded-md">
          <FlaskConical className="h-3.5 w-3.5" />
          Dry run
        </Badge>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <div>
                  <h3 className="text-sm font-medium">Presets</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Start from common routine patterns, then connect the exact assistant, team, work item, runtime, or PM provider.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {ROUTINE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span className="text-xs font-medium">{preset.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 xl:col-span-2">
            <Label htmlFor="routine-name">Name</Label>
            <Input id="routine-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Target</Label>
            <Select value={targetType} onValueChange={(value) => setTargetType(value as CreateRoutineInput['target_type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assistant">Assistant</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="work_graph">Work Graph</SelectItem>
                <SelectItem value="agent_ops">Agent Ops</SelectItem>
                <SelectItem value="browser_procedure">Browser procedure</SelectItem>
                <SelectItem value="knowledge">Knowledge</SelectItem>
                <SelectItem value="engine_home">Engine Home</SelectItem>
                <SelectItem value="plugin_job">Plugin job</SelectItem>
                <SelectItem value="pm_sync">PM sync</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-target-id">Target ID</Label>
            <Input id="routine-target-id" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="UUID" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-assistant-id">Execution assistant</Label>
            <Input id="routine-assistant-id" value={assistantId} onChange={(event) => setAssistantId(event.target.value)} placeholder="Optional UUID" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-team-id">Team ID</Label>
            <Input id="routine-team-id" value={teamId} onChange={(event) => setTeamId(event.target.value)} placeholder="Optional UUID" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-project-id">Project ID</Label>
            <Input id="routine-project-id" value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="Optional UUID" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-work-item-id">Work item ID</Label>
            <Input id="routine-work-item-id" value={workItemId} onChange={(event) => setWorkItemId(event.target.value)} placeholder="Optional UUID" />
          </div>
          <RoutineScheduleEditor
            className="md:col-span-2 xl:col-span-3"
            triggerKind={triggerKind}
            onTriggerKindChange={setTriggerKind}
            cronExpression={cron}
            onCronExpressionChange={setCron}
            runAt={runAt}
            onRunAtChange={setRunAt}
            timezone={timezone}
            onTimezoneChange={setTimezone}
          />
          <div className="space-y-1.5">
            <Label>Concurrency</Label>
            <Select value={concurrencyPolicy} onValueChange={(value) => setConcurrencyPolicy(value as NonNullable<CreateRoutineInput['concurrency_policy']>)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip_if_running">Skip if running</SelectItem>
                <SelectItem value="queue_one">Queue one</SelectItem>
                <SelectItem value="parallel">Parallel</SelectItem>
                <SelectItem value="replace">Replace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Catch-up</Label>
            <Select value={catchUpPolicy} onValueChange={(value) => setCatchUpPolicy(value as NonNullable<CreateRoutineInput['catch_up_policy']>)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="latest_only">Latest only</SelectItem>
                <SelectItem value="bounded">Bounded</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-catch-up-limit">Catch-up limit</Label>
            <Input id="routine-catch-up-limit" type="number" min={0} max={100} value={catchUpLimit} onChange={(event) => setCatchUpLimit(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-max-retries">Max retries</Label>
            <Input id="routine-max-retries" type="number" min={0} max={20} value={maxRetries} onChange={(event) => setMaxRetries(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Engine</Label>
            <Select value={engine} onValueChange={setEngine}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="openclaw">OpenClaw</SelectItem>
                <SelectItem value="hermes">Hermes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Runtime</Label>
            <Select value={runtimeFlavor} onValueChange={setRuntimeFlavor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
                <SelectItem value="dedicated">Dedicated</SelectItem>
                <SelectItem value="byo">BYO / local</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routine-runtime-id">Runtime ID</Label>
            <Input id="routine-runtime-id" value={runtimeId} onChange={(event) => setRuntimeId(event.target.value)} placeholder="Optional UUID" />
          </div>
          <div className="space-y-1.5">
            <Label>Native scheduler</Label>
            <Select value={nativeScheduler} onValueChange={setNativeScheduler}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Lucid managed</SelectItem>
                <SelectItem value="observe">Observe native</SelectItem>
                <SelectItem value="import">Import native</SelectItem>
                <SelectItem value="delegate_experimental">Delegate experimental</SelectItem>
                <SelectItem value="delegate_supported">Delegate supported</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
            <Label htmlFor="routine-prompt">Instruction</Label>
            <Textarea id="routine-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-24" />
          </div>
          <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
            <Label htmlFor="routine-trigger-config">Trigger config JSON</Label>
            <Textarea id="routine-trigger-config" value={triggerConfigJson} onChange={(event) => setTriggerConfigJson(event.target.value)} className="min-h-24 font-mono text-xs" />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void simulate()} disabled={busy}>
                <FlaskConical className="h-4 w-4" />
                Simulate
              </Button>
              <Button type="button" variant="outline" onClick={() => void createRoutine()} disabled={busy}>
                Create routine
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <h3 className="text-sm font-medium">Result</h3>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
          {!error && !simulation ? (
            <p className="mt-2 text-xs text-muted-foreground">Run a simulation to see next fire time, blockers, and required capabilities.</p>
          ) : null}
          {simulation ? (
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={simulation.valid ? 'secondary' : 'destructive'}>
                  {simulation.valid ? 'Valid' : 'Blocked'}
                </Badge>
              </div>
              <ResultRow label="Target" value={simulation.targetType.replaceAll('_', ' ')} />
              <ResultRow label="Task" value={simulation.taskKind.replaceAll('_', ' ')} />
              <ResultRow label="Fanout" value={String(simulation.estimatedFanout)} />
              <div>
                <p className="text-muted-foreground">Next fire</p>
                <p className="mt-1 font-medium">{simulation.nextRuns[0] ? new Date(simulation.nextRuns[0]).toLocaleString() : 'None'}</p>
              </div>
              {simulation.errors.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Blockers</p>
                  {simulation.errors.map((item) => <p key={item} className="text-destructive">{item}</p>)}
                </div>
              ) : null}
              {simulation.requiredCapabilities.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Capabilities</p>
                  {simulation.requiredCapabilities.map((capability) => (
                    <Badge key={capability.id} variant="outline" className="mr-1 rounded-md">{capability.id}</Badge>
                  ))}
                </div>
              ) : null}
              {ROUTINE_PRESETS.find((preset) => preset.label === name)?.requiredFields.length ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Connect before launch</p>
                  {ROUTINE_PRESETS.find((preset) => preset.label === name)?.requiredFields.map((field) => (
                    <p key={field}>{field}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium capitalize">{value}</span>
    </div>
  )
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

function toDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}
