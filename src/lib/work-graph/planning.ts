import 'server-only'

import {
  WorkGraphCommitRequestSchema,
  WorkGraphDecompositionInputSchema,
  WorkGraphDecompositionProposalSchema,
  type WorkGraphCommitRequest,
  type WorkGraphDecompositionInput,
  type WorkGraphDecompositionProposal,
  type WorkGraphPlanningJob,
} from '@contracts/work-graph'
import { generateStructuredObject } from '@/lib/ai/generation'
import { resolveProjectBuilderModels } from '@/lib/ai/services/builder-service'
import { createPulseStandaloneWorkItem, type HumanWorkItem } from '@/lib/db/human-work-items'
import {
  appendWorkGraphEvent,
  createWorkBoard,
  createWorkGoal,
  createWorkItemRelation,
  getPlanningJob,
  linkWorkItemToGoal,
  moveWorkBoardItem,
  updatePlanningJob,
  upsertWorkItemEngineFacet,
} from './db'

const WORK_GRAPH_PLANNER_MODEL = 'openai/gpt-4.1'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function withProposalIds(proposal: WorkGraphDecompositionProposal): WorkGraphDecompositionProposal {
  return {
    ...proposal,
    goals: proposal.goals.map((goal, index) => ({
      ...goal,
      proposal_id: goal.proposal_id ?? `goal-${index + 1}-${slugify(goal.title)}`,
    })),
    work_items: proposal.work_items.map((item, index) => ({
      ...item,
      proposal_id: item.proposal_id ?? `item-${index + 1}-${slugify(item.title)}`,
    })),
    relations: proposal.relations.map((relation, index) => ({
      ...relation,
      proposal_id: relation.proposal_id ?? `relation-${index + 1}-${slugify(relation.source_title)}-${slugify(relation.target_title)}`,
    })),
  }
}

export function createFallbackDecompositionProposal(
  input: WorkGraphDecompositionInput,
): WorkGraphDecompositionProposal {
  const normalizedPrompt = input.prompt.trim()
  const title = normalizedPrompt.length > 90
    ? `${normalizedPrompt.slice(0, 87).trim()}...`
    : normalizedPrompt

  const workItems = [
    {
      proposal_id: 'item-1-define-success',
      title: `Define success criteria for ${title}`,
      description: 'Clarify outcome, constraints, stakeholders, and acceptance evidence before execution starts.',
      priority: 'normal' as const,
      labels: ['planning'],
      goal_titles: [title],
      required_capabilities: input.required_capabilities,
    },
    {
      proposal_id: 'item-2-execute-first-slice',
      title: `Execute first production slice for ${title}`,
      description: 'Implement the smallest useful slice, attach evidence, and prepare review notes.',
      priority: input.decomposition_style === 'aggressive' ? 'high' as const : 'normal' as const,
      labels: ['execution'],
      goal_titles: [title],
      required_capabilities: input.required_capabilities,
    },
    {
      proposal_id: 'item-3-verify-rollout',
      title: `Verify and roll out ${title}`,
      description: 'Run checks, review UI/operator states, sync external PM mirrors if configured, and record evidence.',
      priority: 'normal' as const,
      labels: ['verification'],
      goal_titles: [title],
      required_capabilities: input.required_capabilities,
    },
  ]

  return withProposalIds({
    goals: [{
      proposal_id: 'goal-1-primary',
      project_id: input.project_id ?? null,
      title,
      description: `AI-assisted Work Graph goal generated from: ${normalizedPrompt}`,
      priority: 'normal',
      source: 'builder',
      metadata: {
        decomposition_style: input.decomposition_style,
        fallback: true,
      },
    }],
    work_items: workItems,
    relations: [
      {
        proposal_id: 'relation-1-define-blocks-execute',
        source_title: workItems[0].title,
        target_title: workItems[1].title,
        relation_type: 'blocks',
        reason: 'Execution should wait until success criteria are explicit.',
      },
      {
        proposal_id: 'relation-2-execute-blocks-verify',
        source_title: workItems[1].title,
        target_title: workItems[2].title,
        relation_type: 'blocks',
        reason: 'Verification depends on the first implemented slice.',
      },
    ],
    board: {
      project_id: input.project_id ?? null,
      name: 'Project Work',
      kind: 'kanban',
      source: 'lucid',
      columns: [
        { key: 'backlog', label: 'Backlog', status_filter: ['open'], position: 1000 },
        { key: 'in_progress', label: 'In progress', status_filter: ['in_progress'], position: 2000 },
        { key: 'done', label: 'Done', status_filter: ['done'], position: 3000, is_done: true },
      ],
    },
    notes: ['Generated with deterministic fallback because the AI planner was unavailable or disabled.'],
  })
}

