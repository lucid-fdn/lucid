import 'server-only'

import { supabase, ErrorService, isTransientSupabaseError } from './client'
import type {
  Crew,
  CrewTopology,
  CrewRun,
  CrewRunMember,
  CrewMember,
  CrewEdge,
  CreateCrewInput,
  CreateTeamInput,
  UpdateCrewInput,
  UpdateTeamInput,
  AddCrewMemberInput,
  UpdateCrewMemberInput,
  Team,
  TeamTopology,
} from '@contracts/crew'

const CREW_SELECT =
  'id, org_id, project_id, name, description, objective, lead_member_id, status, max_concurrent_runs, cost_limit_per_run_usd, cost_limit_daily_usd, topology_enforced, canvas_position, canvas_size, created_by, created_at, updated_at, deleted_at' as const

const CREW_MEMBER_SELECT =
  'id, crew_id, member_type, member_ref_id, assistant_id, role, role_description, is_coordinator, join_order, position_in_crew, created_at' as const

const CREW_MEMBER_WITH_ASSISTANT_SELECT =
  'id, crew_id, member_type, member_ref_id, assistant_id, role, role_description, is_coordinator, join_order, position_in_crew, created_at, ai_assistants!inner(name, lucid_model, is_active)' as const

const CREW_EDGE_SELECT =
  'id, crew_id, source_member_id, target_member_id, direction, label, created_at' as const

const CREW_RUN_SELECT =
  'id, crew_id, org_id, trigger_type, triggered_by, status, started_at, completed_at, outcome_summary, error_message, total_cost_usd, created_at' as const

const CREW_RUN_MEMBER_SELECT =
  'id, crew_run_id, crew_member_id, assistant_id, status, started_at, completed_at, outcome_summary, error_message, cost_usd' as const

// ─── List / Get ───────────────────────────────────────────────────────

export async function getCrews(orgId: string, projectId?: string): Promise<Crew[]> {
  return getCrewsByProject(orgId, projectId)
}

export async function getTeams(orgId: string, projectId?: string): Promise<Team[]> {
  return getCrewsByProject(orgId, projectId) as Promise<Team[]>
}

export async function getCrewsByProject(orgId: string, projectId?: string): Promise<Crew[]> {
  let query = supabase
    .from('crews')
    .select(CREW_SELECT)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: isTransientSupabaseError(error) ? 'warning' : 'error',
      context: { fn: 'getCrewsByProject', orgId, projectId },
      tags: { layer: 'db', route: 'crews' },
    })
    return []
  }
  return data ?? []
}

export async function getCrew(crewId: string, orgId: string, projectId?: string): Promise<Crew | null> {
  let query = supabase
    .from('crews')
    .select(CREW_SELECT)
    .eq('id', crewId)
    .eq('org_id', orgId)
    .is('deleted_at', null)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getCrew', crewId, orgId, projectId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }
  return data
}

export async function getTeam(teamId: string, orgId: string, projectId?: string): Promise<Team | null> {
  return getCrew(teamId, orgId, projectId) as Promise<Team | null>
}

