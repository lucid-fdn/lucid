import os from 'os'
import path from 'path'
import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import type { AssistantConfig } from '../agent/types.js'
import { buildAgentCapabilitySurface } from '../agent/contracts/capability-surface.js'
import { mapRpcRowToActivatedPlugin } from '../agent/plugin-types.js'
import { withDbSpan } from '../observability/tracing.js'
import type { ToolSelectionProvider } from '../agent/tool-surface/types.js'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'

interface CapabilitySurfaceInspectionRequest {
  assistantId: string
  userMessage?: string
  conversationId?: string
  channelId?: string
  userId?: string
  engine?: 'openclaw' | 'hermes'
  runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous'
  channelOwnership?: 'lucid_relay' | 'runtime_native'
  model?: string
}

function inferProviderFromModel(model: string | null | undefined): ToolSelectionProvider | undefined {
  if (!model) return undefined
  const slash = model.indexOf('/')
  if (slash <= 0) return undefined
  const provider = model.slice(0, slash)
  if (provider === 'openai' || provider === 'anthropic' || provider === 'google') {
    return provider
  }
  return 'unknown'
}

async function loadAssistant(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<AssistantConfig | null> {
  let { data, error } = await supabase
    .from('ai_assistants')
    .select('id, name, engine, runtime_flavor, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, passport_id, policy_config, wallet_enabled, approval_required_tools, agent_wallets(chain_type, privy_wallet_id, address, status)')
    .eq('id', assistantId)
    .single()

  if (error) {
    const fallback = await supabase
      .from('ai_assistants')
      .select('id, name, engine, runtime_flavor, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, passport_id, policy_config, approval_required_tools')
      .eq('id', assistantId)
      .single()

    if (fallback.error || !fallback.data) {
      return null
    }

    data = { ...fallback.data, wallet_enabled: false, agent_wallets: [] } as typeof data
  }

  return (data as AssistantConfig | null) ?? null
}

export function createCapabilitySurfaceInspectionHandler(
  supabase: SupabaseClient,
  _config: Config,
) {
  return async (req: Request, res: Response) => {
    const {
      assistantId,
      userMessage = '',
      conversationId,
      channelId,
      userId,
      engine: requestedEngineOverride,
      runtimeFlavor: requestedRuntimeFlavorOverride,
      channelOwnership: requestedChannelOwnershipOverride,
      model: requestedModelOverride,
    } = req.body as unknown as CapabilitySurfaceInspectionRequest

    if (!assistantId) {
      return res.status(400).json({ error: 'assistantId is required' })
    }

    const assistant = await loadAssistant(supabase, assistantId)
    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' })
    }

    const engine = assistant.engine ?? 'openclaw'
    const runtimeFlavor = assistant.runtime_flavor ?? 'shared'
    const channelOwnership = 'lucid_relay'

    const { data: pluginRows, error: pluginError } = await withDbSpan('get_assistant_active_plugins', () =>
      supabase.rpc('get_assistant_active_plugins', { p_assistant_id: assistantId }),
    )

    if (pluginError) {
      return res.status(500).json({ error: 'Failed to load assistant plugins' })
    }

    const plugins = (pluginRows || []).map((row: Record<string, unknown>) => mapRpcRowToActivatedPlugin(row))
    const runId = `inspect-${crypto.randomUUID()}`
    const sessionFile = path.join(os.tmpdir(), `${runId}.json`)
    const workspaceDir = process.cwd()
    const requestedEngine = requestedEngineOverride ?? engine
    const requestedRuntimeFlavor = requestedRuntimeFlavorOverride ?? runtimeFlavor
    const requestedChannelOwnership = requestedChannelOwnershipOverride ?? channelOwnership
    const requestedModel = requestedModelOverride ?? assistant.lucid_model

    if (!supportsRuntimeFlavor(requestedEngine, requestedRuntimeFlavor)) {
      return res.status(400).json({
        error: `${requestedEngine} does not support ${requestedRuntimeFlavor}`,
      })
    }

    if (!supportsRuntimeConfiguration(requestedEngine, requestedRuntimeFlavor, requestedChannelOwnership)) {
      return res.status(400).json({
        error: `${requestedEngine} does not support ${requestedChannelOwnership} for ${requestedRuntimeFlavor}`,
      })
    }

    const capabilitySurface = await buildAgentCapabilitySurface({
      engine: requestedEngine,
      runtimeFlavor: requestedRuntimeFlavor,
      channelOwnership: requestedChannelOwnership,
      assistant: {
        ...assistant,
        engine: requestedEngine,
        runtime_flavor: requestedRuntimeFlavor,
        lucid_model: requestedModel,
      },
      plugins,
      supabase,
      userId,
      runId,
      conversationId: conversationId ?? `inspect:${assistantId}`,
      channelId,
      userMessage,
      subagentDepth: 0,
      sessionFile,
      workspaceDir,
      selection: {
        engine: requestedEngine,
        model: requestedModel,
        provider: inferProviderFromModel(requestedModel),
      },
    })

    return res.json({
      effectiveConfig: {
        engine: requestedEngine,
        runtimeFlavor: requestedRuntimeFlavor,
        channelOwnership: requestedChannelOwnership,
        model: requestedModel,
        provider: inferProviderFromModel(requestedModel),
      },
      capabilitySurface: capabilitySurface.introspection,
    })
  }
}