export async function generateWorkGraphDecompositionProposal(input: WorkGraphDecompositionInput): Promise<{
  proposal: WorkGraphDecompositionProposal
  modelPolicy: Record<string, unknown>
  validationErrors: Array<Record<string, unknown>>
}> {
  const validatedInput = WorkGraphDecompositionInputSchema.parse(input)

  if (process.env.WORK_GRAPH_AI_PLANNER_DISABLED === 'true') {
    return {
      proposal: createFallbackDecompositionProposal(validatedInput),
      modelPolicy: { provider: 'deterministic', reason: 'WORK_GRAPH_AI_PLANNER_DISABLED' },
      validationErrors: [],
    }
  }

  try {
    const models = await resolveProjectBuilderModels(validatedInput.org_id, WORK_GRAPH_PLANNER_MODEL)
    const result = await generateStructuredObject({
      model: models.strongModel,
      schema: WorkGraphDecompositionProposalSchema,
      temperature: 0.2,
      maxTokens: 2600,
      system: [
        'You decompose project intent into Lucid Work Graph proposals.',
        'Return only durable product-planning state: goals, work items, PM relations, optional Kanban board, and short notes.',
        'Do not mention provider-specific APIs unless the input explicitly requires an external PM mirror.',
        'Do not include secrets, environment variables, internal provider IDs, or runtime-specific implementation details.',
        'Keep work items executable by humans or agents through runtime-neutral capabilities.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: JSON.stringify({
          task: 'Create a reviewed Work Graph decomposition proposal.',
          input: validatedInput,
        }),
      }],
      telemetry: {
        orgId: validatedInput.org_id,
        modelId: models.modelId,
        feature: 'work_graph.decomposition',
        metadata: {
          project_id: validatedInput.project_id ?? 'none',
          style: validatedInput.decomposition_style,
        },
      },
    })

    return {
      proposal: withProposalIds(WorkGraphDecompositionProposalSchema.parse(result.object)),
      modelPolicy: {
        provider: models.useGatewayFallback ? 'gateway_fallback' : 'trustgate_or_byok',
        model_id: models.modelId,
        requested_model_id: models.requestedModelId,
        fast_model_id: models.fastModelId,
      },
      validationErrors: [],
    }
  } catch (error) {
    return {
      proposal: createFallbackDecompositionProposal(validatedInput),
      modelPolicy: {
        provider: 'deterministic',
        fallback_from: 'ai_error',
        error: error instanceof Error ? error.message : String(error),
      },
      validationErrors: [{
        code: 'ai_planner_fallback',
        message: 'AI planner failed; deterministic proposal was generated for review.',
      }],
    }
  }
}