export async function getCrewTopology(crewId: string, orgId: string, _projectId?: string): Promise<CrewTopology | null> {
  if (_projectId) {
    const scopedCrew = await getCrew(crewId, orgId, _projectId)
    if (!scopedCrew) return null
  }

  const { data, error } = await supabase.rpc('get_crew_with_topology', {
    p_crew_id: crewId,
    p_org_id: orgId,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getCrewTopology', crewId, orgId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }
  return data as CrewTopology | null
}

export async function getTeamTopology(teamId: string, orgId: string, projectId?: string): Promise<TeamTopology | null> {
  return getCrewTopology(teamId, orgId, projectId) as Promise<TeamTopology | null>
}

/**
 * Batch-fetch all members + edges for multiple crews in 2 queries (eliminates N+1).
 * Returns maps keyed by crew ID.
 */
export async function getCrewsTopologyBatch(
  crewIds: string[],
  orgId: string,
  projectId?: string,
): Promise<{ members: Record<string, CrewMember[]>; edges: Record<string, CrewEdge[]> }> {
  if (crewIds.length === 0) return { members: {}, edges: {} }

  const [membersResult, edgesResult] = await Promise.all([
    supabase
      .from('crew_members')
      .select(CREW_MEMBER_WITH_ASSISTANT_SELECT)
      .in('crew_id', crewIds),
    supabase
      .from('crew_edges')
      .select(CREW_EDGE_SELECT)
      .in('crew_id', crewIds),
  ])

  if (membersResult.error) {
    ErrorService.captureException(membersResult.error, {
      severity: 'error',
      context: { fn: 'getCrewsTopologyBatch', orgId, projectId },
      tags: { layer: 'db', route: 'crews' },
    })
  }
  if (edgesResult.error) {
    ErrorService.captureException(edgesResult.error, {
      severity: 'error',
      context: { fn: 'getCrewsTopologyBatch', orgId, projectId },
      tags: { layer: 'db', route: 'crews' },
    })
  }

  const members: Record<string, CrewMember[]> = {}
  const edges: Record<string, CrewEdge[]> = {}

  for (const id of crewIds) {
    members[id] = []
    edges[id] = []
  }

  for (const row of membersResult.data ?? []) {
    const joined = (row as Record<string, unknown>).ai_assistants as Record<string, unknown> | undefined
    const member: CrewMember = {
      id: row.id,
      crew_id: row.crew_id,
      member_type: row.member_type,
      member_ref_id: row.member_ref_id,
      assistant_id: row.assistant_id,
      role: row.role,
      role_description: row.role_description,
      is_coordinator: row.is_coordinator,
      join_order: row.join_order,
      position_in_crew: row.position_in_crew,
      created_at: row.created_at,
      assistant_name: (joined?.name as string) ?? undefined,
      assistant_model: (joined?.lucid_model as string) ?? undefined,
      assistant_is_active: (joined?.is_active as boolean) ?? undefined,
    }
    members[row.crew_id]?.push(member)
  }

  for (const row of edgesResult.data ?? []) {
    const edge: CrewEdge = {
      id: row.id,
      crew_id: row.crew_id,
      source_member_id: row.source_member_id,
      target_member_id: row.target_member_id,
      direction: row.direction,
      label: row.label,
      created_at: row.created_at,
    }
    edges[row.crew_id]?.push(edge)
  }

  return { members, edges }
}

// ─── Create ───────────────────────────────────────────────────────────

export async function createCrew(
  orgId: string,
  input: CreateCrewInput,
  userId?: string,
): Promise<{ crew: Crew; members: CrewMember[]; edges: CrewEdge[] } | null> {
  // 1. Insert crew
  const { data: crew, error: crewError } = await supabase
    .from('crews')
    .insert({
      org_id: orgId,
      project_id: input.project_id,
      name: input.name,
      description: input.description ?? null,
      objective: input.objective,
      max_concurrent_runs: input.max_concurrent_runs ?? 1,
      cost_limit_per_run_usd: input.cost_limit_per_run_usd ?? null,
      cost_limit_daily_usd: input.cost_limit_daily_usd ?? null,
      topology_enforced: input.topology_enforced ?? false,
      canvas_position: input.canvas_position ?? null,
      canvas_size: input.canvas_size ?? null,
      created_by: userId ?? null,
    })
    .select()
    .single()

  if (crewError || !crew) {
    ErrorService.captureException(crewError, {
      severity: 'error',
      context: { fn: 'createCrew', orgId, projectId: input.project_id },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }

  // Helper: delete the orphaned crew header on rollback.
  // CASCADE on crew_members + crew_edges means one delete cleans everything up.
  const rollback = async (reason: string, cause: unknown) => {
    await supabase.from('crews').delete().eq('id', crew.id)
    ErrorService.captureException(cause as Error, {
      severity: 'error',
      context: { fn: `createCrew.${reason}`, crewId: crew.id, orgId },
      tags: { layer: 'db', route: 'crews' },
    })
  }

  const createdMembers: CrewMember[] = []
  const createdEdges: CrewEdge[] = []

  // 2. Insert members if provided
  if (input.members?.length) {
    const memberRows = input.members.map((m, i) => ({
      crew_id: crew.id,
      member_type: 'assistant' as const,
      member_ref_id: m.assistant_id,
      assistant_id: m.assistant_id,
      role: m.role,
      role_description: m.role_description ?? null,
      is_coordinator: m.is_coordinator ?? false,
      join_order: i,
    }))

    const { data: members, error: membersError } = await supabase
      .from('crew_members')
      .insert(memberRows)
      .select()

    if (membersError || !members) {
      await rollback('members', membersError ?? new Error('No members returned after insert'))
      return null
    }

    createdMembers.push(...members)

    // Set lead_member_id to the coordinator
    const coordinator = members.find((m) => m.is_coordinator)
    if (coordinator) {
      const { error: leadErr } = await supabase
        .from('crews')
        .update({ lead_member_id: coordinator.id })
        .eq('id', crew.id)
      if (leadErr) {
        // Non-fatal: lead_member_id is denormalised metadata, not structural.
        ErrorService.captureException(leadErr, {
          severity: 'warning',
          context: { fn: 'createCrew.setLead', crewId: crew.id },
          tags: { layer: 'db', route: 'crews' },
        })
      } else {
        crew.lead_member_id = coordinator.id
      }
    }

    // 3. Insert edges if provided (resolve indices to member IDs)
    if (input.edges?.length && members.length) {
      const edgeRows = input.edges
        .filter((e) => members[e.source_member_index] && members[e.target_member_index])
        .map((e) => ({
          crew_id: crew.id,
          source_member_id: members[e.source_member_index].id,
          target_member_id: members[e.target_member_index].id,
          direction: e.direction ?? 'bidirectional',
          label: e.label ?? null,
        }))

      if (edgeRows.length) {
        const { data: edges, error: edgesError } = await supabase
          .from('crew_edges')
          .insert(edgeRows)
          .select()

        if (edgesError || !edges) {
          await rollback('edges', edgesError ?? new Error('No edges returned after insert'))
          return null
        }

        createdEdges.push(...edges)
      }
    }
  }

  return { crew, members: createdMembers, edges: createdEdges }
}

export async function createTeam(
  orgId: string,
  input: CreateTeamInput,
  userId?: string,
) {
  return createCrew(orgId, input, userId)
}

// ─── Update / Delete ──────────────────────────────────────────────────

export async function updateCrew(
  crewId: string,
  orgId: string,
  input: UpdateCrewInput,
  projectId?: string,
): Promise<Crew | null> {
  let query = supabase
    .from('crews')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', crewId)
    .eq('org_id', orgId)
    .is('deleted_at', null)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query.select().single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'updateCrew', crewId, orgId, projectId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }
  return data
}

export async function updateTeam(
  teamId: string,
  orgId: string,
  input: UpdateTeamInput,
  projectId?: string,
): Promise<Team | null> {
  return updateCrew(teamId, orgId, input, projectId) as Promise<Team | null>
}

export async function deleteCrew(crewId: string, orgId: string, projectId?: string): Promise<boolean> {
  // Clear crew_id cache on all member assistants (soft delete doesn't trigger CASCADE)
  const { error: cacheError } = await supabase
    .from('ai_assistants')
    .update({ crew_id: null })
    .eq('crew_id', crewId)

  if (cacheError) {
    ErrorService.captureException(cacheError, {
      severity: 'warning',
      context: { fn: 'deleteCrew.clearCache', crewId },
      tags: { layer: 'db', route: 'crews' },
    })
  }

  let query = supabase
    .from('crews')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', crewId)
    .eq('org_id', orgId)
    .is('deleted_at', null)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'deleteCrew', crewId, orgId, projectId },
      tags: { layer: 'db', route: 'crews' },
    })
    return false
  }
  return true
}

