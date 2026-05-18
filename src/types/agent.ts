/**
 * Agent Types
 *
 * Canonical shared model for agent list/detail UI, project surfaces, and the
 * legacy marketplace-style agent catalog.
 */

export interface AgentAction {
  id: string
  label: string
  emoji?: string
  description?: string
}

export interface AgentUIConfig {
  placeholder: string
}

export interface AgentCatalog {
  id: string
  name: string
  description?: string | null
  image?: string
  ui?: AgentUIConfig
  actions?: AgentAction[]
  frequentQuestions?: string[]
}

export interface AgentChannel {
  id: string
  channel_type: string
  external_channel_id?: string | null
  is_active: boolean
  webhook_url?: string
  channel_config?: Record<string, unknown>
  inbound_routing_config?: Record<string, unknown>
  connection_mode?: 'byob' | 'hosted' | null
}

export interface AgentWallet {
  id: string
  chain_type: string
  address: string
  privy_wallet_id?: string
  status: string
  withdrawal_address: string | null
}

export interface Agent {
  id: string
  org_id: string
  project_id?: string
  projectSlug?: string | null
  name: string
  description?: string | null
  image?: string
  ui?: AgentUIConfig
  actions?: AgentAction[]
  frequentQuestions?: string[]
  featured?: boolean
  tier?: string
  system_prompt: string
  lucid_model: string
  temperature: number
  max_tokens: number
  memory_enabled: boolean
  memory_strategy?: 'auto' | 'aggressive' | 'conservative' | 'off'
  memory_window_size: number
  passport_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  wallet_enabled?: boolean
  telegram_share_enabled?: boolean
  telegram_display_name?: string | null
  telegram_role_title?: string | null
  telegram_essence?: string | null
  telegram_starter_prompts?: string[]
  telegram_voice_mode?: 'off' | 'auto' | 'always'
  telegram_voice_id?: string | null
  telegram_voice_instructions?: string | null
  discord_share_enabled?: boolean
  slack_share_enabled?: boolean
  mc_status?: 'active' | 'paused' | 'idle' | null
  runtime_id?: string | null
  runtime_flavor?: 'shared' | 'c1_managed' | 'c2a_autonomous' | null
  engine?: string | null
  policy_config?: Record<string, unknown> | null
  crew_id?: string | null
  assistant_channels: AgentChannel[]
  agent_wallets?: AgentWallet[]
}
