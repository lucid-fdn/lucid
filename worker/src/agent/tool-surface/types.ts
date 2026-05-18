/**
 * ToolSurface — the output of buildToolSurface().
 * Everything the runtime needs to configure an agent run's tool set.
 */

export interface ClientToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type ToolOwner = 'lucid' | 'openclaw'
export type DangerLevel = 'safe' | 'elevated' | 'dangerous'
export type ToolSelectionProvider = 'openai' | 'anthropic' | 'google' | 'unknown'
export type ToolSelectionReason = 'within_budget' | 'provider_budget' | 'unknown_provider'

export interface ToolMeta {
  owner: ToolOwner
  dangerLevel: DangerLevel
  ownerOnly?: boolean
  capability?: string
  progressLabel?: string
  progressPhase?: string
  riskLevel?: 'read' | 'low' | 'medium' | 'high'
}

export interface ToolSelectionContext {
  engine?: 'openclaw' | 'hermes'
  model?: string
  provider?: ToolSelectionProvider
  reservedToolSlots?: number
}

export interface ToolSelectionDecision {
  toolName: string
  included: boolean
  reason: ToolSelectionReason
}

export interface ToolSelectionSummary {
  engine?: 'openclaw' | 'hermes'
  model?: string
  provider: ToolSelectionProvider
  originalCount: number
  selectedCount: number
  maxClientTools?: number
  reservedToolSlots?: number
  decisions: ToolSelectionDecision[]
}

export interface ToolSurface {
  /** Lucid-owned tool schemas for the LLM (native tools come from OpenClaw separately) */
  clientTools: ClientToolDefinition[]
  /** Prompt-visible summary of the selected capability surface for this run */
  awarenessPrompt?: string
  /** Executes Lucid tool calls */
  executor: (toolName: string, params: Record<string, unknown>) => Promise<string>
  /** Lucid tool names for auditing */
  allowlist: Set<string>
  /** OpenClaw config — passed to runEmbeddedPiAgent as `tools` key */
  openclawToolPolicy: { tools: { deny: string[] } }
  /** Per-tool metadata for auditing/billing */
  toolMeta: Map<string, ToolMeta>
  /** Centralized capability-selection outcome for observability/debugging */
  selection?: ToolSelectionSummary
  /** Current tool call count (from executor) — used for billing/metering */
  getToolCallCount: () => number
}
