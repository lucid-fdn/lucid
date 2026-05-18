import React from 'react'
import { notFound } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { getAssistant, getTradingPolicy, getAssistantMemories } from '@/lib/db'
import { getAssistantNativeMutationCandidates } from '@/lib/db/mission-control'
import { getAssistantEngineHomeState } from '@/lib/db/engine-home'
import { listRoutines } from '@/lib/routines/service'
import { getCurrentAgentAvatarAsset } from '@/lib/ai/agent-avatar/storage'
import { fetchModels } from '@/lib/ai/models'
import { getBYOKModels } from '@/lib/ai/byok-models'
import { getAgentPassport } from '@/lib/ai/passports'
import { isInternalWorkspace } from '@/lib/auth/internal'
import { getUnifiedSkills } from '@/lib/db/unified-skills'
import { AssistantDetailPageShell } from '@/components/assistants/assistant-detail-page-shell'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { buildProjectAgentsPath } from '@/lib/projects/urls'
import type { ScheduledTask, ScheduledTaskStatus } from '@/lib/mission-control/types'
import type { RoutineDefinition } from '@/lib/routines/types'

export default async function ProjectAgentDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string; id: string }>
}) {
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug, id } = await params
  const userId = await getUserId()

  if (!userId) notFound()

  const [scope, workspace] = await Promise.all([
    resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug),
    getWorkspaceWithAccess(workspaceSlug, userId),
  ])

  if (!scope || !workspace) notFound()

  const internal = isInternalWorkspace(workspace.id, workspace.slug)
  const assistant = await getAssistant(id)
  if (!assistant || assistant.org_id !== workspace.id || assistant.project_id !== scope.project.id) notFound()

  const [
    managedModels,
    byokModels,
    tradingPolicy,
    memoryData,
    scheduledTasks,
    unifiedSkills,
    initialPassport,
    nativeMutationCandidates,
    engineHomeState,
    currentAvatar,
  ] = await Promise.all([
    fetchModels().catch(() => []),
    getBYOKModels(workspace.id).catch(() => []),
    getTradingPolicy(id).catch(() => null),
    getAssistantMemories(id).catch(() => ({ memories: [], total: 0 })),
    listRoutines({ orgId: workspace.id, assistantId: id }).then((routines) => (
      routines.map((routine) => toScheduledTaskPanelShape(routine, id))
    )).catch(() => []),
    getUnifiedSkills(assistant).catch(() => []),
    assistant.passport_id
      ? getAgentPassport(assistant.passport_id).catch(() => null)
      : Promise.resolve(null),
    getAssistantNativeMutationCandidates(id, workspace.id, 25).catch(() => []),
    getAssistantEngineHomeState(id, workspace.id, 25).catch(() => ({ snapshots: [], candidates: [] })),
    getCurrentAgentAvatarAsset(id).catch(() => null),
  ])

  const models = [...managedModels, ...byokModels]

  type FetchedModel = (typeof models)[number]
  const grouped: Record<string, FetchedModel[]> = {}
  for (const model of models) {
    const provider = model.provider || 'Other'
    if (!grouped[provider]) grouped[provider] = []
    grouped[provider].push(model)
  }
  const modelGroups = Object.entries(grouped).map(([provider, providerModels]) => ({
    provider,
    models: providerModels,
  }))

  return (
    <AssistantDetailPageShell
      assistant={assistant}
      workspaceSlug={workspaceSlug}
      workspaceId={workspace.id}
      projectSlug={scope.project.slug}
      backHref={buildProjectAgentsPath(workspaceSlug, scope.project.slug)}
      initialModels={modelGroups}
      isInternal={internal}
      initialTradingPolicy={tradingPolicy}
      initialMemories={memoryData.memories}
      initialMemoriesTotal={memoryData.total}
      initialPassport={initialPassport}
      initialTasks={scheduledTasks}
      initialSkills={unifiedSkills}
      initialNativeMutationCandidates={nativeMutationCandidates}
      initialEngineHomeState={engineHomeState}
      initialAvatar={currentAvatar}
    />
  )
}

function toScheduledTaskPanelShape(routine: RoutineDefinition, assistantId: string): ScheduledTask {
  return {
    ...routine,
    assistant_id: routine.assistant_id ?? assistantId,
    description: routine.description ?? null,
    cron_expression: routine.cron_expression ?? null,
    timezone: routine.timezone ?? 'UTC',
    run_at: routine.run_at ?? null,
    status: routine.status as ScheduledTaskStatus,
    last_run_at: routine.last_run_at ?? null,
    last_error: null,
    next_run_at: routine.next_run_at ?? null,
    run_count: 0,
    retry_count: 0,
    max_retries: routine.max_retries ?? 3,
    enabled: routine.enabled,
    webhook_url: null,
    task_kind: routine.task_kind,
    target_type: routine.target_type,
    target_id: routine.target_id ?? null,
    team_id: routine.team_id ?? null,
    project_id: routine.project_id ?? null,
    work_item_id: routine.work_item_id ?? null,
    trigger_kind: routine.trigger_kind,
    trigger_config: routine.trigger_config,
    concurrency_policy: routine.concurrency_policy,
    catch_up_policy: routine.catch_up_policy,
    catch_up_limit: routine.catch_up_limit,
    runtime_selector: routine.runtime_selector,
    capability_requirements: routine.capability_requirements,
    source_kind: routine.source_kind,
    managed_resource_id: routine.managed_resource_id ?? null,
    last_run_status: routine.last_run_status ?? null,
    created_at: routine.created_at,
    updated_at: routine.updated_at,
  }
}
