'use client'

import React, { useEffect, useMemo, useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { Archive, BookOpen, Loader2, Save, Sparkles } from 'lucide-react'
import type { CrewRun, CrewRunMember, CrewStatus } from '@contracts/crew'
import type { Agent } from '@/types/agent'
import { useCrewDetail } from '@/hooks/use-crew-detail'
import { useCrewRuns } from '@/hooks/use-crew-runs'
import { useProjectGeneration } from '@/hooks/use-project-generation'
import { GenerationPromptPanel } from '@/components/ai/project-generation/generation-prompt-panel'
import { GenerationSuggestionCard } from '@/components/ai/project-generation/generation-suggestion-card'
import { GenerationModeSummary } from '@/components/ai/project-generation/generation-mode-summary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ContinuationHandoffCard } from '@/components/runs/continuation-handoff-card'
import { LiveRunWidget } from '@/components/runs/live-run-widget'
import { RunNarrativeView } from '@/components/runs/run-narrative-view'
import { RunSessionInspectorSheet } from '@/components/runs/run-session-inspector-sheet'
import { RunTimelineHeader } from '@/components/runs/run-timeline-header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { crewRunsToNarrativeItems } from '@/lib/runs/receipts'
import { notificationCopy } from '@/lib/notifications/copy'
import {
  summarizeCrewConnections,
  summarizeCrewInterventions,
  summarizeCrewRuns,
  summarizeCrewRuntimeModes,
} from '@/lib/teams/read-model'
import { buildCrewRunsTimeline } from '@/lib/runs/timeline'
import { projectDraftFromTeam } from '@/lib/ai/project-generation/projection'
import {
  buildTeamDraftApplyPlan,
  mapCrewEdgesToRoleHandoffs,
  sortCrewMembersForDraft,
} from '@/lib/ai/project-generation/team-live-edit'
import { SharedOperatingContextManager } from '@/components/operating-context/shared-operating-context-manager'

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-muted-foreground',
  active: 'text-green-400',
  paused: 'text-amber-400',
  completed: 'text-blue-400',
  archived: 'text-muted-foreground',
  starting: 'text-yellow-400',
  running: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-muted-foreground',
  pending: 'text-muted-foreground',
  skipped: 'text-muted-foreground',
}

interface TeamKnowledgePage {
  id: string
  subject: string
  compiledTruth: string
  trustLevel: string
  evidence: unknown[]
  version: number
}

