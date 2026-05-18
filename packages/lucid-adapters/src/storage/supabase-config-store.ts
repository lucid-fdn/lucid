/**
 * Supabase Config Store — loads assistant configuration from Supabase
 * (system prompt, model, temperature, enabled features, etc.)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AssistantConfig {
  id: string
  name: string
  system_prompt: string
  lucid_model: string
  temperature: number
  max_tokens: number
  memory_enabled: boolean
  memory_window_size: number
  org_id: string | null
  policy_config: Record<string, unknown> | null
  features: Record<string, boolean>
  metadata: Record<string, unknown>
  updated_at: string
}

export class SupabaseConfigStore {
  constructor(private supabase: SupabaseClient) {}

  /** Load assistant configuration */
  async getAssistant(assistantId: string): Promise<AssistantConfig | null> {
    const { data, error } = await this.supabase
      .from('assistants')
      .select('id, name, system_prompt, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, policy_config, features, metadata, updated_at')
      .eq('id', assistantId)
      .maybeSingle()

    if (error) throw new Error(`Failed to load assistant config: ${error.message}`)
    return data as AssistantConfig | null
  }

  /** Load channel credentials for an assistant */
  async getChannelCredentials(assistantId: string, channelType: string): Promise<Record<string, string> | null> {
    const { data, error } = await this.supabase
      .from('assistant_channels')
      .select('credentials_encrypted, config')
      .eq('assistant_id', assistantId)
      .eq('channel_type', channelType)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw new Error(`Failed to load channel credentials: ${error.message}`)
    return data?.config ?? null
  }
}
