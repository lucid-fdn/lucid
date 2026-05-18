import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnrichedToolDefinition } from '@lucid-fdn/agent-tools-core'
import type { ToolSurface, ClientToolDefinition, ToolMeta, ToolSelectionContext } from './types.js'
import type { AssistantConfig } from '../types.js'
import type { ActivatedPlugin } from '../plugin-types.js'
import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import { toWireToolName } from '../plugin-types.js'
import { CommandsAllowlist } from '../CommandsAllowlist.js'
import type { BuiltInToolExecutorParams } from '../BuiltInToolExecutor.js'
import type { SubagentContext } from '../runtime-tools/subagent.js'
import { buildOpenClawToolPolicy, isDedicatedRuntime } from './native-deny.js'
import { resolveEffectiveNativeTools } from './native-catalog.js'
import { assertNoCollisions, assertUniqueClientToolNames } from './collision-guard.js'
import { createUnifiedExecutor } from './executor.js'
import { REVERSE_TOOL_NAME_MAP, RUNTIME_TOOL_STABLE_NAMES } from './compat-names.js'
import { selectClientTools } from './selector.js'
import { buildToolAwarenessPrompt } from './awareness.js'
import type { PluginToolContext } from '../PluginBridge.js'
import type { RunTurnInput, RunTurnOutput } from '../runtime/types.js'
import { buildNangoBinding } from '../oauth-tools/types.js'
import type { ToolExecutionEvent } from '../tool-runtime/types.js'
import { resolveToolProgressMetadata } from '../../core/progress/tool-capabilities.js'

export interface BuildToolSurfaceInput {
  assistant: AssistantConfig
  plugins: ActivatedPlugin[]
  supabase?: SupabaseClient
  userId?: string
  runId: string
  conversationId: string
  channelId?: string
  subagentDepth: number
  sessionFile: string
  workspaceDir: string
  systemPrompt?: string
  abortSignal?: AbortSignal
  streamOutput?: AIStreamOutput
  onToolEvent?: (event: ToolExecutionEvent) => void
  selection?: ToolSelectionContext
  /** Injected runtime for subagent spawning (v2 path) */
  runTurn?: (input: RunTurnInput) => Promise<RunTurnOutput>
}

