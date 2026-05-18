/**
 * Capability SDK — Gateway Executor
 *
 * Executes plugin tools via HTTP to MCPGate or direct REST endpoints.
 * Retries on 429/503 with exponential backoff (matches PluginBridge pattern).
 *
 * ~50-200ms latency. Used for community plugins and gateway-forced paths.
 */

import type { GatewayConfig, ToolCallResult } from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1_000

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  maxRetries: number,
  label: string,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok || !isRetryable(res.status) || attempt === maxRetries) {
        return res
      }
      // Respect Retry-After header (RFC 7231) if present, otherwise exponential backoff
      const retryAfter = res.headers.get('Retry-After')
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt - 1)
      console.warn(`[capability-sdk:${label}] ${res.status}, retry ${attempt}/${maxRetries} in ${delayMs}ms`)
      await new Promise((r) => setTimeout(r, delayMs))
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt === maxRetries) throw lastError
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError ?? new Error('Unexpected retry exhaustion')
}

export class GatewayExecutor {
  private readonly config: GatewayConfig

  constructor(config: GatewayConfig) {
    this.config = config
  }

  /** Execute a tool via MCPGate HTTP gateway (retry on 429/503). */
  async executeMcp(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    authToken?: string,
    authHeaders?: Record<string, string>,
  ): Promise<ToolCallResult> {
    const t0 = Date.now()
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.mcpgateApiKey}`,
      }
      if (authToken) {
        headers['X-Integration-Token'] = authToken
      }
      // Merge provider-specific headers (e.g., from Nango OAuth metadata)
      if (authHeaders) {
        Object.assign(headers, authHeaders)
      }

      const res = await fetchWithRetry(
        `${this.config.mcpgateUrl}/v1/tools/call`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            server_id: serverId,
            tool_name: toolName,
            arguments: args,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
        MAX_RETRIES,
        `mcp:${serverId}`,
      )

      const durationMs = Date.now() - t0

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error')
        return {
          content: { error: `MCPGate returned ${res.status}`, details: errText.slice(0, 500) },
          isError: true,
          durationMs,
          executionPath: 'gateway-mcp',
        }
      }

      const result = (await res.json()) as { content?: unknown; isError?: boolean }
      return {
        content: result.content,
        isError: result.isError ?? false,
        durationMs,
        executionPath: 'gateway-mcp',
      }
    } catch (err) {
      return {
        content: { error: err instanceof Error ? err.message : 'Gateway execution failed' },
        isError: true,
        durationMs: Date.now() - t0,
        executionPath: 'gateway-mcp',
      }
    }
  }

  /** Execute a tool via direct REST API call (retry on 429/503). */
  async executeRest(
    baseUrl: string,
    toolName: string,
    args: Record<string, unknown>,
    authToken?: string,
    authTokenType?: string,
    authHeaders?: Record<string, string>,
  ): Promise<ToolCallResult> {
    const t0 = Date.now()
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (authToken) {
        const scheme = authTokenType === 'bearer' ? 'Bearer' : 'Api-Key'
        headers['Authorization'] = `${scheme} ${authToken}`
      }
      // Merge provider-specific headers
      if (authHeaders) {
        Object.assign(headers, authHeaders)
      }

      const url = `${baseUrl}/${encodeURIComponent(toolName)}`
      const res = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(timeoutMs),
        },
        MAX_RETRIES,
        `rest:${toolName}`,
      )

      const durationMs = Date.now() - t0

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error')
        return {
          content: { error: `REST API returned ${res.status}`, details: errText.slice(0, 500) },
          isError: true,
          durationMs,
          executionPath: 'gateway-rest',
        }
      }

      const data = await res.json()
      return {
        content: data,
        isError: false,
        durationMs,
        executionPath: 'gateway-rest',
      }
    } catch (err) {
      return {
        content: { error: err instanceof Error ? err.message : 'REST execution failed' },
        isError: true,
        durationMs: Date.now() - t0,
        executionPath: 'gateway-rest',
      }
    }
  }
}