export async function deleteTeam(teamId: string, orgId: string, projectId?: string): Promise<boolean> {
  return deleteCrew(teamId, orgId, projectId)
}

// ─── Members ──────────────────────────────────────────────────────────

export async function addCrewMember(
  crewId: string,
  input: AddCrewMemberInput,
): Promise<CrewMember | null> {
  // v1: assistant can only be in one non-deleted crew at a time
  const { data: existing } = await supabase
    .from('crew_members')
    .select('crew_id, crews!inner(deleted_at)')
    .eq('member_ref_id', input.assistant_id)
    .is('crews.deleted_at', null)
    .limit(1)
    .single()

  if (existing && existing.crew_id !== crewId) {
    ErrorService.captureException(new Error('Assistant already in another crew'), {
      severity: 'warning',
      context: { fn: 'addCrewMember', crewId, assistantId: input.assistant_id, existingCrewId: existing.crew_id },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }

  // Get next join_order
  const { data: maxOrder } = await supabase
    .from('crew_members')
    .select('join_order')
    .eq('crew_id', crewId)
    .order('join_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (maxOrder?.join_order ?? -1) + 1

  const { data, error } = await supabase
    .from('crew_members')
    .insert({
      crew_id: crewId,
      member_type: 'assistant',
      member_ref_id: input.assistant_id,
      assistant_id: input.assistant_id,
      role: input.role,
      role_description: input.role_description ?? null,
      is_coordinator: input.is_coordinator ?? false,
      join_order: nextOrder,
      position_in_crew: input.position_in_crew ?? null,
    })
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'addCrewMember', crewId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }

  // If this member is the coordinator, set lead_member_id
  if (data && input.is_coordinator) {
    const { error: leadError } = await supabase
      .from('crews')
      .update({ lead_member_id: data.id, updated_at: new Date().toISOString() })
      .eq('id', crewId)
    if (leadError) {
      ErrorService.captureException(leadError, {
        severity: 'warning',
        context: { fn: 'addCrewMember.setLead', crewId, memberId: data.id },
        tags: { layer: 'db', route: 'crews' },
      })
    }
  }

  return data
}

export async function removeCrewMember(crewId: string, memberId: string): Promise<boolean> {
  // Check if this member is the coordinator — if so, clear lead_member_id
  const { data: crew } = await supabase
    .from('crews')
    .select('lead_member_id')
    .eq('id', crewId)
    .single()

  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('id', memberId)
    .eq('crew_id', crewId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'removeCrewMember', crewId, memberId },
      tags: { layer: 'db', route: 'crews' },
    })
    return false
  }

  // Clear lead_member_id if we just removed the coordinator
  if (crew?.lead_member_id === memberId) {
    const { error: leadError } = await supabase
      .from('crews')
      .update({ lead_member_id: null, updated_at: new Date().toISOString() })
      .eq('id', crewId)
    if (leadError) {
      ErrorService.captureException(leadError, {
        severity: 'warning',
        context: { fn: 'removeCrewMember.clearLead', crewId, memberId },
        tags: { layer: 'db', route: 'crews' },
      })
    }
  }

  return true
}

