/**
 * Re-export types from plugin-policy for convenience.
 * Consumers of plugin-executor often need these without importing plugin-policy directly.
 *
 * These are type-only re-exports — no runtime dependency on plugin-policy.
 * TypeScript erases type imports at compile time, so this adds zero bundle weight.
 */

export type {
  ExecutionPath,
  RouteResult,
  ActivatedPlugin,
} from '@lucid/plugin-policy'
