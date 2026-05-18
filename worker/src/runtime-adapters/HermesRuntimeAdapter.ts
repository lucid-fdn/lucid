import { HermesLauncher } from '../agent/engines/hermes/HermesLauncher.js'
import type { EngineRuntimeAdapter, RuntimeAdapterReadiness } from './types.js'

export class HermesRuntimeAdapter implements EngineRuntimeAdapter {
  readonly id = 'hermes'

  constructor(
    private readonly launcher = new HermesLauncher(),
  ) {}

  async verifyInstalled(): Promise<void> {
    await this.launcher.verifyInstalled()
  }

  async checkReadiness(): Promise<RuntimeAdapterReadiness> {
    try {
      await this.verifyInstalled()
      return {
        ready: true,
        required: true,
        status: 'ready',
      }
    } catch (error) {
      return {
        ready: false,
        required: true,
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
