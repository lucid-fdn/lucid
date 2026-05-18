/**
 * @lucid/plugin-policy
 *
 * Unified capability registry, router, policy engine, and audit hooks.
 * Shared between the worker (in-process execution) and MCPGate (gateway execution).
 *
 * Usage:
 *   import { PluginRegistry, routePlugin, resolvePolicy, AuditEmitter } from '@lucid/plugin-policy'
 */

// Types
export type {
  PluginCatalogEntry,
  ToolDef,
  ActivatedPlugin,
  PolicyDecision,
  PolicyResult,
  PolicyConfig,
  ExecutionPath,
  RouteResult,
  AuditEvent,
  AuditHandler,
} from './types.js'

// Registry
export { PluginRegistry } from './registry.js'

// Policy
export { resolvePolicy } from './policy.js'

// Router
export { routePlugin } from './router.js'
export type { RouterConfig } from './router.js'

// Audit
export { AuditEmitter } from './audit.js'

// Manifest normalization
export { normalizePluginRow } from './manifest.js'
export {
  TOOL_MANIFEST_COMPATIBILITY,
  TOOL_MANIFEST_VERSION,
  buildToolManifestHash,
  normalizeJsonSchema,
  prepareToolManifest,
} from './tool-manifest.js'
export type {
  PreparedToolManifest,
  PrepareToolManifestOptions,
  ToolManifestIssue,
} from './tool-manifest.js'