export async function buildToolSurface(input: BuildToolSurfaceInput): Promise<ToolSurface> {
  const isProd = process.env.NODE_ENV === 'production'

  // 1. Build OpenClaw deny policy (returns { tools: { deny: [...] } })
  const openclawToolPolicy = buildOpenClawToolPolicy()

  // 2. Compute effective native tools (post-deny) for collision guard
  const effectiveNative = resolveEffectiveNativeTools(openclawToolPolicy.tools.deny)

  // 3. Get built-in clientTools from CommandsAllowlist
  // During transition, BUILT_IN_TOOLS contains both old and new names.
  // Filter out old names (keys of REVERSE_TOOL_NAME_MAP are the new names —
  // values are the old names we want to exclude).
  const oldNamesToExclude = new Set(Object.values(REVERSE_TOOL_NAME_MAP))

  // On dedicated runtimes, also exclude Lucid's runtime tools (cron_schedule,
  // cron_list, cron_cancel, sessions_send, sessions_spawn). OpenClaw's native
  // versions handle cron/messaging/subagent — ours were only needed for shared
  // multi-tenant. Keeps crew_complete (no native equivalent).
  const dedicatedExclude = isDedicatedRuntime() ? RUNTIME_TOOL_STABLE_NAMES : null

  const allowlist = new CommandsAllowlist(input.assistant.policy_config)
  if (input.assistant.wallet_enabled) {
    allowlist.stripWalletAddressParams()
  }
  const allowedBuiltIns = allowlist.getAllowedTools()
    .filter(def => !oldNamesToExclude.has(def.name))
    .filter(def => !dedicatedExclude?.has(def.name))
  const builtInDefs = allowedBuiltIns
    .map(def => ({
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        ...(def.parameters ? { parameters: def.parameters } : {}),
      },
    }))

  // 4. Get plugin clientTools
  const pluginDefs: ClientToolDefinition[] = []
  const pluginCtxMap = new Map<string, PluginToolContext>()
  // Build supabase RPC function for Nango integrations (usage tracking)
  const supabaseRpcFn = input.supabase
    ? (name: string, params: Record<string, unknown>) => input.supabase!.rpc(name, params)
    : undefined

  if (input.plugins?.length) {
    for (const p of input.plugins) {
      // Nango integrations without an active connection can't execute —
      // skip adding their tools to avoid broken tool calls.
      if (p.transport === 'nango' && !p.connectionId) {
        console.warn(`[buildToolSurface] Skipping ${p.slug}: no active OAuth connection`)
        continue
      }

      for (const t of p.tools) {
        const wireName = toWireToolName(p.slug, t.name)
        pluginDefs.push({
          type: 'function',
          function: { name: wireName, description: t.description, parameters: t.parameters },
        })

        // Base context for all plugin types
        const ctx: PluginToolContext = {
          pluginSlug: p.slug,
          config: p.config || {},
          trustLevel: p.trustLevel,
          executionMode: p.executionMode,
          transport: p.transport,
          authType: p.authType,
          authProvider: p.authProvider,
          connectionId: p.connectionId,
          mcpgateServerId: p.mcpgateServerId,
          endpointUrl: p.endpointUrl,
          fallbackMode: p.fallbackMode,
          source: p.source,
        }

        // Nango integrations: populate binding context for nango-action-bridge
        if (p.transport === 'nango' && p.connectionId) {
          ctx.nangoBinding = buildNangoBinding({
            assistantId: input.assistant.id,
            pluginSlug: p.slug,
            connectionId: p.connectionId,
            authProvider: p.authProvider,
            config: p.nangoPolicy || (p.config as Record<string, unknown>),
          })
          ctx.nangoRunId = input.runId
          ctx.nangoAssistantId = input.assistant.id
          ctx.nangoRpcFn = supabaseRpcFn
        }

        pluginCtxMap.set(wireName, ctx)
      }
    }
  }

  // 5. Merge and validate
  assertUniqueClientToolNames(builtInDefs, 'builtin')
  assertUniqueClientToolNames(pluginDefs, 'plugin')
  const merged = [...builtInDefs, ...pluginDefs]
  assertUniqueClientToolNames(merged, 'merged')

  // 6. Collision guard (soft-fail in prod)
  const safeClientTools = assertNoCollisions(effectiveNative, merged, { softFail: isProd })
  const selected = selectClientTools(
    safeClientTools,
    {
      ...input.selection,
      reservedToolSlots:
        input.selection?.engine === 'openclaw'
          ? effectiveNative.size
          : input.selection?.reservedToolSlots,
    },
    { prioritizedToolNames: new Set(builtInDefs.map((tool) => tool.function.name)) },
  )
  const selectedClientToolNames = new Set(selected.clientTools.map((tool) => tool.function.name))
  const selectedBuiltInTools = allowedBuiltIns
    .filter((tool): tool is EnrichedToolDefinition => (
      selectedClientToolNames.has(tool.name)
    ) && Array.isArray((tool as EnrichedToolDefinition).when_to_use))
  const awarenessPrompt = buildToolAwarenessPrompt({
    selectedClientTools: selected.clientTools,
    selectedBuiltInTools,
    plugins: input.plugins,
    approvalRequiredTools: input.assistant.approval_required_tools,
    selection: selected.selection,
  })

  // 7. Build executor
  const config = {
    ...openclawToolPolicy,
    models: {
      providers: {
        openai: { baseUrl: '', api: 'openai-completions' as const, models: [] },
      },
    },
  }

  const subagentCtx: SubagentContext = {
    parentRunId: input.runId,
    depth: input.subagentDepth,
    childrenSpawned: 0,
    totalChildToolCalls: 0,
    sessionFile: input.sessionFile,
    workspaceDir: input.workspaceDir,
    provider: 'openai',
    model: input.assistant.lucid_model,
    config,
    temperature: input.assistant.temperature,
    maxOutputTokens: input.assistant.max_tokens,
    extraSystemPrompt: input.systemPrompt,
    abortSignal: input.abortSignal,
    agentDir: input.workspaceDir,
    clientTools: selected.clientTools.length > 0 ? selected.clientTools : undefined,
    clientToolExecutor: undefined, // set below after executor is created
    runTurn: input.runTurn,
    supabase: input.supabase,
    orgId: input.assistant.org_id ?? '',
    agentId: input.assistant.id,
  }

  const builtInParams: BuiltInToolExecutorParams | undefined =
    input.supabase && input.userId
      ? {
          supabase: input.supabase,
          userId: input.userId,
          assistant: input.assistant,
          runId: input.runId,
          conversationId: input.conversationId,
          channelId: input.channelId,
          subagentCtx,
        }
      : undefined

  const toolExec = createUnifiedExecutor(
    pluginCtxMap,
    builtInParams,
    input.streamOutput,
    input.onToolEvent,
  )

  // Wire executor back into subagent context
  subagentCtx.clientToolExecutor = selected.clientTools.length > 0 ? toolExec.executor : undefined

  // 8. Build toolMeta
  const toolMeta = new Map<string, ToolMeta>()
  const builtInByName = new Map(allowedBuiltIns.map((tool) => [tool.name, tool]))
  for (const t of builtInDefs) {
    const definition = builtInByName.get(t.function.name)
    const progress = {
      ...resolveToolProgressMetadata(t.function.name),
      ...(definition?.capability ? { capability: definition.capability } : {}),
      ...(definition?.progress_label ? { label: definition.progress_label } : {}),
      ...(definition?.progress_phase ? { phase: definition.progress_phase } : {}),
    }
    toolMeta.set(t.function.name, {
      owner: 'lucid',
      dangerLevel: 'safe',
      capability: progress.capability,
      progressLabel: progress.label,
      progressPhase: progress.phase,
      riskLevel: progress.riskLevel,
    })
  }
  for (const t of pluginDefs) {
    const progress = resolveToolProgressMetadata(t.function.name)
    toolMeta.set(t.function.name, {
      owner: 'lucid',
      dangerLevel: 'safe',
      capability: progress.capability,
      progressLabel: progress.label,
      progressPhase: progress.phase,
      riskLevel: progress.riskLevel,
    })
  }
  // Native tools that survived deny
  for (const name of effectiveNative) {
    const progress = resolveToolProgressMetadata(name)
    toolMeta.set(name, {
      owner: 'openclaw',
      dangerLevel: 'safe',
      capability: progress.capability,
      progressLabel: progress.label,
      progressPhase: progress.phase,
      riskLevel: progress.riskLevel,
    })
  }

  return {
    clientTools: selected.clientTools,
    awarenessPrompt: awarenessPrompt || undefined,
    executor: toolExec.executor,
    allowlist: new Set(selected.clientTools.map(t => t.function.name)),
    openclawToolPolicy,
    toolMeta,
    selection: selected.selection,
    getToolCallCount: () => toolExec.toolCallCount,
  }
}