export async function updateCrewMember(
  crewId: string,
  memberId: string,
  input: UpdateCrewMemberInput,
): Promise<CrewMember | null> {
  const updatePayload: Record<string, unknown> = {}
  if (input.role !== undefined) updatePayload.role = input.role
  if (input.role_description !== undefined) updatePayload.role_description = input.role_description
  if (input.is_coordinator !== undefined) updatePayload.is_coordinator = input.is_coordinator
  if (input.position_in_crew !== undefined) updatePayload.position_in_crew = input.position_in_crew

  if (Object.keys(updatePayload).length === 0) {
    const { data, error } = await supabase
      .from('crew_members')
      .select(CREW_MEMBER_SELECT)
      .eq('id', memberId)
      .eq('crew_id', crewId)
      .single()

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { fn: 'updateCrewMember.noop', crewId, memberId },
        tags: { layer: 'db', route: 'crews' },
      })
      return null
    }

    return data
  }

  const { data, error } = await supabase
    .from('crew_members')
    .update(updatePayload)
    .eq('id', memberId)
    .eq('crew_id', crewId)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'updateCrewMember', crewId, memberId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }

  if (input.is_coordinator !== undefined) {
    if (input.is_coordinator) {
      const { error: clearError } = await supabase
        .from('crew_members')
        .update({ is_coordinator: false })
        .eq('crew_id', crewId)
        .neq('id', memberId)

      if (clearError) {
        ErrorService.captureException(clearError, {
          severity: 'warning',
          context: { fn: 'updateCrewMember.clearExistingCoordinator', crewId, memberId },
          tags: { layer: 'db', route: 'crews' },
        })
      }

      const { error: leadError } = await supabase
        .from('crews')
        .update({ lead_member_id: memberId, updated_at: new Date().toISOString() })
        .eq('id', crewId)

      if (leadError) {
        ErrorService.captureException(leadError, {
          severity: 'warning',
          context: { fn: 'updateCrewMember.setLead', crewId, memberId },
          tags: { layer: 'db', route: 'crews' },
        })
      }

      return {
        ...data,
        is_coordinator: true,
      }
    }

    const { error: leadError } = await supabase
      .from('crews')
      .update({ lead_member_id: null, updated_at: new Date().toISOString() })
      .eq('id', crewId)
      .eq('lead_member_id', memberId)

    if (leadError) {
      ErrorService.captureException(leadError, {
        severity: 'warning',
        context: { fn: 'updateCrewMember.clearLead', crewId, memberId },
        tags: { layer: 'db', route: 'crews' },
      })
    }
  }

  return data
}

// ─── Edges ────────────────────────────────────────────────────────────

