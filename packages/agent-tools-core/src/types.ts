/** Loose JSON Schema representation (zero-dependency, no ajv) */
export type JSONSchema = Record<string, unknown>

/** Tool danger level */
export type DangerLevel = 'safe' | 'elevated' | 'dangerous'

/** Tool category for rendering order */
export type Category = 'read' | 'reason' | 'act' | 'runtime' | 'internal' | string

/**
 * Core tool definition. The contract everyone builds against.
 *
 * Generic T allows type-safe examples:
 *   defineTool<{ chain: string }>({ examples: [{ user: '...', tool_call: { chain: 'solana' } }] })
 */
export interface ToolDefinition<T = unknown> {
  name: string
  description: string
  category: Category
  dangerLevel?: DangerLevel
  parameters?: JSONSchema

  /** Trigger phrases — when the LLM should consider this tool */
  when_to_use?: string[]
  /** Example user queries with expected tool_call params */
  examples?: { user: string; tool_call: T }[]
  /** Soft hints — related tools often used together. NOT hard constraints. */
  related_tools?: string[]
  /** Whether elevated tools need explicit user confirmation */
  requires_confirmation?: boolean
  /** Stable product capability key used for status, billing, and policy metadata */
  capability?: string
  /** Human status label shown while this tool runs */
  progress_label?: string
  /** Progress phase for channel-native status surfaces */
  progress_phase?: 'thinking' | 'memory' | 'fetching' | 'browser' | 'tool_running' | 'approval_waiting' | 'writing'
}

/**
 * Enrichment metadata overlay.
 * Kept as a separate interface for incremental adoption —
 * existing tools can add enrichment fields one at a time.
 */
export interface ToolEnrichment {
  /** Required in enrichment (not optional like on ToolDefinition) */
  when_to_use: string[]
  examples?: { user: string; tool_call: unknown }[]
  related_tools?: string[]
  requires_confirmation?: boolean
  capability?: string
  progress_label?: string
  progress_phase?: ToolDefinition['progress_phase']
}

/**
 * A tool definition where enrichment fields are guaranteed present.
 * Used by buildToolPrompt() — only enriched tools generate awareness prompts.
 */
export type EnrichedToolDefinition = ToolDefinition & ToolEnrichment

// ── Signing Interfaces (Provider-Agnostic) ──────────────────────────

/** Supported chain families for signing */
export type ChainFamily = 'evm' | 'solana'

/** EVM transaction request (unsigned) */
export interface EVMTransactionRequest {
  chainId?: string
  to: string
  value?: string
  data?: string
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  nonce?: number
}

/** Solana transaction request (serialized, unsigned) */
export interface SolanaTransactionRequest {
  serializedTransaction: string
}

/** Union of chain-specific transaction requests */
export type TransactionRequest =
  | ({ chain: 'evm' } & EVMTransactionRequest)
  | ({ chain: 'solana' } & SolanaTransactionRequest)

/** EIP-712 typed data for structured signing (Hyperliquid, x402, etc.) */
export interface EIP712TypedData {
  domain: Record<string, unknown>
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: string
  message: Record<string, unknown>
}

/** Result of a signed + broadcast transaction */
export interface ExecutionResult {
  success: boolean
  txHash?: string
  error?: string
  blockNumber?: number
}

/** Result of a typed data signature */
export interface SignatureResult {
  success: boolean
  signature?: string
  error?: string
}

/**
 * Provider-agnostic transaction signer.
 *
 * Tools call this interface — they don't know if the provider is
 * Privy, Turnkey, Fireblocks, or a raw keypair.
 *
 * The runtime creates the signer by resolving wallet ownership
 * and injecting the provider-specific implementation.
 *
 * @example
 * // In a tool (provider-agnostic):
 * async function dexSwap(args: SwapArgs, signer: TransactionSigner) {
 *   const tx = buildSwapTransaction(args)
 *   return signer.executeTransaction(tx)
 * }
 *
 * // In the runtime (provider-specific):
 * const signer = createPrivySigner(userId, walletAddress)
 * await dexSwap(args, signer)
 */
export interface TransactionSigner {
  /** Sign and broadcast a transaction (EVM or Solana) */
  executeTransaction(tx: TransactionRequest): Promise<ExecutionResult>

  /** Sign EIP-712 typed data (for protocols like Hyperliquid, x402) */
  signTypedData(typedData: EIP712TypedData): Promise<SignatureResult>
}

/**
 * Category rendering order for buildToolPrompt().
 * Read first, then reason, then act, then everything else.
 */
export const CATEGORY_ORDER: Record<string, number> = {
  read: 0,
  web3: 0,
  reason: 1,
  act: 2,
  trading: 2,
  orchestration: 3,
  runtime: 3,
  internal: 4,
  content: 5,
}
