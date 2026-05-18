/**
 * Provider-local action aliases
 *
 * Public/catalog action names are not always identical to the bundled local
 * action script and shaper names. Keep the outward-facing action stable, but
 * normalize to the local variant for in-process execution and local shaping.
 */

const LOCAL_ACTION_ALIASES: Record<string, Record<string, string>> = {
  notion: {
    search: 'search-pages',
    'get-database': 'retrieve-database',
  },
}

export function resolveLocalActionName(provider: string, actionName: string): string {
  return LOCAL_ACTION_ALIASES[provider]?.[actionName] ?? actionName
}
