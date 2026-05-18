import type { EngineRuntimeAdapter, RuntimeAdapterReadiness } from './types.js'

export class SharedWorkerRuntimeAdapter implements EngineRuntimeAdapter {
  readonly id = 'shared-worker'

  constructor(
    private readonly adapters: EngineRuntimeAdapter[],
  ) {}

  async verifyInstalled(): Promise<void> {
    const results = await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        await adapter.verifyInstalled()
        return adapter.id
      }),
    )

    if (results.some((result) => result.status === 'fulfilled')) {
      return
    }

    const firstError = results.find((result) => result.status === 'rejected')
    if (firstError?.status === 'rejected') {
      throw firstError.reason
    }
  }

  async checkReadiness(): Promise<RuntimeAdapterReadiness> {
    const details = await Promise.all(
      this.adapters.map(async (adapter) => {
        const readiness = await adapter.checkReadiness()
        return {
          adapter: adapter.id,
          ready: readiness.ready,
          required: readiness.required,
          status: readiness.status,
          error: readiness.error ?? null,
        }
      }),
    )

    const readyAdapters = details.filter((detail) => detail.ready)
    if (readyAdapters.length > 0) {
      return {
        ready: true,
        required: true,
        status: 'ready',
        details,
      }
    }

    return {
      ready: false,
      required: true,
      status: 'unavailable',
      error: details.find((detail) => detail.error)?.error ?? 'No runtime adapters are ready',
      details,
    }
  }
}
