/**
 * Dangerous on shared: OS/browser/filesystem access in a multi-tenant container.
 * Safe on dedicated: agent owns the entire container — sandboxed by Docker.
 */
const DANGER_DENY_SHARED = [
  'exec', 'process', 'apply_patch',
  'read', 'write', 'edit',
  'browser',
] as const

/**
 * Tenancy-unsafe on shared: assumes local filesystem, shared workspace state.
 * Safe on dedicated: single-tenant, no cross-user leakage.
 */
const TENANCY_DENY_SHARED = [
  'memory_search', 'memory_get',
  'canvas',
  'nodes',
  'tts',
] as const

/**
 * Replaced by Lucid SaaS equivalents on SHARED (DB-backed, org-scoped, rate-limited).
 * On DEDICATED: use OpenClaw's native versions — they're battle-tested, well-maintained,
 * and work perfectly in single-process containers. Our replacements were only needed
 * because native tools assume single-tenant (unsafe on shared multi-tenant worker).
 *
 * Future: cross-container messaging via HTTP + on-chain discovery (ERC-8004 + x402).
 */
const REPLACED_BY_LUCID_DENY_SHARED = [
  'cron',
  'message',
  'sessions_send',
  'sessions_spawn',
  'sessions_list',
  'sessions_history',
  'subagents',
  'session_status',
  'agents_list',
  'gateway',
] as const

/** Combined deny list for shared mode (all categories) */
export const NATIVE_DENY = [
  ...DANGER_DENY_SHARED,
  ...TENANCY_DENY_SHARED,
  ...REPLACED_BY_LUCID_DENY_SHARED,
] as const

/** Dedicated-only deny list — empty: all native tools allowed.
 * Dangerous tools are safe (agent owns container).
 * Tenancy tools are safe (single-tenant).
 * Cron/messaging/subagent use OpenClaw native (well-maintained, in-process). */
export const NATIVE_DENY_DEDICATED = [] as const

export function isDedicatedRuntime(): boolean {
  return !!process.env.LUCID_RUNTIME_ID
}

function getExtraDeny(): string[] {
  const extra = process.env.OPENCLAW_NATIVE_DENY_EXTRA
  return extra ? extra.split(',').map(s => s.trim()).filter(Boolean) : []
}

export function buildOpenClawToolPolicy() {
  const baseDeny = isDedicatedRuntime() ? NATIVE_DENY_DEDICATED : NATIVE_DENY
  return {
    tools: {
      deny: [...baseDeny, ...getExtraDeny()],
    },
  }
}
