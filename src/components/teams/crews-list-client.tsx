'use client'

import { useCrews } from '@/hooks/use-crews'
import { useCrewRuns } from '@/hooks/use-crew-runs'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { Crew } from '@contracts/crew'
import type { CrewMember } from '@contracts/crew'
import type { Agent as Assistant } from '@/types/agent'
import { Button } from '@/components/ui/button'
import { CreateCrewDialog } from '@/components/crews/create-crew-dialog'
import { summarizeCrewRuntimeModes } from '@/lib/teams/read-model'
import { buildProjectTeamDetailPath } from '@/lib/projects/urls'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500',
  active: 'bg-green-500',
  paused: 'bg-amber-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-400',
}

function CrewCard({
  crew,
  members,
  assistants,
  orgId,
  projectId,
  projectSlug,
  workspaceSlug,
}: {
  crew: Crew
  members: CrewMember[]
  assistants: Assistant[]
  orgId: string
  projectId?: string
  projectSlug?: string
  workspaceSlug: string
}) {
  const { runs, startRun } = useCrewRuns(crew.id, orgId, projectId)
  const [starting, setStarting] = useState(false)
  const activeRun = runs.find(r => r.status === 'starting' || r.status === 'running')
  const lastRun = runs[0]
  const coordinator = members.find(member => member.is_coordinator)
  const runtimeSummary = summarizeCrewRuntimeModes(members, assistants)
  const crewHref = projectSlug
    ? buildProjectTeamDetailPath(workspaceSlug, projectSlug, crew.id)
    : `/${workspaceSlug}/projects`

  const handleStart = async () => {
    setStarting(true)
    await startRun()
    setStarting(false)
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href={crewHref}
          className="text-sm font-medium text-white hover:underline"
        >
          {crew.name}
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-white/50">
          <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[crew.status] ?? 'bg-gray-500'}`} />
          {crew.status}
        </span>
      </div>

      {crew.objective && (
        <p className="text-xs text-white/40 line-clamp-2">{crew.objective}</p>
      )}

      <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          {activeRun
            ? `Run ${activeRun.status}`
            : lastRun
              ? `Last run: ${lastRun.status}`
              : 'No runs yet'}
        </span>
        <span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          Coordinator: {coordinator?.assistant_name ?? coordinator?.role ?? 'Unassigned'}
        </span>
        <span>{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/45">
        <div className="flex items-center justify-between gap-3">
          <span className="text-white/60">
            {runtimeSummary.primaryMode ?? 'No runtime assigned'}
          </span>
          {runtimeSummary.operatorLabel ? <span>{runtimeSummary.operatorLabel}</span> : null}
        </div>
        {runtimeSummary.assistedMembers > 0 ? (
          <p className="mt-1 text-[11px] text-white/35">
            {runtimeSummary.alignmentLabel} · {runtimeSummary.assistedMembers} member{runtimeSummary.assistedMembers === 1 ? '' : 's'}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-white/35">No runtime-ready members yet</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleStart}
          disabled={starting || !!activeRun || crew.status === 'archived'}
          className="flex-1 rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {starting ? 'Starting...' : activeRun ? 'Running' : 'Start Run'}
        </button>
        <Link
          href={crewHref}
          className="rounded bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
        >
          Detail
        </Link>
      </div>
    </div>
  )
}

export function CrewsListClient({
  orgId,
  projectId,
  projectSlug,
  workspaceSlug,
  title = 'Teams',
  description = 'Multi-agent orchestration groups',
  emptyDescription = 'No teams yet. Create one from the Agents canvas.',
  assistants = [],
}: {
  orgId: string
  projectId?: string
  projectSlug?: string
  workspaceSlug: string
  title?: string
  description?: string
  emptyDescription?: string
  assistants?: Assistant[]
}) {
  const router = useRouter()
  const { crews, crewMembers } = useCrews(orgId, projectId)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-white/40">
            {description}
          </p>
        </div>
        <span className="text-xs text-white/30">
          {crews.length} team{crews.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New team
        </Button>
      </div>

      {crews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-8 text-center">
          <p className="text-sm text-white/40">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {crews.map(crew => (
            <CrewCard
              key={crew.id}
              crew={crew}
              members={crewMembers[crew.id] ?? []}
              assistants={assistants}
              orgId={orgId}
              projectId={projectId}
              projectSlug={projectSlug}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      )}

      <CreateCrewDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        assistants={assistants}
        orgId={orgId}
        projectId={projectId}
        onCreated={() => {
          router.refresh()
        }}
      />
    </div>
  )
}