function RunRow({
  run,
  orgId,
  projectId,
  crewId,
}: {
  run: CrewRun
  orgId: string
  projectId?: string
  crewId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState<CrewRunMember[]>([])

  useEffect(() => {
    if (!expanded) return
    const search = new URLSearchParams({ org_id: orgId })
    if (projectId) search.set('project_id', projectId)

    fetch(`/api/crews/${crewId}/runs/${run.id}?${search.toString()}`)
      .then(r => r.json())
      .then(data => setMembers(data.members ?? []))
      .catch(() => {})
  }, [expanded, run.id, orgId, projectId, crewId])

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${STATUS_COLORS[run.status] ?? 'text-white/40'}`}>
            {run.status}
          </span>
          <span className="text-xs text-white/40">
            {new Date(run.started_at).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {run.total_cost_usd > 0 && (
            <span className="text-xs text-white/30">
              ${run.total_cost_usd.toFixed(4)}
            </span>
          )}
          <span className="text-xs text-white/20">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 px-4 pb-3">
          {run.outcome_summary && (
            <p className="text-xs text-white/50">{run.outcome_summary}</p>
          )}
          {run.error_message && (
            <p className="text-xs text-red-400/70">{run.error_message}</p>
          )}
          {members.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-white/20">Members</span>
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="text-white/40">{m.assistant_id.slice(0, 8)}...</span>
                  <span className={STATUS_COLORS[m.status] ?? 'text-white/40'}>{m.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CrewDetailClient({
  crewId,
  orgId,
  projectId,
  projectSlug,
  workspaceSlug,
  assistants = [],
}: {
  crewId: string
  orgId: string
  projectId?: string
  projectSlug?: string
  workspaceSlug: string
  assistants?: Agent[]
}) {
  const router = useRouter()
  const { topology, refetch } = useCrewDetail(crewId, orgId, projectId)
  const crew = topology?.crew ?? null
  const members = topology?.members ?? []
  const { runs, startRun } = useCrewRuns(crewId, orgId, projectId)
  const [starting, setStarting] = useState(false)
  const [isSaving, startSaveTransition] = useTransition()
  const [isArchiving, startArchiveTransition] = useTransition()
  const [isApplyingGuidedEdit, setIsApplyingGuidedEdit] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runInspectorOpen, setRunInspectorOpen] = useState(false)
  const [teamKnowledgePages, setTeamKnowledgePages] = useState<TeamKnowledgePage[]>([])
  const [isSeedingKnowledge, setIsSeedingKnowledge] = useState(false)
  const [guidedEditAssignments, setGuidedEditAssignments] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [objective, setObjective] = useState('')
  const [status, setStatus] = useState<CrewStatus>('draft')
  const [topologyEnforced, setTopologyEnforced] = useState(false)
  const [costLimitPerRun, setCostLimitPerRun] = useState('')
  const [structureMode, setStructureMode] = useState<'hierarchy' | 'topology'>('hierarchy')
  const {
    prompt: guidedEditPrompt,
    setPrompt: setGuidedEditPrompt,
    result: guidedEditResult,
    isGenerating: isGuidedEditLoading,
    generate: runGuidedEdit,
    reset: resetGuidedEdit,
  } = useProjectGeneration({ workspaceId: orgId })

  useEffect(() => {
    if (!crew) return
    setName(crew.name)
    setDescription(crew.description ?? '')
    setObjective(crew.objective)
    setStatus(crew.status)
    setTopologyEnforced(crew.topology_enforced)
    setCostLimitPerRun(
      crew.cost_limit_per_run_usd == null ? '' : String(crew.cost_limit_per_run_usd),
    )
  }, [crew])

  const fetchTeamKnowledge = useCallback(async () => {
    const search = new URLSearchParams({
      org_id: orgId,
      team_id: crewId,
      scope_type: 'team',
      limit: '3',
    })
    const response = await fetch(`/api/knowledge/pages?${search.toString()}`)
    if (!response.ok) return
    const data = await response.json()
    setTeamKnowledgePages(data.pages ?? [])
  }, [crewId, orgId])

  useEffect(() => {
    void fetchTeamKnowledge()
  }, [fetchTeamKnowledge])

  const activeRun = runs.find(r => r.status === 'starting' || r.status === 'running')
  const coordinator = members.find(m => m.is_coordinator)
  const edges = topology?.edges ?? []
  const crewsHref = projectSlug
    ? `/${workspaceSlug}/projects/${projectSlug}/teams`
    : `/${workspaceSlug}/projects`
  const archived = crew?.status === 'archived'
  const hasChanges = useMemo(() => {
    if (!crew) return false
    return (
      name.trim() !== crew.name ||
      description !== (crew.description ?? '') ||
      objective.trim() !== crew.objective ||
      status !== crew.status ||
      topologyEnforced !== crew.topology_enforced ||
      costLimitPerRun !== (crew.cost_limit_per_run_usd == null ? '' : String(crew.cost_limit_per_run_usd))
    )
  }, [costLimitPerRun, crew, description, name, objective, status, topologyEnforced])
  const health = useMemo(() => summarizeCrewRuns(runs), [runs])
  const connectionSummary = useMemo(() => summarizeCrewConnections(members, edges), [members, edges])
  const runtimeSummary = useMemo(() => summarizeCrewRuntimeModes(members, assistants), [assistants, members])
  const interventionHistory = useMemo(() => summarizeCrewInterventions(runs), [runs])
  const runTimeline = useMemo(
    () => buildCrewRunsTimeline(runs.map((run) => ({ ...run, crewName: crew?.name ?? 'Team run' }))),
    [crew?.name, runs],
  )
  const runNarrativeItems = useMemo(
    () => crewRunsToNarrativeItems(runs.slice(0, 8).map((run) => ({ ...run, crewName: crew?.name ?? 'Team run' }))),
    [crew?.name, runs],
  )
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  )
  const sortedMembers = useMemo(() => sortCrewMembersForDraft(members), [members])
  const guidedEditApplyPlan = useMemo(() => {
    if (!guidedEditResult) return null
    return buildTeamDraftApplyPlan({
      draft: guidedEditResult.draft,
      members: sortedMembers,
    })
  }, [guidedEditResult, sortedMembers])
  const availableAssistantsForGuidedEdit = useMemo(() => {
    const currentAssistantIds = new Set(members.map((member) => member.assistant_id).filter(Boolean))
    return assistants.filter((assistant) => !currentAssistantIds.has(assistant.id))
  }, [assistants, members])
  const missingGuidedEditAssignments = useMemo(() => {
    const additions = guidedEditApplyPlan?.plan?.memberAdditions ?? []
    return additions.filter((addition) => !(guidedEditAssignments[addition.role]?.trim()))
  }, [guidedEditApplyPlan, guidedEditAssignments])

  const handleStart = async () => {
    setStarting(true)
    const result = await startRun()
    setStarting(false)
    if (!result) {
      toast.error(notificationCopy.team.failedToStartRun)
      return
    }
    toast.success(notificationCopy.team.runStarted)
    router.refresh()
  }

  const handleSave = () => {
    if (!crew) return

    startSaveTransition(async () => {
      const trimmedName = name.trim()
      const trimmedObjective = objective.trim()

      const parsedCostLimit =
        costLimitPerRun.trim() === '' ? null : Number.parseFloat(costLimitPerRun.trim())

      if (!trimmedName || !trimmedObjective) {
        toast.error('Name and objective are required')
        return
      }

      if (parsedCostLimit != null && Number.isNaN(parsedCostLimit)) {
        toast.error('Cost limit must be a valid number')
        return
      }

      const res = await fetch(`/api/crews/${crewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          name: trimmedName,
          description: description.trim() || null,
          objective: trimmedObjective,
          status,
          topology_enforced: topologyEnforced,
          cost_limit_per_run_usd: parsedCostLimit,
        }),
      })

      if (!res.ok) {
        toast.error(notificationCopy.team.failedToUpdate)
        return
      }

      toast.success(notificationCopy.team.updated)
      router.refresh()
    })
  }

  const handleArchive = () => {
    if (!crew || archived) return

    startArchiveTransition(async () => {
      const search = new URLSearchParams({ org_id: orgId })
      if (projectId) {
        search.set('project_id', projectId)
      }

      const res = await fetch(`/api/crews/${crewId}?${search.toString()}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        toast.error('Failed to archive team')
        return
      }

      toast.success('Team archived')
      router.push(crewsHref)
      router.refresh()
    })
  }

  const handleSeedTeamKnowledge = useCallback(async () => {
    setIsSeedingKnowledge(true)
    try {
      const response = await fetch('/api/knowledge/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seed_team',
          org_id: orgId,
          project_id: projectId ?? null,
          team_id: crewId,
        }),
      })
      if (!response.ok) throw new Error('Failed to seed team knowledge')
      await fetchTeamKnowledge()
      toast.success('Team knowledge updated')
    } catch (error) {
      toast.error('Could not update team knowledge', error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setIsSeedingKnowledge(false)
    }
  }, [crewId, fetchTeamKnowledge, orgId, projectId])

  const handleRunGuidedEdit = useCallback(async () => {
    if (!crew || !topology || !guidedEditPrompt.trim()) return

    const membersForDraft = sortCrewMembersForDraft(topology.members).map((member) => {
      const assistant = assistants.find((candidate) => candidate.id === member.assistant_id)
      return {
        assistant: {
          name: assistant?.name ?? member.assistant_name ?? member.role,
          description: assistant?.description ?? null,
          system_prompt: assistant?.system_prompt ?? `You are the ${member.role} member of ${crew.name}.`,
          lucid_model: assistant?.lucid_model ?? member.assistant_model ?? 'lucid-auto',
        },
        role: member.role,
        isCoordinator: member.is_coordinator,
      }
    })

    const next = await runGuidedEdit({
      draft: projectDraftFromTeam({
        crew: {
          name: crew.name,
          description: crew.description,
          objective: crew.objective,
        },
        members: membersForDraft,
        edges: mapCrewEdgesToRoleHandoffs({
          members: topology.members,
          edges: topology.edges,
        }),
      }),
    })

    return next
  }, [assistants, crew, guidedEditPrompt, runGuidedEdit, topology])

  const handleApplyGuidedEdit = useCallback(async () => {
    if (!crew || !guidedEditResult || !guidedEditApplyPlan?.plan) return

    setIsApplyingGuidedEdit(true)
    try {
      const applyPlan = guidedEditApplyPlan.plan
      const metadataRes = await fetch(`/api/crews/${crewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          name: applyPlan.crew.name,
          description: applyPlan.crew.description,
          objective: applyPlan.crew.objective,
          status,
          topology_enforced: topologyEnforced,
          cost_limit_per_run_usd:
            costLimitPerRun.trim() === '' ? null : Number.parseFloat(costLimitPerRun.trim()),
        }),
      })

      if (!metadataRes.ok) {
        throw new Error('Failed to update team metadata')
      }

      const memberUpdates = [...applyPlan.memberUpdates].sort(
        (left, right) => Number(left.isCoordinator) - Number(right.isCoordinator),
      )

      for (const memberUpdate of memberUpdates) {
        const memberRes = await fetch(`/api/crews/${crewId}/members/${memberUpdate.memberId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            project_id: projectId,
            role: memberUpdate.role,
            is_coordinator: memberUpdate.isCoordinator,
          }),
        })

        if (!memberRes.ok) {
          throw new Error('Failed to update a team member role')
        }
      }

      const edgesRes = await fetch(`/api/crews/${crewId}/edges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          edges: applyPlan.edges,
        }),
      })

      if (!edgesRes.ok) {
        throw new Error('Failed to update team handoffs')
      }

      setName(applyPlan.crew.name)
      setDescription(applyPlan.crew.description ?? '')
      setObjective(applyPlan.crew.objective)
      setGuidedEditPrompt('')
      resetGuidedEdit()
      toast.success('Guided team changes applied')
      await refetch()
      router.refresh()
    } catch (error) {
      toast.error(
        'Could not apply guided team edit',
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setIsApplyingGuidedEdit(false)
    }
  }, [
    costLimitPerRun,
    crew,
    crewId,
    guidedEditApplyPlan,
    guidedEditResult,
    orgId,
    projectId,
    refetch,
    resetGuidedEdit,
    router,
    status,
    topologyEnforced,
  ])

  if (!crew) {
    return (
      <div className="p-6 text-sm text-white/40">Loading team...</div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={crewsHref}
              className="text-xs text-white/30 hover:text-white/50"
            >
              Teams
            </Link>
            <span className="text-xs text-white/20">/</span>
            <h1 className="text-lg font-semibold text-white">{crew.name}</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-white/40">{crew.objective}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleStart}
            disabled={starting || !!activeRun || archived}
          >
            {starting ? 'Starting...' : activeRun ? 'Run Active' : 'Start Run'}
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving || !name.trim() || !objective.trim()}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Configuration</CardTitle>
              <CardDescription>
                Keep team metadata accurate so it stays understandable once a project has many agents and teams.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="team-name">Name</Label>
                  <Input
                    id="team-name"
                    value={name}
                    maxLength={100}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Research Team"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-status">Status</Label>
                  <Select value={status} onValueChange={(value) => setStatus(value as CrewStatus)}>
                    <SelectTrigger id="team-status" className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="team-description">Description</Label>
                <Textarea
                  id="team-description"
                  value={description}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional summary for teammates browsing this project"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="team-objective">Objective</Label>
                <Textarea
                  id="team-objective"
                  value={objective}
                  maxLength={2000}
                  rows={5}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder="What should this team accomplish?"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="team-cost-limit">Cost Limit Per Run (USD)</Label>
                  <Input
                    id="team-cost-limit"
                    inputMode="decimal"
                    value={costLimitPerRun}
                    onChange={(event) => setCostLimitPerRun(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="space-y-1">
                    <Label htmlFor="team-topology" className="text-sm">
                      Topology enforced
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Lock orchestration to the saved team structure.
                    </p>
                  </div>
                  <Switch
                    id="team-topology"
                    checked={topologyEnforced}
                    onCheckedChange={setTopologyEnforced}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guided Edit</CardTitle>
              <CardDescription>
                Ask Lucid to refine this team. The AI edits a projected draft first, then you review and apply the compatible changes through the existing crew save paths.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <GenerationPromptPanel
                id="team-guided-edit"
                label="What should change?"
                prompt={guidedEditPrompt}
                onPromptChange={setGuidedEditPrompt}
                placeholder="Make this team more explicit about triage versus resolution, and tighten the escalation handoff."
                isGenerating={isGuidedEditLoading}
                hasResult={Boolean(guidedEditResult)}
                onGenerate={() => { void handleRunGuidedEdit() }}
                onClear={() => {
                  setGuidedEditPrompt('')
                  resetGuidedEdit()
                }}
              />

              {guidedEditResult ? (
                <GenerationSuggestionCard
                  reasoningSummary={guidedEditResult.reasoning_summary}
                  warnings={guidedEditResult.warnings}
                >
                  <GenerationModeSummary result={guidedEditResult} title="Suggested path" />
                  {guidedEditApplyPlan?.plan ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Team name</p>
                          <p className="mt-2 text-sm text-foreground">{guidedEditApplyPlan.plan.crew.name}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Objective</p>
                          <p className="mt-2 text-sm text-foreground">{guidedEditApplyPlan.plan.crew.objective || 'No objective'}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                        <p className="mt-2 text-sm text-muted-foreground">{guidedEditApplyPlan.plan.crew.description || 'No description'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Proposed roles</p>
                        <div className="mt-2 space-y-2">
                          {guidedEditApplyPlan.plan.memberUpdates.map((memberUpdate) => (
                            <div key={memberUpdate.memberId} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-foreground">{memberUpdate.role}</span>
                              {memberUpdate.isCoordinator ? (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                  Coordinator
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Handoffs</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {guidedEditApplyPlan.plan.edges.length} saved handoff{guidedEditApplyPlan.plan.edges.length === 1 ? '' : 's'} will be applied.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => { void handleApplyGuidedEdit() }}
                          disabled={isApplyingGuidedEdit}
                        >
                          {isApplyingGuidedEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Apply changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {guidedEditApplyPlan?.reason ?? 'This suggestion needs a broader team rebuild, so review it in the project creation flow instead of applying it directly here.'}
                    </p>
                  )}
                </GenerationSuggestionCard>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Runtime Packaging</CardTitle>
              <CardDescription>
                Understand who operates this team and where its members are expected to run.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Primary runtime path</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {runtimeSummary.primaryMode ?? 'No runtime-ready members'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {runtimeSummary.primaryDescription ?? runtimeSummary.guidance}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Operator ownership</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {runtimeSummary.operatorLabel ?? 'Unassigned'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {runtimeSummary.assistedMembers > 0
                    ? `${runtimeSummary.alignmentLabel}. ${runtimeSummary.assistedMembers} member${runtimeSummary.assistedMembers === 1 ? '' : 's'} currently shape this runtime posture.`
                    : 'Add agents to this team to establish runtime ownership.'}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Runtime distribution</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>Shared runtime: {runtimeSummary.sharedCount}</p>
                  <p>Lucid-managed runtime: {runtimeSummary.managedCount}</p>
                  <p>Bring your own runtime: {runtimeSummary.byoCount}</p>
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Operator note</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {runtimeSummary.guidance}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>
                    {members.length === 0
                      ? 'No members added yet.'
                      : `${members.length} agent${members.length === 1 ? '' : 's'} assigned to this team.`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 rounded-lg border p-1">
                  <button
                    type="button"
                    onClick={() => setStructureMode('hierarchy')}
                    className={structureMode === 'hierarchy' ? 'rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground' : 'rounded-md px-3 py-1 text-xs text-muted-foreground'}
                  >
                    Hierarchy
                  </button>
                  <button
                    type="button"
                    onClick={() => setStructureMode('topology')}
                    className={structureMode === 'topology' ? 'rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground' : 'rounded-md px-3 py-1 text-xs text-muted-foreground'}
                  >
                    Topology
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-0">
              {members.length === 0 ? (
                <div className="py-3 text-xs text-white/30">No members</div>
              ) : structureMode === 'hierarchy' ? (
                <div className="space-y-3">
                  {coordinator ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {coordinator.assistant_name ?? coordinator.member_ref_id.slice(0, 8)}
                          </p>
                          <p className="mt-1 text-xs text-white/50">{coordinator.role}</p>
                        </div>
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          Coordinator
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div className="divide-y divide-white/5 rounded-lg border">
                    {members.filter((member) => !member.is_coordinator).map((member) => (
                      <div key={member.id} className="flex items-center justify-between py-3 px-4">
                        <div>
                          <span className="text-sm text-white">
                            {member.assistant_name ?? member.member_ref_id.slice(0, 8)}
                          </span>
                          <p className="mt-1 text-[11px] text-white/35">
                            Reports to {coordinator?.assistant_name ?? 'the current coordinator'}
                          </p>
                        </div>
                        <span className="text-xs text-white/40">{member.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    {members.map((member) => {
                      const connection = connectionSummary.find((entry) => entry.memberId === member.id)
                      return (
                        <div key={member.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">
                                {member.assistant_name ?? member.member_ref_id.slice(0, 8)}
                              </p>
                              <p className="mt-1 text-xs text-white/45">{member.role}</p>
                            </div>
                            {member.is_coordinator ? (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                Coordinator
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-white/40">
                            <div>
                              <p className="text-white/25">Outgoing</p>
                              <p>
                                {connection?.outboundCount ?? 0} edge
                                {(connection?.outboundCount ?? 0) === 1 ? '' : 's'}
                              </p>
                            </div>
                            <div>
                              <p className="text-white/25">Incoming</p>
                              <p>
                                {connection?.inboundCount ?? 0} edge
                                {(connection?.inboundCount ?? 0) === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live Run</CardTitle>
              <CardDescription>
                Keep the active run visible without forcing operators to dig through the full history first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeRun ? (
                <LiveRunWidget
                  run={activeRun}
                  title={`${crew.name} is running`}
                  ownerLabel={`Coordinator: ${coordinator?.assistant_name ?? 'Unassigned'}`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active team run right now. Start a run to surface live execution context here.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <CardTitle>Team Knowledge</CardTitle>
                  </div>
                  <CardDescription>
                    How this team works, handoffs, and recent outcomes as reusable context.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => { void handleSeedTeamKnowledge() }}
                  disabled={isSeedingKnowledge}
                >
                  {isSeedingKnowledge ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {teamKnowledgePages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No compiled team knowledge yet. Refresh to seed it from this team&apos;s objective, roles, handoffs, and recent run outcomes.
                </p>
              ) : (
                teamKnowledgePages.map((page) => (
                  <div key={page.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{page.subject}</p>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        v{page.version}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {page.compiledTruth}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {page.evidence.length} evidence link{page.evidence.length === 1 ? '' : 's'} · {page.trustLevel.replace(/_/g, ' ')}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {projectId ? (
            <SharedOperatingContextManager
              title="Team Context"
              description="Team-scoped thesis, handoff policy, feedback, risks, and Daily Intel inherited by member agents during runtime."
              workspaceId={orgId}
              projectId={projectId}
              scopeType="team"
              scopeId={crewId}
              endpoint={`/api/crews/${crewId}/context?org_id=${orgId}&project_id=${projectId}`}
              compact
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Run History</CardTitle>
              <CardDescription>
                Review team execution activity and open individual runs for member-level status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {runs.length === 0 ? (
                <div className="px-6 py-4 text-xs text-white/30">
                  No runs yet. Click &quot;Start Run&quot; to begin.
                </div>
              ) : (
                runs.map(run => (
                  <RunRow key={run.id} run={run} orgId={orgId} projectId={projectId} crewId={crewId} />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Outcomes</CardTitle>
              <CardDescription>
                Shared receipt narrative for this team&apos;s latest runs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunTimelineHeader
                timeline={runTimeline}
                title="Team execution overview"
                description="See how recent team runs unfolded before reading the full receipt narrative."
                selectedSegmentId={selectedRun?.id ?? null}
                onSegmentSelect={(segmentId) => {
                  setSelectedRunId(segmentId)
                  setRunInspectorOpen(true)
                }}
              />
              <div className="mt-4">
              <RunNarrativeView
                items={runNarrativeItems}
                emptyTitle="No team run narrative yet. Start a run to capture outcomes here."
              />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interventions &amp; Failures</CardTitle>
              <CardDescription>
                Make operator intervention explicit instead of burying it inside raw run history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Open incidents</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{interventionHistory.activeIncidents}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Team runs still active and worth monitoring before manual intervention.
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Failure streak</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{interventionHistory.consecutiveFailureCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Consecutive failed or cancelled runs since the last successful completion.
                  </p>
                </div>
              </div>
              {interventionHistory.totalInterventions === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent failures, cancellations, or actively running incidents need operator intervention right now.
                </p>
              ) : (
                interventionHistory.incidents.map((incident) => (
                  <div key={incident.runId} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {incident.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Started {new Date(incident.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {incident.recurring ? (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            Recurring
                          </span>
                        ) : null}
                        <span className={`text-xs font-medium ${STATUS_COLORS[incident.status] ?? 'text-muted-foreground'}`}>
                          {incident.status}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {incident.detail}
                    </p>
                    {incident.handoff ? (
                      <div className="mt-3">
                        <ContinuationHandoffCard handoff={incident.handoff} />
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                      <span>Team members: {members.length}</span>
                      <span>Coordinator: {coordinator?.assistant_name ?? 'Unassigned'}</span>
                      <span>{incident.recurring ? 'Repeated pattern detected' : 'New intervention pattern'}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team Health</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <span className="text-xs text-white/20">Success Rate</span>
                <p className="text-white/50">
                  {health.successRate == null ? 'No completed runs yet' : `${health.successRate}%`}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Failure Rate</span>
                <p className="text-white/50">
                  {health.failureRate == null ? 'No resolved runs yet' : `${health.failureRate}%`}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Recovery Rate</span>
                <p className="text-white/50">
                  {health.recoveryRate == null ? 'No failures yet' : `${health.recoveryRate}%`}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Active Runs</span>
                <p className="text-white/50">{health.activeRuns}</p>
              </div>
              <div>
                <span className="text-xs text-white/20">Failed Runs</span>
                <p className="text-white/50">{health.failedRuns}</p>
              </div>
              <div>
                <span className="text-xs text-white/20">Open Incidents</span>
                <p className="text-white/50">{interventionHistory.activeIncidents}</p>
              </div>
              <div>
                <span className="text-xs text-white/20">Average Cost</span>
                <p className="text-white/50">
                  {health.totalRuns === 0 ? 'No runs yet' : `$${health.averageCost.toFixed(4)}`}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Average Duration</span>
                <p className="text-white/50">
                  {health.totalRuns === 0 ? 'No runs yet' : `${health.averageDurationMinutes.toFixed(1)} min`}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Recent Failure Rate</span>
                <p className="text-white/50">
                  {health.recentFailureRate == null ? 'No recent resolved runs' : `${health.recentFailureRate}%`}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Incident Rate</span>
                <p className="text-white/50">
                  {health.incidentRate == null ? 'No runs yet' : `${health.incidentRate}%`}
                </p>
              </div>
              <div className="sm:col-span-2 xl:col-span-3">
                <span className="text-xs text-white/20">Reliability Trend</span>
                <p className="text-white/50">
                  {health.trendDirection === 'insufficient_data'
                    ? 'Not enough resolved runs yet'
                    : health.trendDirection === 'improving'
                      ? 'Improving'
                      : health.trendDirection === 'worsening'
                        ? 'Worsening'
                        : 'Steady'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {health.trendSummary}
                  {health.recoveryStreak > 0
                    ? ` Recovery streak: ${health.recoveryStreak} successful run${health.recoveryStreak === 1 ? '' : 's'}.`
                    : ''}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Coordinator</span>
                <p className="text-white/50">{coordinator?.assistant_name ?? 'None'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <span className="text-xs text-white/20">Status</span>
                <p className={STATUS_COLORS[crew.status]}>{crew.status}</p>
              </div>
              <div>
                <span className="text-xs text-white/20">Coordinator</span>
                <p className="text-white/50">{coordinator?.assistant_name ?? 'None'}</p>
              </div>
              <div>
                <span className="text-xs text-white/20">Topology</span>
                <p className="text-white/50">{crew.topology_enforced ? 'Enforced' : 'Open'}</p>
              </div>
              <div>
                <span className="text-xs text-white/20">Cost Limit</span>
                <p className="text-white/50">
                  {crew.cost_limit_per_run_usd
                    ? `$${crew.cost_limit_per_run_usd}/run`
                    : 'None'}
                </p>
              </div>
              <div>
                <span className="text-xs text-white/20">Last Updated</span>
                <p className="text-white/50">{new Date(crew.updated_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/25">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Archive old teams to keep the project surface clean without deleting historical runs.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Archived teams disappear from active inventory but can still be referenced in historical activity.
              </p>
              <Button variant="destructive" onClick={handleArchive} disabled={archived || isArchiving}>
                <Archive className="mr-2 h-4 w-4" />
                {isArchiving ? 'Archiving...' : archived ? 'Archived' : 'Archive team'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedRun ? (
        <RunSessionInspectorSheet
          open={runInspectorOpen}
          onOpenChange={setRunInspectorOpen}
          title={crew.name}
          description="Team run context and execution summary."
          badges={[selectedRun.status, selectedRun.trigger_type]}
          sections={[
            {
              id: 'started-at',
              label: 'Started at',
              value: new Date(selectedRun.started_at).toLocaleString(),
            },
            {
              id: 'completed-at',
              label: 'Completed at',
              value: selectedRun.completed_at ? new Date(selectedRun.completed_at).toLocaleString() : 'Still running',
            },
            {
              id: 'cost',
              label: 'Run cost',
              value: `$${selectedRun.total_cost_usd.toFixed(4)}`,
            },
            {
              id: 'summary',
              label: 'Outcome summary',
              value: selectedRun.outcome_summary ?? selectedRun.error_message ?? 'No summary recorded.',
            },
          ]}
        />
      ) : null}
    </div>
  )
}
