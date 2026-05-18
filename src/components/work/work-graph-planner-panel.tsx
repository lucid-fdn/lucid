'use client'

import React, { useMemo, useState } from 'react'
import type { WorkGraphDecompositionProposal, WorkGraphPlanningJob } from '@contracts/work-graph'
import { GitBranch, Loader2, Sparkles, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface WorkGraphPlannerPanelProps {
  orgId: string
  projectId: string
  initialPlanningJobs: WorkGraphPlanningJob[]
}

function getProposal(job: WorkGraphPlanningJob | null): WorkGraphDecompositionProposal | null {
  if (!job?.proposal || typeof job.proposal !== 'object') return null
  const value = job.proposal as unknown as WorkGraphDecompositionProposal
  if (!Array.isArray(value.goals) || !Array.isArray(value.work_items) || !Array.isArray(value.relations)) {
    return null
  }
  return value
}

export function WorkGraphPlannerPanel({
  orgId,
  projectId,
  initialPlanningJobs,
}: WorkGraphPlannerPanelProps) {
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState(initialPlanningJobs)
  const [selectedJobId, setSelectedJobId] = useState(initialPlanningJobs[0]?.id ?? null)
  const [busy, setBusy] = useState<'generate' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId],
  )
  const proposal = getProposal(selectedJob)

  async function refreshJobs(nextSelectedId?: string) {
    const res = await fetch(`/api/workspaces/${orgId}/projects/${projectId}/work-graph/planning-jobs`, {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Failed to refresh planning jobs')
    const data = await res.json() as { planningJobs?: WorkGraphPlanningJob[] }
    const nextJobs = data.planningJobs ?? []
    setJobs(nextJobs)
    setSelectedJobId(nextSelectedId ?? nextJobs[0]?.id ?? null)
  }

  async function generateProposal() {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('Describe the goal before generating a proposal.')
      return
    }
    setBusy('generate')
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${orgId}/projects/${projectId}/work-graph/planning-jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'builder',
          run_immediately: true,
          input: {
            prompt: trimmed,
            decomposition_style: 'balanced',
          },
        }),
      })
      if (!res.ok) throw new Error('Failed to generate Work Graph proposal')
      const data = await res.json() as { planningJob?: WorkGraphPlanningJob }
      await refreshJobs(data.planningJob?.id)
      setPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate proposal')
    } finally {
      setBusy(null)
    }
  }

  async function commitProposal() {
    if (!selectedJob) return
    setBusy('commit')
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${orgId}/projects/${projectId}/work-graph/planning-jobs/${selectedJob.id}/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accept_board: true,
          metadata: { source: 'project_work_planner_panel' },
        }),
      })
      if (!res.ok) throw new Error('Failed to commit proposal')
      await refreshJobs(selectedJob.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit proposal')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI Work Decomposition
        </CardTitle>
        <CardDescription>
          Turn a goal into a reviewed Work Graph proposal, then commit it into goals, work items, relations, and a board.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the goal, outcome, or project milestone..."
            className="min-h-28"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateProposal} disabled={busy !== null}>
              {busy === 'generate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate proposal
            </Button>
            <Button
              variant="outline"
              onClick={commitProposal}
              disabled={busy !== null || !proposal || selectedJob?.status !== 'needs_review'}
            >
              {busy === 'commit' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
              Commit proposal
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {jobs.length ? (
            <div className="space-y-2">
              {jobs.slice(0, 4).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedJob?.id === job.id ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{job.source.replace('_', ' ')}</span>
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {!proposal ? (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              No proposal selected yet.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold text-foreground">{proposal.goals.length}</p>
                  <p className="text-xs text-muted-foreground">Goals</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold text-foreground">{proposal.work_items.length}</p>
                  <p className="text-xs text-muted-foreground">Work items</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold text-foreground">{proposal.relations.length}</p>
                  <p className="text-xs text-muted-foreground">Relations</p>
                </div>
              </div>

              <div className="space-y-2">
                {proposal.goals.slice(0, 3).map((goal) => (
                  <div key={goal.proposal_id ?? goal.title} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-foreground">{goal.title}</p>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {goal.priority ?? 'normal'}
                      </Badge>
                    </div>
                    {goal.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {proposal.work_items.slice(0, 5).map((item) => (
                  <div key={item.proposal_id ?? item.title} className="rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

