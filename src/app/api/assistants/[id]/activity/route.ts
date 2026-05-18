/**
 * Assistant Activity Feed API
 *
 * Returns recent assistant_messages formatted as FeedEvent objects.
 * Unlike the MC feed (which reads channel webhook events), this reads
 * from assistant_messages — so it includes test chat messages too.
 *
 * GET /api/assistants/[id]/activity?limit=50
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import type { FeedEvent } from '@/lib/mission-control/types'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '50'),
      100,
    )

    // Query recent messages using a two-step lookup instead of a relational
    // join filter on every refresh. This keeps the activity feed responsive on
    // assistants with long conversation history.
    const { data: conversations, error: conversationError } = await supabase
      .from('assistant_conversations')
      .select('id')
      .eq('assistant_id', assistantId)
      .order('updated_at', { ascending: false })
      .limit(25)

    if (conversationError) {
      ErrorService.captureException(conversationError, {
        severity: 'error',
        context: { endpoint: '/api/assistants/[id]/activity', assistantId, step: 'list-conversations' },
        tags: { layer: 'db', route: 'assistant-activity' },
      })
      return NextResponse.json({ events: [] })
    }

    const conversationIds = (conversations ?? []).map((conversation) => conversation.id)
    if (conversationIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    const { data: messages, error } = await supabase
      .from('assistant_messages')
      .select('id, role, content, tool_name, tool_input, tool_output, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { endpoint: '/api/assistants/[id]/activity', assistantId, step: 'list-messages' },
        tags: { layer: 'db', route: 'assistant-activity' },
      })
      return NextResponse.json({ events: [] })
    }

    // Transform messages → FeedEvent format
    // Only include tool calls, tool results, and errors — messages are noisy
    // and not useful for operational monitoring.
    const events: FeedEvent[] = (messages || []).reduce<FeedEvent[]>((acc, msg) => {
      const isToolCall = msg.role === 'assistant' && msg.tool_name
      const isToolResult = msg.role === 'tool'
      const isError = msg.role === 'assistant' && msg.content?.startsWith('Error')

      // Skip plain messages — only show tool calls, tool results, and errors
      if (!isToolCall && !isToolResult && !isError) return acc

      let event_type: FeedEvent['event_type']
      let severity: FeedEvent['severity'] = 'info'

      if (isToolCall) {
        event_type = 'tool_call'
      } else if (isToolResult) {
        event_type = 'tool_result'
      } else {
        event_type = 'error'
        severity = 'error'
      }

      const payload: Record<string, unknown> = {}

      if (isToolCall) {
        payload.tool_name = msg.tool_name
        payload.tool_input = msg.tool_input
      } else if (isToolResult) {
        payload.tool_name = msg.tool_name
        payload.tool_output = truncate(
          typeof msg.tool_output === 'string'
            ? msg.tool_output
            : JSON.stringify(msg.tool_output ?? ''),
          200,
        )
      } else if (isError) {
        payload.message_text = truncate(msg.content || '', 200)
      }

      acc.push({
        id: msg.id,
        event_type,
        severity,
        agent_id: assistantId,
        agent_name: assistant.name,
        org_id: assistant.org_id,
        run_id: null,
        payload,
        created_at: msg.created_at,
      })
      return acc
    }, [])

    // Reverse so oldest first (feed displays chronologically)
    events.reverse()

    return NextResponse.json({ events })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/activity' },
      tags: { layer: 'api', route: 'assistant-activity' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}
