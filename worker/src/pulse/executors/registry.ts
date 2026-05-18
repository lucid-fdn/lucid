/**
 * Pulse Executor Registry
 *
 * Routes step types to the correct executor.
 * First-match semantics: first registered executor whose canHandle() returns true.
 * ProcessorExecutor should be registered last as the catch-all default.
 */

import type { StepExecutor } from './types.js'

export class ExecutorRegistry {
  private executors: StepExecutor[] = []

  /** Register an executor. Order matters — first match wins. */
  register(executor: StepExecutor): void {
    this.executors.push(executor)
  }

  /**
   * Resolve the executor for a given step type.
   * Returns the first executor whose canHandle() returns true, or null.
   */
  resolve(stepType: string): StepExecutor | null {
    for (const executor of this.executors) {
      if (executor.canHandle(stepType)) {
        return executor
      }
    }
    return null
  }
}
