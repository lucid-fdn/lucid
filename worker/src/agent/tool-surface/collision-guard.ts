import { captureMessage } from '../../monitoring/sentry.js'
import type { ClientToolDefinition } from './types.js'

/**
 * Checks for tool name collisions between native (post-deny) and clientTools.
 * Returns the (possibly filtered) clientTools array.
 *
 * - hard mode (default): throws on collision
 * - soft mode: removes colliding clientTools, logs fatal to Sentry, returns rest
 */
export function assertNoCollisions(
  nativeEffectiveNames: Set<string>,
  clientTools: ClientToolDefinition[],
  options?: { softFail?: boolean },
): ClientToolDefinition[] {
  const clientToolNames = new Set(clientTools.map(t => t.function.name))
  const collisions = [...clientToolNames].filter(n => nativeEffectiveNames.has(n))
  if (collisions.length === 0) return clientTools

  const msg =
    `SECURITY: tool name collision between native and clientTools: ${collisions.join(', ')}. ` +
    `Check NATIVE_DENY list covers these native tools, or rename the conflicting clientTools.`

  captureMessage(msg, 'fatal', { subsystem: 'tool-surface' })

  if (options?.softFail) {
    console.error(`[tool-surface] ${msg} — removing colliding clientTools as safety fallback`)
    const collisionSet = new Set(collisions)
    return clientTools.filter(t => !collisionSet.has(t.function.name))
  }

  throw new Error(msg)
}

/**
 * Ensures no duplicate names among clientTools.
 * Context param controls the error message guidance.
 */
export function assertUniqueClientToolNames(
  tools: ClientToolDefinition[],
  context: 'builtin' | 'plugin' | 'oauth' | 'merged',
): void {
  const seen = new Set<string>()
  for (const t of tools) {
    const name = t.function.name
    if (seen.has(name)) {
      throw new Error(
        `Duplicate clientTool name in ${context} set: ${name}. ` +
        (context === 'plugin'
          ? 'Reject the plugin tool or rename it in plugin configuration.'
          : 'Check built-in tool registration for duplicates.')
      )
    }
    seen.add(name)
  }
}