export async function runWorkGraphPlanningJob(input: {
  orgId: string
  planningJobId: string
  actorUserId?: string | null
}): Promise<WorkGraphPlanningJob | null> {
  const job = await getPlanningJob(input.orgId, input.planningJobId)
  if (!job) return null

  const startedAt = new Date().toISOString()
  await updatePlanningJob(input.orgId, job.id, {
    status: 'running',
    started_at: job.started_at ?? startedAt,
  })

  const decompositionInput = WorkGraphDecompositionInputSchema.parse({
    org_id: input.orgId,
    project_id: job.project_id ?? null,
    goal_id: job.goal_id ?? null,
    ...job.input,
  })
  const result = await generateWorkGraphDecompositionProposal(decompositionInput)

  const updated = await updatePlanningJob(input.orgId, job.id, {
    status: 'needs_review',
    proposal: result.proposal,
    validation_errors: result.validationErrors,
    model_policy: result.modelPolicy,
    completed_at: new Date().toISOString(),
  })

  await appendWorkGraphEvent({
    orgId: input.orgId,
    projectId: job.project_id ?? null,
    goalId: job.goal_id ?? null,
    actorKind: input.actorUserId ? 'user' : 'ai_planner',
    actorUserId: input.actorUserId ?? null,
    eventType: 'planning_job.generated',
    payload: {
      planning_job_id: job.id,
      goal_count: result.proposal.goals.length,
      work_item_count: result.proposal.work_items.length,
      relation_count: result.proposal.relations.length,
      model_policy: result.modelPolicy,
    },
  })

  return updated
}

function selectionIncludes(selection: string[], proposalId: string | undefined, fallback: string, defaultAll: boolean) {
  if (selection.length === 0) return defaultAll
  return selection.includes(proposalId ?? fallback)
}

