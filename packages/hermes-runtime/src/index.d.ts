export interface HermesRuntimeConfig {
  command: string
  args: string[]
  workdir?: string
  bridgeMode: 'observe' | 'full'
  runtimeId: string
  runtimeKey: string
  controlPlaneUrl: string
  engineVersion: string
  runtimeVersion: string
  port: number
  timeoutMs: number
  workerTriggerSecret?: string
  model?: string
  toolsets: string[]
  trustGateHeaders?: Record<string, string>
  migration?: {
    source: 'openclaw'
    preset: 'full' | 'user-data'
    dryRun: boolean
    overwrite: boolean
    sourcePath?: string
    workspaceTarget?: string
    skillConflict?: 'skip' | 'overwrite' | 'rename'
  }
}

export interface HermesTokenUsage {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface HermesPromptRunOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface HermesPromptResult {
  responseText: string
  tokenUsage: HermesTokenUsage
}

export interface HermesPromptInput {
  assistantName?: string
  systemPrompt?: string | null
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  memoryInjection?: string[]
  boardMemories?: string[]
  conversationSummary?: string | null
  skillPrompt?: string
  toolPrompt?: string
  userMessage: string
}

export declare function resolveHermesRuntimeConfig(
  env?: NodeJS.ProcessEnv,
): HermesRuntimeConfig

export declare function parseHermesArgs(
  jsonValue?: string | undefined,
  plainValue?: string | undefined,
): string[]

export declare function buildPrompt(input: HermesPromptInput): string
export declare function buildRuntimeToolPrompt(packet: Pick<import('@lucid/agent-bridge').RunPacket, 'assistantConfig' | 'plugins'>): string
export declare function executeHermesNativeTool(
  config: HermesRuntimeConfig,
  packet: import('@lucid/agent-bridge').RunPacket,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<{ handled: boolean; result?: import('@lucid/agent-bridge').ToolExecutionResult }>

export declare function runHermesPrompt(
  config: HermesRuntimeConfig,
  prompt: string,
  options?: HermesPromptRunOptions,
): Promise<string>

export declare function runHermesPromptDetailed(
  config: HermesRuntimeConfig,
  prompt: string,
  options?: HermesPromptRunOptions,
): Promise<HermesPromptResult>

export declare function startHermesRuntime(
  env?: NodeJS.ProcessEnv,
): Promise<void>
