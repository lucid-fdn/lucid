/**
 * Supabase Session Store — implements OpenClaw's SessionStore interface
 * using Supabase's get_or_create_conversation RPC, with multi-tenant scoping.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantContext } from '../types'

export interface ConversationRow {
  id: string
  assistant_id: string
  channel_id: string | null
  external_user_id: string | null
  external_chat_id: string | null
  title: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export class SupabaseSessionStore {
  constructor(
    private supabase: SupabaseClient,
    private tenant?: TenantContext
  ) {}

  /** Get or create a conversation via RPC (matches worker's inbound.ts) */
  async getOrCreate(params: {
    assistantId: string
    channelId?: string
    externalUserId?: string
    externalChatId?: string
  }): Promise<ConversationRow> {
    const { data, error } = await this.supabase.rpc('get_or_create_conversation', {
      p_assistant_id: params.assistantId,
      p_channel_id: params.channelId ?? null,
      p_external_user_id: params.externalUserId ?? null,
      p_external_chat_id: params.externalChatId ?? null,
    })

    if (error || !data) {
      throw new Error(`Failed to get/create conversation: ${error?.message ?? 'no data'}`)
    }

    return data as ConversationRow
  }

  /** Get a conversation by ID */
  async getById(conversationId: string): Promise<ConversationRow | null> {
    const { data, error } = await this.supabase
      .from('assistant_conversations')
      .select('id, assistant_id, channel_id, external_user_id, external_chat_id, title, metadata, created_at, updated_at')
      .eq('id', conversationId)
      .maybeSingle()

    if (error) throw new Error(`Failed to get conversation: ${error.message}`)
    return data as ConversationRow | null
  }

  /** Delete a conversation (e.g., on /reset command) */
  async delete(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('assistant_conversations')
      .delete()
      .eq('id', conversationId)

    if (error) throw new Error(`Failed to delete conversation: ${error.message}`)
  }

  /** Set tenant context for scoped operations */
  setTenant(tenant: TenantContext): void {
    this.tenant = tenant
  }
}
