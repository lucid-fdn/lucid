/**
 * Internal Admin API — Clear Chat History
 *
 * Deletes assistant messages and completed/failed inbound events.
 * Optionally scoped to a single assistant, or clears ALL (dev/admin use).
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

interface ClearChatRequest {
  assistantId?: string
}

async function handleClearChat(request: NextRequest) {
  try {
    // 1. Verify HMAC + replay protection
    const auth = await verifyInternalAuth(request)
    if (!auth.valid || !auth.body) {
      return NextResponse.json(
        { error: auth.error || 'Authentication failed' },
        { status: 401 }
      )
    }

    const body: ClearChatRequest = JSON.parse(auth.body)
    const { assistantId } = body

    const supabase = getSupabase()

    // 2. Delete messages (linked via conversation_id → assistant_conversations)
    let messagesDeleted = 0
    if (assistantId) {
      // First get conversation IDs for this assistant
      const { data: convos } = await supabase
        .from('assistant_conversations')
        .select('id')
        .eq('assistant_id', assistantId)

      const convoIds = convos?.map((c: { id: string }) => c.id) ?? []
      if (convoIds.length > 0) {
        const { count, error } = await supabase
          .from('assistant_messages')
          .delete({ count: 'exact' })
          .in('conversation_id', convoIds)

        if (error) throw error
        messagesDeleted = count ?? 0
      }

      // Also delete conversation summaries
      await supabase
        .from('assistant_conversation_summaries')
        .delete()
        .in('conversation_id', convoIds)
    } else {
      const { count, error } = await supabase
        .from('assistant_messages')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows

      if (error) throw error
      messagesDeleted = count ?? 0
    }

    // 3. Delete completed/failed inbound events (linked via channel_id → assistant_channels)
    let eventsDeleted = 0
    if (assistantId) {
      const { data: channels } = await supabase
        .from('assistant_channels')
        .select('id')
        .eq('assistant_id', assistantId)

      const channelIds = channels?.map((c: { id: string }) => c.id) ?? []
      if (channelIds.length > 0) {
        const { count, error } = await supabase
          .from('assistant_inbound_events')
          .delete({ count: 'exact' })
          .in('channel_id', channelIds)
          .in('status', ['completed', 'failed'])

        if (error) throw error
        eventsDeleted = count ?? 0
      }
    } else {
      const { count, error } = await supabase
        .from('assistant_inbound_events')
        .delete({ count: 'exact' })
        .in('status', ['completed', 'failed'])

      if (error) throw error
      eventsDeleted = count ?? 0
    }

    return NextResponse.json({
      deleted: {
        messages: messagesDeleted,
        events: eventsDeleted,
      },
    })
  } catch (error) {
    console.error('[clear-chat] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return handleClearChat(request)
}

export async function DELETE(request: NextRequest) {
  return handleClearChat(request)
}
