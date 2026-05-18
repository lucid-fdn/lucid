import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// POST /api/assistants/[id]/chat/reset
// Clears messages from the conversation (keeps conversation active)
export async function POST(
  req: NextRequest,
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

    const body = await req.json().catch(() => ({}))
    const conversationId = body.conversationId

    if (conversationId) {
      // Verify the conversation belongs to this user/assistant
      const { data: conv } = await supabase
        .from('assistant_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('assistant_id', assistantId)
        .eq('external_user_id', userId)
        .maybeSingle()

      if (conv) {
        // Delete messages from this conversation
        await supabase
          .from('assistant_messages')
          .delete()
          .eq('conversation_id', conversationId)
      }
    } else {
      // Delete messages from all web conversations for this user
      const { data: channels } = await supabase
        .from('assistant_channels')
        .select('id')
        .eq('assistant_id', assistantId)
        .eq('channel_type', 'web')

      if (channels && channels.length > 0) {
        const channelIds = channels.map((c) => c.id)
        const { data: convs } = await supabase
          .from('assistant_conversations')
          .select('id')
          .in('channel_id', channelIds)
          .eq('external_user_id', userId)
          .eq('is_active', true)

        if (convs && convs.length > 0) {
          const convIds = convs.map((c) => c.id)
          await supabase
            .from('assistant_messages')
            .delete()
            .in('conversation_id', convIds)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/chat/reset', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-chat-reset' },
    })
    return NextResponse.json({ error: 'Failed to reset conversation' }, { status: 500 })
  }
}
