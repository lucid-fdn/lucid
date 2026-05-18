import type { SupabaseClient } from '@supabase/supabase-js'

export interface TeamRoutineTask {
  id: string
  org_id: string
  assistant_id: string
  team_id?: string | null
  target_id?: string | null
  name: string | null
  task_prompt: string
}

interface CrewMemberRow {
  assistant_id: string | null
  member_ref_id: string
  role: string
  is_coordinator: boolean
  ai_assistants?: { name?: string | null } | null
}

async function ensureAgentChannel(supabase: SupabaseClient, assistantId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('assistant_channels')
    .select('id')
    .eq('assistant_id', assistantId)
    .eq('channel_type', 'agent')
    .eq('is_active', true)
    .maybeSingle()

  if ((existing as { id?: string } | null)?.id) return (existing as { id: string }).id

  const { data: created, error } = await supabase
    .from('assistant_channels')
    .insert({
      assistant_id: assistantId,
      channel_type: 'agent',
      external_channel_id: `agent-internal:${assistantId}`,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('assistant_channels')
        .select('id')
        .eq('assistant_id', assistantId)
        .eq('channel_type', 'agent')
        .eq('is_active', true)
        .single()
      if ((retry as { id?: string } | null)?.id) return (retry as { id: string }).id
    }
    throw new Error(`Failed to create team coordinator channel: ${error.message}`)
  }

  return (created as { id: string }).id
}

export async function runTeamRoutine(task: TeamRoutineTask, supabase: SupabaseClient): Promise<{
  crewRunId: string
  coordinatorAssistantId: string
}> {
  const teamId = task.team_id ?? task.target_id
  if (!teamId) throw new Error('Team routine is missing team_id/target_id')

  const { data: crew, error: crewError } = await supabase
    .from('crews')
    .select('id, name, objective')
    .eq('id', teamId)
    .eq('org_id', task.org_id)
    .single()
  if (crewError || !crew) throw new Error(`Could not load team ${teamId}: ${crewError?.message ?? 'not found'}`)

  const { data: members, error: membersError } = await supabase
    .from('crew_members')
    .select('assistant_id, member_ref_id, role, is_coordinator, ai_assistants(name)')
    .eq('crew_id', teamId)
    .order('join_order', { ascending: true })
  if (membersError) throw new Error(`Could not load team members: ${membersError.message}`)

  const memberRows = (members ?? []) as CrewMemberRow[]
  const coordinator = memberRows.find((member) => member.is_coordinator && member.assistant_id)
  const coordinatorAssistantId = coordinator?.assistant_id ?? task.assistant_id
  if (!coordinatorAssistantId) throw new Error('Team routine requires a coordinator assistant')

  const { data: crewRunId, error: runError } = await supabase.rpc('start_crew_run', {
    p_crew_id: teamId,
    p_org_id: task.org_id,
    p_trigger_type: 'scheduled',
    p_triggered_by: `routine:${task.id}`,
  })
  if (runError || !crewRunId) throw new Error(`Failed to start team run: ${runError?.message ?? 'no run id'}`)

  const { error: markError } = await supabase
    .from('crew_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', crewRunId as string)
    .eq('status', 'starting')
  if (markError) throw new Error(`Failed to mark team run running: ${markError.message}`)

  const channelId = await ensureAgentChannel(supabase, coordinatorAssistantId)
  const memberList = memberRows
    .map((member) => {
      const name = member.ai_assistants?.name ?? member.assistant_id ?? member.member_ref_id
      return `- ${name}: ${member.role}${member.is_coordinator ? ' (coordinator)' : ''}`
    })
    .join('\n')

  const messageText = [
    `[Routine Team Run - ${(crew as { name?: string }).name ?? task.name ?? 'Team'}]`,
    '',
    `Routine: ${task.name ?? task.id}`,
    `Objective: ${(crew as { objective?: string }).objective ?? task.task_prompt}`,
    '',
    'Routine instruction:',
    task.task_prompt,
    '',
    'Team members:',
    memberList,
    '',
    'You are the coordinator. Delegate through team tools and call crew_complete when complete.',
  ].join('\n')

  const { error: inboundError } = await supabase
    .from('assistant_inbound_events')
    .insert({
      channel_id: channelId,
      external_message_id: `routine:${task.id}:crew-run:${crewRunId}`,
      external_user_id: `routine:${task.id}`,
      external_chat_id: `crew:${teamId}`,
      message_text: messageText,
      message_data: {
        source: 'routine_team_run',
        routine_id: task.id,
        crew_id: teamId,
        crew_run_id: crewRunId,
      },
      status: 'pending',
    })
  if (inboundError) throw new Error(`Failed to enqueue team run event: ${inboundError.message}`)

  return { crewRunId: crewRunId as string, coordinatorAssistantId }
}
