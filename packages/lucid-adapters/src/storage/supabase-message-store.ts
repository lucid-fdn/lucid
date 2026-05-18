/**
 * Supabase Message Store — implements OpenClaw's MessageStore interface
 * using Supabase instead of SQLite.
 *
 * Encryption-aware — transparently encrypts/decrypts content
 * based on tenant encryption mode.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessageRow } from '../types'
import type { EncryptionService, EncryptionMode } from '../crypto/encryption-service'

export class SupabaseMessageStore {
  private encryption?: EncryptionService

  constructor(private supabase: SupabaseClient) {}

  /** Attach encryption service. Without it, operates in plaintext mode. */
  setEncryption(service: EncryptionService): void {
    this.encryption = service
  }

  /** Store a message (encrypts content if tenant has APP_LAYER mode) */
  async add(params: {
    conversationId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    metadata?: Record<string, unknown>
    tokenCount?: number
    tenantId?: string
  }): Promise<MessageRow> {
    let insertData: Record<string, unknown> = {
      conversation_id: params.conversationId,
      role: params.role,
      metadata: params.metadata ?? {},
      token_count: params.tokenCount,
    }

    // Determine encryption mode
    const mode = params.tenantId && this.encryption
      ? await this.encryption.getMode(params.tenantId)
      : 'NONE' as EncryptionMode

    if (mode !== 'NONE' && this.encryption && params.tenantId) {
      // Encrypt content — AAD includes conversationId for binding
      const aad = `${params.tenantId}:${params.conversationId}`
      const encrypted = await this.encryption.encrypt(params.tenantId, params.content, aad)

      insertData = {
        ...insertData,
        content: null,                          // Invariant: NULL when encrypted
        content_encrypted: encrypted.ciphertext,
        content_iv: encrypted.iv,
        content_auth_tag: encrypted.authTag,
        encryption_mode: mode,
        key_id: encrypted.keyId,
      }
    } else {
      // Plaintext mode
      insertData = {
        ...insertData,
        content: params.content,
        encryption_mode: 'NONE',
      }
    }

    const { data, error } = await this.supabase
      .from('assistant_messages')
      .insert(insertData)
      .select('id, conversation_id, role, content, metadata, token_count, created_at, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id')
      .single()

    if (error) throw new Error(`Failed to store message: ${error.message}`)

    // Return with decrypted content for caller convenience
    const row = data as MessageRow & {
      content_encrypted?: string
      content_iv?: string
      content_auth_tag?: string
      encryption_mode?: string
      key_id?: string
    }

    if (!row.content && row.content_encrypted) {
      row.content = params.content // We just encrypted it, return original
    }

    return row as MessageRow
  }

  /** Get messages for a conversation (decrypts if encrypted) */
  async getByConversation(conversationId: string, limit = 100, tenantId?: string): Promise<MessageRow[]> {
    const { data, error } = await this.supabase
      .from('assistant_messages')
      .select('id, conversation_id, role, content, metadata, token_count, created_at, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw new Error(`Failed to get messages: ${error.message}`)
    if (!data) return []

    // Decrypt any encrypted messages
    return Promise.all(
      data.map(async (row: Record<string, unknown>) => {
        if (
          row.encryption_mode !== 'NONE' &&
          row.content_encrypted &&
          this.encryption &&
          tenantId
        ) {
          const aad = `${tenantId}:${conversationId}`
          try {
            const decrypted = await this.encryption.decrypt(tenantId, {
              ciphertext: row.content_encrypted as string,
              iv: row.content_iv as string,
              authTag: row.content_auth_tag as string,
              keyId: row.key_id as string,
            }, aad)
            return { ...row, content: decrypted } as unknown as MessageRow
          } catch (err) {
            console.error(`[MessageStore] Decryption failed for message ${row.id}:`, err)
            return { ...row, content: '[encrypted — decryption failed]' } as unknown as MessageRow
          }
        }
        return row as unknown as MessageRow
      })
    )
  }

  /** @deprecated Use getByConversation instead */
  async getBySession(sessionId: string, limit = 100, tenantId?: string): Promise<MessageRow[]> {
    return this.getByConversation(sessionId, limit, tenantId)
  }

  /** Delete all messages for a conversation (e.g., on /reset) */
  async deleteByConversation(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('assistant_messages')
      .delete()
      .eq('conversation_id', conversationId)

    if (error) throw new Error(`Failed to delete messages: ${error.message}`)
  }

  /** Count tokens used in a conversation */
  async getTokenCount(conversationId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('assistant_messages')
      .select('token_count')
      .eq('conversation_id', conversationId)

    if (error) throw new Error(`Failed to count tokens: ${error.message}`)
    return (data ?? []).reduce((sum, row) => sum + (row.token_count ?? 0), 0)
  }
}
