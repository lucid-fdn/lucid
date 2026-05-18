/**
 * Agent Bridge — Default Logger
 *
 * Console logger with [lucid-bridge] prefix. Subsystem-specific prefixes
 * (e.g., [lucid-bridge:heartbeat]) are added by each module.
 *
 * Override by passing a custom BridgeLogger to BridgeConfig.
 */

import type { BridgeLogger } from './types.js'

const PREFIX = '[lucid-bridge]'

export const defaultLogger: BridgeLogger = {
  info: (message: string, ...args: unknown[]) => console.log(PREFIX, message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(PREFIX, message, ...args),
  error: (message: string, ...args: unknown[]) => console.error(PREFIX, message, ...args),
}
