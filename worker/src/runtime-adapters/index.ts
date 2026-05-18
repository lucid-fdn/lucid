import type { Config } from '../config.js'
import { HermesRuntimeAdapter } from './HermesRuntimeAdapter.js'
import { OpenClawRuntimeAdapter } from './OpenClawRuntimeAdapter.js'
import { SharedWorkerRuntimeAdapter } from './SharedWorkerRuntimeAdapter.js'
import type { EngineRuntimeAdapter } from './types.js'

export function getWorkerRuntimeAdapter(
  config: Pick<Config, 'LUCID_RUNTIME_ID' | 'LUCID_ENGINE'>,
): EngineRuntimeAdapter {
  if (!config.LUCID_RUNTIME_ID) {
    return new SharedWorkerRuntimeAdapter([
      new OpenClawRuntimeAdapter(),
      new HermesRuntimeAdapter(),
    ])
  }

  if (config.LUCID_ENGINE === 'hermes') {
    return new HermesRuntimeAdapter()
  }

  return new OpenClawRuntimeAdapter()
}

export type { EngineRuntimeAdapter, RuntimeAdapterReadiness } from './types.js'