export async function replaceCrewEdges(
  crewId: string,
  edges: Array<{ source_member_id: string; target_member_id: string; direction?: string; label?: string }>,
): Promise<CrewEdge[]> {
  // Delete all existing edges
  await supabase.from('crew_edges').delete().eq('crew_id', crewId)

  if (edges.length === 0) return []

  const rows = edges.map((e) => ({
    crew_id: crewId,
    source_member_id: e.source_member_id,
    target_member_id: e.target_member_id,
    direction: e.direction ?? 'bidirectional',
    label: e.label ?? null,
  }))

  const { data, error } = await supabase
    .from('crew_edges')
    .insert(rows)
    .select()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'replaceCrewEdges', crewId },
      tags: { layer: 'db', route: 'crews' },
    })
    return []
  }
  return data ?? []
}

// ─── Runs ─────────────────────────────────────────────────────────────

export async function startCrewRun(
  crewId: string,
  orgId: string,
  triggerType: string = 'manual',
  triggeredBy?: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('start_crew_run', {
    p_crew_id: crewId,
    p_org_id: orgId,
    p_trigger_type: triggerType,
    p_triggered_by: triggeredBy ?? null,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'startCrewRun', crewId, orgId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }
  return data as string
}

export async function markCrewRunRunning(runId: string): Promise<boolean> {
  // Verify the row was actually transitioned. Without `.select().maybeSingle()`
  // a no-op update (row already moved past `starting` by a concurrent writer
  // or reconciler) would silently return success and the API route would
  // respond 201 for a run that is not actually running.
  const { data, error } = await supabase
    .from('crew_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'starting')
    .select('id')
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'markCrewRunRunning', runId },
      tags: { layer: 'db', route: 'crews' },
    })
    return false
  }

  return data !== null
}

export async function getCrewRuns(crewId: string): Promise<CrewRun[]> {
  const { data, error } = await supabase
    .from('crew_runs')
    .select(CREW_RUN_SELECT)
    .eq('crew_id', crewId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getCrewRuns', crewId },
      tags: { layer: 'db', route: 'crews' },
    })
    return []
  }
  return data ?? []
}

export async function getCrewRunDetail(
  runId: string,
): Promise<{ run: CrewRun; members: CrewRunMember[] } | null> {
  const [runResult, membersResult] = await Promise.all([
    supabase.from('crew_runs').select(CREW_RUN_SELECT).eq('id', runId).single(),
    supabase
      .from('crew_run_members')
      .select(CREW_RUN_MEMBER_SELECT)
      .eq('crew_run_id', runId)
      .order('started_at', { ascending: true }),
  ])

  if (runResult.error) {
    ErrorService.captureException(runResult.error, {
      severity: 'error',
      context: { fn: 'getCrewRunDetail', runId },
      tags: { layer: 'db', route: 'crews' },
    })
    return null
  }
  return {
    run: runResult.data,
    members: membersResult.data ?? [],
  }
}

export async function completeCrewRun(
  runId: string,
  status: 'completed' | 'failed' | 'cancelled',
  summary?: string,
  errorMessage?: string,
): Promise<boolean> {
  // Rollup cost from members
  const { data: costData } = await supabase
    .from('crew_run_members')
    .select('cost_usd')
    .eq('crew_run_id', runId)

  const totalCost = costData?.reduce((sum, m) => sum + Number(m.cost_usd || 0), 0) ?? 0

  const { error } = await supabase
    .from('crew_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      outcome_summary: summary ?? null,
      error_message: errorMessage ?? null,
      total_cost_usd: totalCost,
    })
    .eq('id', runId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'completeCrewRun', runId, status },
      tags: { layer: 'db', route: 'crews' },
    })
    return false
  }
  return true
}

// ─── Cost Rollup ──────────────────────────────────────────────────────

export async function getCrewCostRollup(
  crewId: string,
  orgId: string,
): Promise<{ total_cost_usd: number; run_count: number }> {
  const { data, error } = await supabase
    .from('crew_runs')
    .select('total_cost_usd')
    .eq('crew_id', crewId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getCrewCostRollup', crewId, orgId },
      tags: { layer: 'db', route: 'crews' },
    })
    return { total_cost_usd: 0, run_count: 0 }
  }

  const runs = data ?? []
  return {
    total_cost_usd: runs.reduce((sum, r) => sum + Number(r.total_cost_usd || 0), 0),
    run_count: runs.length,
  }
}
