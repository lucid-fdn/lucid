/**
 * Crew context injection for multi-agent orchestration.
 *
 * Loads crew membership + topology for an assistant and formats it
 * for injection into the agent's system prompt. Also provides a
 * topology enforcement check for messaging.
 *
 * v1b: context injection + messaging enrichment only.
 * v1c: adds crew_complete tool + run lifecycle.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ─────────────────────────────────────────────────

export interface CrewContextMember {
  memberId: string
  assistantId: string
  name: string
  role: string
}

export interface CrewContext {
  crewId: string
  crewName: string
  objective: string
  myMemberId: string
  myRole: string
  myRoleDescription: string | null
  isCoordinator: boolean
  topologyEnforced: boolean
  members: CrewContextMember[]
  /** IDs of assistants this member can message (topology-aware). Null = all allowed. */
  allowedTargetAssistantIds: string[] | null
}

// ─── Lookup ────────────────────────────────────────────────

/**
 * Load active crew context for an assistant.
 * Returns null if the assistant is not in any active (non-deleted) crew.
 *
 * Performance: 1 query to find membership + crew, then 1-2 parallel queries
 * for members + edges (edges only if topology_enforced).
 */
export async function getActiveCrewContext(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<CrewContext | null> {
  // 1. Find the crew membership for this assistant (non-deleted crew only)
  const { data: membership, error: memberError } = await supabase
    .from('crew_members')
    .select(`
      id,
      crew_id,
      role,
      role_description,
      is_coordinator,
      crews!inner (
        id,
        name,
        objective,
        status,
        topology_enforced,
        deleted_at
      )
    `)
    .eq('assistant_id', assistantId)
    .is('crews.deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (memberError || !membership) return null

  const crew = (membership as any).crews
  if (!crew || crew.status === 'archived') return null

  const crewId = crew.id as string
  const myMemberId = membership.id as string
  const topologyEnforced = crew.topology_enforced as boolean

  // 2. Load members + edges in parallel (edges only when topology enforced)
  const membersPromise = supabase
    .from('crew_members')
    .select(`
      id,
      assistant_id,
      role,
      ai_assistants!inner ( name )
    `)
    .eq('crew_id', crewId)
    .order('join_order', { ascending: true })

  const edgesPromise = topologyEnforced
    ? supabase
        .from('crew_edges')
        .select('source_member_id, target_member_id, direction')
        .eq('crew_id', crewId)
    : Promise.resolve({ data: null })

  const [membersResult, edgesResult] = await Promise.all([membersPromise, edgesPromise])

  const members: CrewContextMember[] = (membersResult.data || []).map((m: any) => ({
    memberId: m.id as string,
    assistantId: m.assistant_id as string,
    name: (m.ai_assistants?.name || 'Unknown') as string,
    role: m.role as string,
  }))

  // 3. Resolve allowed targets from edges (in-memory, no extra query)
  let allowedTargetAssistantIds: string[] | null = null

  if (topologyEnforced && edgesResult.data) {
    const allowedMemberIds = new Set<string>()

    for (const edge of edgesResult.data) {
      if (edge.source_member_id === myMemberId) {
        allowedMemberIds.add(edge.target_member_id)
      }
      if (edge.target_member_id === myMemberId && edge.direction === 'bidirectional') {
        allowedMemberIds.add(edge.source_member_id)
      }
    }

    allowedTargetAssistantIds = members
      .filter(m => allowedMemberIds.has(m.memberId))
      .map(m => m.assistantId)
  }

  return {
    crewId,
    crewName: crew.name as string,
    objective: crew.objective as string,
    myMemberId,
    myRole: membership.role as string,
    myRoleDescription: membership.role_description as string | null,
    isCoordinator: membership.is_coordinator as boolean,
    topologyEnforced,
    members,
    allowedTargetAssistantIds,
  }
}

// ─── System Prompt Rendering ───────────────────────────────

const MAX_DISPLAY_MEMBERS = 15

/**
 * Render crew context into a system prompt section.
 * Budget: ~500 chars (small crew) to ~1500 chars (15 members).
 */
export function renderCrewContextPrompt(ctx: CrewContext): string {
  const lines: string[] = []

  lines.push(`## Crew: ${ctx.crewName}`)
  lines.push(`**Objective:** ${ctx.objective}`)
  lines.push(`**Your role:** ${ctx.myRole}`)
  if (ctx.myRoleDescription) {
    lines.push(`**Role details:** ${ctx.myRoleDescription}`)
  }

  if (ctx.isCoordinator) {
    lines.push('')
    lines.push('You are the **coordinator** of this crew. Delegate tasks to members via sessions_send. Track progress and synthesize results.')
  }

  // Member list (one line each, capped)
  const myAssistantId = ctx.members.find(m => m.memberId === ctx.myMemberId)?.assistantId
  lines.push('')
  lines.push('**Crew members:**')
  const displayMembers = ctx.members.slice(0, MAX_DISPLAY_MEMBERS)
  for (const m of displayMembers) {
    const tag = m.assistantId === myAssistantId ? ' (you)' : ''
    lines.push(`- ${m.name}: ${m.role}${tag}`)
  }

  // Allowed targets (only if topology enforced)
  if (ctx.topologyEnforced && ctx.allowedTargetAssistantIds) {
    const allowedNames = ctx.members
      .filter(m => ctx.allowedTargetAssistantIds!.includes(m.assistantId))
      .map(m => m.name)
    lines.push('')
    lines.push(`**You can message:** ${allowedNames.join(', ')}`)
    lines.push('Messages to other crew members are blocked by the crew topology.')
  }

  return '\n\n' + lines.join('\n')
}

// ─── Topology Enforcement ──────────────────────────────────

/**
 * Check if two assistants in the same crew can communicate.
 * Returns { allowed: true } or { allowed: false, reason, allowedTargets }.
 *
 * Uses the can_crew_members_communicate RPC. Falls open on DB errors
 * (never blocks communication due to infra issues).
 */
export async function canCrewMembersCommunicate(
  supabase: SupabaseClient,
  sourceCrewContext: CrewContext,
  targetAssistantId: string,
): Promise<{ allowed: boolean; reason?: string; allowedTargets?: string[] }> {
  // If target is not in the same crew, topology doesn't apply — allow
  const targetInCrew = sourceCrewContext.members.some(m => m.assistantId === targetAssistantId)
  if (!targetInCrew) return { allowed: true }

  const { data, error } = await supabase.rpc('can_crew_members_communicate', {
    p_crew_id: sourceCrewContext.crewId,
    p_source_assistant_id: sourceCrewContext.members.find(m => m.memberId === sourceCrewContext.myMemberId)!.assistantId,
    p_target_assistant_id: targetAssistantId,
  })

  if (error) {
    // Fail open — don't block communication on DB errors
    console.warn(`[crew] Topology check failed, allowing: ${error.message}`)
    return { allowed: true }
  }

  if (data === true) return { allowed: true }

  // Blocked — resolve allowed target names from already-loaded context (no extra queries)
  const allowedNames = sourceCrewContext.allowedTargetAssistantIds
    ? sourceCrewContext.members
        .filter(m => sourceCrewContext.allowedTargetAssistantIds!.includes(m.assistantId))
        .map(m => m.name)
    : []

  return {
    allowed: false,
    reason: 'Crew topology does not allow communication between these members.',
    allowedTargets: allowedNames,
  }
}

// ─── crew_complete Tool ───────────────────────────────────

export interface CrewCompleteContext {
  supabase: SupabaseClient
  assistantId: string
  orgId: string
  crewContext: CrewContext | null | undefined
}

/**
 * Handle the crew_complete tool call.
 * Only the coordinator of an active crew run can call this.
 */
export async function toolCrewComplete(
  params: { outcome_summary: string; status?: 'completed' | 'failed' },
  ctx: CrewCompleteContext,
): Promise<string> {
  // 1. Validate caller is a crew coordinator
  if (!ctx.crewContext) {
    return JSON.stringify({ error: 'You are not a member of any crew. crew_complete is only available to crew coordinators.' })
  }
  if (!ctx.crewContext.isCoordinator) {
    return JSON.stringify({ error: 'Only the crew coordinator can call crew_complete.' })
  }

  const finalStatus = params.status || 'completed'

  // 2. Find the active crew run
  const { data: activeRun, error: runError } = await ctx.supabase
    .from('crew_runs')
    .select('id')
    .eq('crew_id', ctx.crewContext.crewId)
    .in('status', ['starting', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runError || !activeRun) {
    return JSON.stringify({ error: 'No active crew run found. The run may have already been completed or timed out.' })
  }

  // 3. Complete the run (cost rollup + status update)
  const { data: costData } = await ctx.supabase
    .from('crew_run_members')
    .select('cost_usd')
    .eq('crew_run_id', activeRun.id)

  const totalCost = costData?.reduce((sum: number, m: { cost_usd: number }) => sum + Number(m.cost_usd || 0), 0) ?? 0

  const { error: updateError } = await ctx.supabase
    .from('crew_runs')
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      outcome_summary: params.outcome_summary,
      error_message: finalStatus === 'failed' ? params.outcome_summary : null,
      total_cost_usd: totalCost,
    })
    .eq('id', activeRun.id)

  if (updateError) {
    return JSON.stringify({ error: `Failed to complete crew run: ${updateError.message}` })
  }

  // 4. Emit feed event (fire-and-forget)
  const eventType = finalStatus === 'completed' ? 'crew_run_completed' : 'crew_run_failed'
  ctx.supabase
    .from('mc_agent_events')
    .insert({
      agent_id: ctx.assistantId,
      org_id: ctx.orgId,
      event_type: eventType,
      payload: {
        crew_id: ctx.crewContext.crewId,
        crew_name: ctx.crewContext.crewName,
        crew_run_id: activeRun.id,
        outcome_summary: params.outcome_summary,
        total_cost_usd: totalCost,
      },
    })
    .then(({ error }) => {
      if (error) console.warn(`[crew] Failed to emit ${eventType}:`, error.message)
    })

  return JSON.stringify({
    success: true,
    crew_run_id: activeRun.id,
    status: finalStatus,
    total_cost_usd: totalCost,
  })
}
