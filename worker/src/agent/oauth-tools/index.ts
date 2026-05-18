/**
 * OAuth Tools — barrel exports
 *
 * Nango owns auth + API translation (triggerAction).
 * We own policy: bindings, rate limits, audit, confirmation gating.
 *
 * Integration tools flow through the unified plugin dispatch path
 * (PluginBridge) via transport: 'nango'. No separate executor path.
 */

export type {
  ActionDangerLevel,
  NangoToolDefinition,
  OAuthBinding,
  OAuthToolAuditEvent,
  OAuthToolCallStatus,
} from './types.js'

export { buildNangoBinding } from './types.js'

export {
  resolveConnection,
  NoOAuthConnectionError,
} from './connection-resolver.js'

export { getNangoClient, isNangoConfigured } from './nango-client.js'

export { discoverTools, discoverToolsBatch, clearDiscoveryCache } from './tool-discovery.js'

export { executeNangoAction, type NangoActionContext } from './nango-action-bridge.js'

export { cleanupRunCounters, isDistributed as isRateLimitDistributed } from './rate-limiter.js'

export { emitOAuthToolAudit, setAuditRpcFn } from './audit.js'

export { createNangoProxyAdapter, ActionError, type NangoProxyAdapter } from './nango-proxy-adapter.js'

export { loadActionScript, clearActionScriptCache } from './action-script-loader.js'

export { shapeActionResponse, applyDefaultPageSize } from './response-shaper.js'
