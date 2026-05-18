/**
 * OAuth Tool Wire Name Contracts
 *
 * Pure TypeScript — no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 *
 * Wire format: oauth__<provider>__<action>
 * Triple-segment with `oauth__` prefix distinguishes from plugin `slug__tool`.
 */

const OAUTH_PREFIX = 'oauth__'

/**
 * Convert provider + action to wire format for LLM tool calling.
 * OpenAI tool names must match ^[a-zA-Z0-9_-]+$ (max 64 chars).
 * Format: oauth__slack__send_message
 */
export function toOAuthWireToolName(provider: string, action: string): string {
  const full = `${OAUTH_PREFIX}${provider}__${action}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (full.length <= 64) return full
  // Truncate + hash suffix for long names (unlikely for OAuth tools)
  const hash = simpleHash(full).toString(36).slice(0, 6)
  return `${full.slice(0, 57)}_${hash}`
}

/**
 * Parse wire tool name back to provider + action.
 * Returns null if the name doesn't match the oauth__ prefix convention.
 */
export function parseOAuthWireToolName(wireName: string): { provider: string; action: string } | null {
  if (!wireName.startsWith(OAUTH_PREFIX)) return null
  const rest = wireName.slice(OAUTH_PREFIX.length)
  const idx = rest.indexOf('__')
  if (idx === -1) return null
  return { provider: rest.slice(0, idx), action: rest.slice(idx + 2) }
}

/**
 * Check if a wire tool name is an OAuth tool (starts with oauth__).
 */
export function isOAuthWireToolName(wireName: string): boolean {
  return wireName.startsWith(OAUTH_PREFIX)
}

/** FNV-1a hash for deterministic short hashes */
function simpleHash(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash
}