export async function commitWorkGraphPlanningJob(input: {
  orgId: string
  request: WorkGraphCommitRequest
  actorUserId?: string | null
}): Promise<{
  planningJob: WorkGraphPlanningJob
  goals: Array<{ proposalId: string; goalId: string }>
  workItems: HumanWorkItem[]
  relations: Array<{ proposalId: string; relationId: string }>
  boardId: string | null
} | null> {
  const request = WorkGraphCommitRequestSchema.parse(input.request)
  const job = await getPlanningJob(input.orgId, request.planning_job_id)
  if (!job || !job.proposal || job.status !== 'needs_review') return null

  const proposal = withProposalIds(WorkGraphDecompositionProposalSchema.parse(job.proposal))
  const createdGoals = new Map<string, string>()
  const createdWorkItemsByTitle = new Map<string, HumanWorkItem>()
  const createdRelations: Array<{ proposalId: string; relationId: string }> = []

  for (const goal of proposal.goals) {
    const proposalId = goal.proposal_id ?? goal.title
    if (!selectionIncludes(request.accept_goal_ids, goal.proposal_id, goal.title, true)) continue
    const created = await createWorkGoal(input.orgId, {
      ...goal,
      project_id: job.project_id ?? goal.project_id ?? null,
      source: goal.source ?? 'builder',
      metadata: {
        ...goal.metadata,
        planning_job_id: job.id,
        proposal_id: proposalId,
        commit_metadata: request.metadata,
      },
    }, { actorKind: 'user', actorUserId: input.actorUserId ?? null })
    if (created) createdGoals.set(proposalId, created.id)
  }

  const primaryGoalByTitle = new Map<string, string>()
  for (const goal of proposal.goals) {
    const proposalId = goal.proposal_id ?? goal.title
    const goalId = createdGoals.get(proposalId)
    if (goalId) primaryGoalByTitle.set(goal.title, goalId)
  }

  for (const item of proposal.work_items) {
    const proposalId = item.proposal_id ?? item.title
    if (!selectionIncludes(request.accept_work_item_ids, item.proposal_id, item.title, true)) continue

    const created = await createPulseStandaloneWorkItem({
      org_id: input.orgId,
      pulse_job_run_id: `work-graph:${job.id}:${proposalId}`.slice(0, 200),
      title: item.title,
      description: item.description ?? null,
      priority: item.priority,
      labels: Array.from(new Set([...item.labels, 'work-graph'])),
      created_by: input.actorUserId ?? null,
    })
    if (!created) continue
    createdWorkItemsByTitle.set(item.title, created)

    if (item.required_capabilities.length > 0) {
      await upsertWorkItemEngineFacet(input.orgId, {
        project_id: job.project_id ?? null,
        work_item_id: created.id,
        engine: 'lucid',
        facet_key: 'required_capabilities',
        facet_state: {
          capabilities: item.required_capabilities,
          planning_job_id: job.id,
          proposal_id: proposalId,
        },
      }, { actorKind: 'ai_planner', actorUserId: input.actorUserId ?? null })
    }

    const goalTitle = item.goal_titles[0]
    const goalId = goalTitle ? primaryGoalByTitle.get(goalTitle) : [...createdGoals.values()][0]
    if (goalId) {
      await linkWorkItemToGoal(input.orgId, {
        goalId,
        workItemId: created.id,
        metadata: { planning_job_id: job.id, proposal_id: proposalId },
      }, { actorKind: 'user', actorUserId: input.actorUserId ?? null })
      await appendWorkGraphEvent({
        orgId: input.orgId,
        projectId: job.project_id ?? null,
        goalId,
        workItemId: created.id,
        actorKind: 'user',
        actorUserId: input.actorUserId ?? null,
        eventType: 'goal.work_item_link_proposed',
        payload: { planning_job_id: job.id, proposal_id: proposalId },
      })
    }
  }

  for (const relation of proposal.relations) {
    const proposalId = relation.proposal_id ?? `${relation.source_title}:${relation.target_title}`
    if (!selectionIncludes(request.accept_relation_ids, relation.proposal_id, proposalId, true)) continue
    const source = createdWorkItemsByTitle.get(relation.source_title)
    const target = createdWorkItemsByTitle.get(relation.target_title)
    if (!source || !target) continue

    const result = await createWorkItemRelation(input.orgId, {
      project_id: job.project_id ?? null,
      source_work_item_id: source.id,
      target_work_item_id: target.id,
      relation_type: relation.relation_type,
      reason: relation.reason ?? null,
      metadata: { planning_job_id: job.id, proposal_id: proposalId },
    }, { actorKind: 'user', actorUserId: input.actorUserId ?? null })
    if (result.relation) {
      createdRelations.push({ proposalId, relationId: result.relation.id })
    }
  }

  let boardId: string | null = null
  if (proposal.board && request.accept_board !== false) {
    const board = await createWorkBoard(input.orgId, {
      ...proposal.board,
      project_id: job.project_id ?? proposal.board.project_id ?? null,
      columns: proposal.board.columns,
    }, { actorKind: 'user', actorUserId: input.actorUserId ?? null })
    boardId = board?.board.id ?? null
    const firstColumn = board?.columns[0]
    if (boardId && firstColumn) {
      let index = 0
      for (const workItem of createdWorkItemsByTitle.values()) {
        await moveWorkBoardItem(input.orgId, boardId, {
          work_item_id: workItem.id,
          column_id: firstColumn.id,
          rank: (1000 + index * 1000).toString(36).padStart(8, '0'),
        }, { actorKind: 'user', actorUserId: input.actorUserId ?? null })
        index += 1
      }
    }
  }

  const committed = await updatePlanningJob(input.orgId, job.id, {
    status: 'committed',
    completed_at: new Date().toISOString(),
    proposal: {
      ...proposal,
      committed: {
        at: new Date().toISOString(),
        by: input.actorUserId ?? null,
        goals: [...createdGoals.entries()].map(([proposalId, goalId]) => ({ proposalId, goalId })),
        work_item_ids: [...createdWorkItemsByTitle.values()].map((item) => item.id),
        relations: createdRelations,
        board_id: boardId,
      },
    },
  })

  if (!committed) return null
  await appendWorkGraphEvent({
    orgId: input.orgId,
    projectId: job.project_id ?? null,
    goalId: job.goal_id ?? null,
    actorKind: 'user',
    actorUserId: input.actorUserId ?? null,
    eventType: 'planning_job.committed',
    payload: {
      planning_job_id: job.id,
      goal_count: createdGoals.size,
      work_item_count: createdWorkItemsByTitle.size,
      relation_count: createdRelations.length,
      board_id: boardId,
    },
  })

  return {
    planningJob: committed,
    goals: [...createdGoals.entries()].map(([proposalId, goalId]) => ({ proposalId, goalId })),
    workItems: [...createdWorkItemsByTitle.values()],
    relations: createdRelations,
    boardId,
  }
}
