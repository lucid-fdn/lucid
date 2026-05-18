import type { AgentRuntime } from './types.js'
import { EmbeddedRuntime } from './embedded.js'
import { GatewayRuntime } from './gateway.js'

export type RuntimeMode = 'embedded' | 'gateway'

const runtimes: Record<RuntimeMode, AgentRuntime> = {
  embedded: new EmbeddedRuntime(),
  gateway: new GatewayRuntime(),
}

export function getRuntime(mode: RuntimeMode = 'embedded'): AgentRuntime {
  return runtimes[mode]
}

export type { AgentRuntime, RunTurnInput, RunTurnOutput } from './types.js'
export type { RuntimeEventEmitter } from './events.js'
export { EmbeddedRuntime } from './embedded.js'
export { GatewayRuntime } from './gateway.js'
