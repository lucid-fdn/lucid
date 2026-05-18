/**
 * All native tools created by createOpenClawCodingTools() + createOpenClawTools().
 * MUST be updated when pulling new OpenClaw subtree versions.
 *
 * Sources:
 *   - pi-tools.ts createOpenClawCodingTools() (coding tools base set + exec/process/apply_patch)
 *   - openclaw-tools.ts createOpenClawTools() lines 124-194
 * Last synced: 2026-03-11
 */
export const KNOWN_NATIVE_TOOLS = new Set([
  // From coding tools base set (pi-tools.ts)
  'read', 'write', 'edit',
  'exec', 'process',
  'apply_patch',
  // From createOpenClawTools (openclaw-tools.ts)
  'browser', 'canvas', 'nodes', 'cron', 'message', 'tts',
  'gateway', 'agents_list', 'sessions_list', 'sessions_history',
  'sessions_send', 'sessions_spawn', 'subagents', 'session_status',
  'web_search', 'web_fetch', 'image', 'pdf',
] as const)

/** Dynamic native tools that depend on agent channel config */
export const KNOWN_DYNAMIC_NATIVE_TOOLS = new Set([
  'whatsapp_login',
] as const)

/**
 * Computes the effective native tools after deny filtering.
 * This is the set the collision guard checks clientTools against.
 */
export function resolveEffectiveNativeTools(
  denyList: readonly string[],
  dynamicTools?: Set<string>,
): Set<string> {
  const allNative = new Set([
    ...KNOWN_NATIVE_TOOLS,
    ...KNOWN_DYNAMIC_NATIVE_TOOLS,
    ...(dynamicTools ?? []),
  ])
  const denySet = new Set(denyList)
  return new Set([...allNative].filter(t => !denySet.has(t)))
}
