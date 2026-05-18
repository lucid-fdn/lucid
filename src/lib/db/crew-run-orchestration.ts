import 'server-only'

import { supabase, ErrorService } from './client'

interface CrewMemberInfo {
  name: string
  role: string
  assistantId: string
  isCoordinator: boolean
}

interface CrewRunStartParams {
  crewId: string
  crewName: string
  objective: string
  runId: string
  orgId: string
  coordinatorAssistantId: string
  members: CrewMemberInfo[]
}

/**
 * Send a synthetic inbound event to the coordinator to kick off a crew run.
 *
 * The message contains the crew objective + member roster so the coordinator
 * knows what to do and who to delegate to.
 */
export async function sendCrewRunStartEvent(params: CrewRunStartParams): Promise<void> {
  // Ensure coordinator has an agent channel
  const channelId = await ensureAgentChannel(params.coordinatorAssistantId)

  // Build the coordinator briefing message
  const memberList = params.members
    .map(m => `- ${m.name}: ${m.role}${m.isCoordinator ? ' (you — coordinator)' : ''}`)
    .join('\n')

  const briefing = [
    `[Crew Run Started — ${params.crewName}]`,
    '',
    `Objective: ${params.objective}`,
    '',
    'Crew members:',
    memberList,
    '',
    'You are the coordinator. Delegate tasks to crew members via send_message_to_agent.',
    'When the objective is complete, call crew_complete with a summary.',
  ].join('\n')

  // Insert synthetic inbound event
  const { error } = await supabase
    .from('assistant_inbound_events')
    .insert({
      channel_id: channelId,
      external_message_id: `crew-run:${params.runId}`,
      external_user_id: `crew:${params.crewId}`,
      external_chat_id: `crew:${params.crewId}`,
      message_text: briefing,
      message_data: {
        source: 'crew_run_start',
        crew_id: params.crewId,
        crew_name: params.crewName,
        crew_run_id: params.runId,
        objective: params.objective,
      },
      status: 'pending',
    })

  if (error) {
    throw new Error(`Failed to send crew run start event: ${error.message}`)
  }

  // Emit feed event (fire-and-forget)
  Promise.resolve(
    supabase
      .from('mc_agent_events')
      .insert({
        agent_id: params.coordinatorAssistantId,
        org_id: params.orgId,
        event_type: 'crew_run_started',
        payload: {
          crew_id: params.crewId,
          crew_name: params.crewName,
          crew_run_id: params.runId,
          objective: params.objective,
          member_count: params.members.length,
          trigger: 'manual',
        },
      }),
  )
    .then(({ error: feedError }) => {
      if (feedError) console.warn('[crew-orchestration] Failed to emit crew_run_started:', feedError.message)
    })
    .catch(() => {})
}

/**
 * Ensure the coordinator assistant has an agent channel.
 * Mirrors the pattern from worker/src/agent/runtime-tools/messaging.ts
 */
async function ensureAgentChannel(assistantId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('assistant_channels')
    .select('id')
    .eq('assistant_id', assistantId)
    .eq('channel_type', 'agent')
    .eq('is_active', true)
    .single()

  if (existing) return existing.id

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
    // Race condition: another call created it
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('assistant_channels')
        .select('id')
        .eq('assistant_id', assistantId)
        .eq('channel_type', 'agent')
        .eq('is_active', true)
        .single()
      if (retry) return retry.id
    }
    throw new Error(`Failed to create agent channel: ${error.message}`)
  }

  return created.id
}
