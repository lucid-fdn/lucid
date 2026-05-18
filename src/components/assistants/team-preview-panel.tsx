'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Activity, Crown, Play, Save, Target, Users, X, XCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { CrewStatus } from '@contracts/crew'
import { useCrewDetail } from '@/hooks/use-crew-detail'
import { useCrewRuns } from '@/hooks/use-crew-runs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { transitions } from '@/lib/design/motion'
import { notificationCopy } from '@/lib/notifications/copy'

const STATUS_STYLES: Record<CrewStatus, string> = {
  draft: 'text-muted-foreground',
  active: 'text-emerald-400',
  paused: 'text-amber-400',
  completed: 'text-blue-400',
  archived: 'text-muted-foreground',
}

const STATUS_LABELS: Record<CrewStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
}

export function TeamPreviewPanel({
  crewId,
  orgId,
  projectId,
  onClose,
}: {
  crewId: string
  orgId: string
  projectId?: string
  onClose: () => void
}) {
  const router = useRouter()
  const { topology } = useCrewDetail(crewId, orgId, projectId)
  const { runs, startRun } = useCrewRuns(crewId, orgId, projectId)
  const team = topology?.crew ?? null
  const members = topology?.members ?? []
  const [isSaving, startSaveTransition] = useTransition()
  const [isRunning, startRunTransition] = useTransition()
  const [isArchiving, startArchiveTransition] = useTransition()
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [status, setStatus] = useState<CrewStatus>('draft')

  useEffect(() => {
    if (!team) return
    setName(team.name)
    setObjective(team.objective)
    setStatus(team.status)
  }, [team])

  const hasChanges = useMemo(() => {
    if (!team) return false
    return name.trim() !== team.name || objective.trim() !== team.objective || status !== team.status
  }, [team, name, objective, status])

  const coordinator = useMemo(
    () => members.find((member) => member.is_coordinator) ?? null,
    [members],
  )

  const saveTeam = () => {
    if (!team) return
    startSaveTransition(async () => {
      const res = await fetch(`/api/crews/${crewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          name: name.trim(),
          objective: objective.trim(),
          status,
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

  const runTeam = () => {
    startRunTransition(async () => {
      const result = await startRun()
      if (!result) {
        toast.error(notificationCopy.team.failedToStartRun)
        return
      }
      toast.success(notificationCopy.team.runStarted)
      router.refresh()
    })
  }

  const dissolveTeam = () => {
    startArchiveTransition(async () => {
      const search = new URLSearchParams({ org_id: orgId })
      if (projectId) search.set('project_id', projectId)

      const res = await fetch(`/api/crews/${crewId}?${search.toString()}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        toast.error(notificationCopy.team.failedToDissolve)
        return
      }

      toast.success(notificationCopy.team.dissolved)
      router.refresh()
      onClose()
    })
  }

  const setCoordinator = (memberId: string) => {
    setUpdatingMemberId(memberId)
    void (async () => {
      const res = await fetch(`/api/crews/${crewId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId,
          is_coordinator: true,
        }),
      })

      setUpdatingMemberId(null)

      if (!res.ok) {
        toast.error('Failed to update coordinator')
        return
      }

      toast.success('Coordinator updated')
      router.refresh()
    })()
  }

  return (
    <motion.div
      initial={{ x: 460, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={transitions.reveal}
      className="flex h-full flex-col border-l bg-background/95 backdrop-blur-sm shadow-2xl"
    >
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                Team
              </span>
              <h2 className="truncate text-sm font-medium">{team?.name ?? 'Team'}</h2>
            </div>
            {team && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', STATUS_STYLES[team.status])}>
                  {STATUS_LABELS[team.status]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {runs.length} {runs.length === 1 ? 'run' : 'runs'}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close team panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          {!team ? (
            <div className="text-sm text-muted-foreground">Loading team...</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-card/70 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Members</p>
                  <p className="mt-2 text-lg font-semibold">{members.length}</p>
                </div>
                <div className="rounded-xl border bg-card/70 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coordinator</p>
                  <p className="mt-2 truncate text-sm font-medium">
                    {coordinator?.assistant_name ?? 'Unset'}
                  </p>
                </div>
                <div className="rounded-xl border bg-card/70 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest Run</p>
                  <p className="mt-2 text-sm font-medium">
                    {runs[0] ? new Date(runs[0].started_at).toLocaleDateString() : 'No runs'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Team Setup</h3>
                </div>
                <div className="space-y-3 rounded-xl border bg-card/70 p-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Objective</label>
                    <Textarea
                      value={objective}
                      onChange={(event) => setObjective(event.target.value)}
                      rows={4}
                      maxLength={2000}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <Select value={status} onValueChange={(value) => setStatus(value as CrewStatus)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
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
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button onClick={saveTeam} disabled={!hasChanges || isSaving || !name.trim() || !objective.trim()}>
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="secondary" onClick={runTeam} disabled={isRunning || team.status === 'archived'}>
                      <Play className="mr-2 h-4 w-4" />
                      {isRunning ? 'Starting...' : 'Start run'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Members</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{members.length}</span>
                </div>
                <div className="space-y-2">
                  {members.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-card/40 p-4 text-xs text-muted-foreground">
                      Drag agents into this team on the canvas to turn it into a real operational unit.
                    </div>
                  ) : (
                    members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between rounded-xl border bg-card/70 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {member.assistant_name ?? member.member_ref_id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.role}</p>
                        </div>
                        <div className="flex items-center gap-2 pl-3">
                          {member.is_coordinator ? (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                              Coordinator
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setCoordinator(member.id)}
                              disabled={updatingMemberId === member.id}
                            >
                              <Crown className="mr-1 h-3 w-3" />
                              {updatingMemberId === member.id ? 'Saving...' : 'Make coordinator'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{runs.length} runs</span>
                </div>
                <div className="space-y-2">
                  {runs.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-card/40 p-4 text-xs text-muted-foreground">
                      No runs yet. Start a run from this panel or from the team node.
                    </div>
                  ) : (
                    runs.slice(0, 6).map((run) => (
                      <div key={run.id} className="rounded-xl border bg-card/70 px-3 py-3">
                        <div className="flex items-center justify-between">
                          <span className={cn('text-xs font-medium uppercase tracking-wide', STATUS_STYLES[run.status as CrewStatus] ?? 'text-muted-foreground')}>
                            {run.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(run.started_at).toLocaleString()}
                          </span>
                        </div>
                        {run.outcome_summary && (
                          <p className="mt-1 text-xs text-muted-foreground">{run.outcome_summary}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-destructive">Danger Zone</p>
                <p className="text-xs text-muted-foreground">
                  Dissolve this team if it is no longer needed. Historical runs remain available.
                </p>
                <Button variant="destructive" onClick={dissolveTeam} disabled={isArchiving}>
                  <XCircle className="mr-2 h-4 w-4" />
                  {isArchiving ? 'Dissolving...' : 'Dissolve team'}
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  )
}
