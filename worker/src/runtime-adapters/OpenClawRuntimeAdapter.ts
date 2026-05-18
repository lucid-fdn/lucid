import type { EngineRuntimeAdapter, RuntimeAdapterReadiness } from './types.js'

export class OpenClawRuntimeAdapter implements EngineRuntimeAdapter {
  readonly id = 'openclaw'

  async verifyInstalled(): Promise<void> {
    return
  }

  async checkReadiness(): Promise<RuntimeAdapterReadiness> {
    return {
      ready: true,
      required: false,
      status: 'skipped',
    }
  }
}
