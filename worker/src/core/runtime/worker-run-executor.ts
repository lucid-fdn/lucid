import { runAgent } from '../../agent/engines/index.js'
import {
  normalizeEngineRunResult,
  type RunRequest,
  type RunResult,
} from '../contracts/run-contract.js'

export interface WorkerRunExecutor {
  execute(request: RunRequest): Promise<RunResult>
}

export class DefaultWorkerRunExecutor implements WorkerRunExecutor {
  async execute(request: RunRequest): Promise<RunResult> {
    const startedAt = Date.now()
    const timeoutMs = request.budget.maxWallTimeMs
    const controller = request.abortSignal ? null : new AbortController()
    const runRequest = controller ? { ...request, abortSignal: controller.signal } : request
    let timeout: NodeJS.Timeout | undefined

    try {
      const result = await Promise.race([
        runAgent(runRequest),
        new Promise<never>((_, reject) => {
          if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return
          timeout = setTimeout(() => {
            controller?.abort()
            reject(new Error(`Agent run exceeded max wall time (${timeoutMs}ms)`))
          }, timeoutMs)
        }),
      ])
      return normalizeEngineRunResult(result, request.assistant)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent run failed'
      return {
        text: message,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        steps: 0,
        toolCallsUsed: 0,
        budgetExhausted: /max wall time|timeout|timed out/i.test(message),
        providerError: true,
        source: {
          engine: request.assistant.engine ?? 'openclaw',
          runtimeFlavor: request.assistant.runtime_flavor ?? 'shared',
          executionMode: 'engine',
        },
        diagnostics: {
          durationMs: Date.now() - startedAt,
          model: request.assistant.lucid_model ?? undefined,
          stopReason: 'error',
          error: {
            kind: /max wall time|timeout|timed out/i.test(message) ? 'timeout' : 'runtime_error',
            message,
          },
        },
        meta: {
          durationMs: Date.now() - startedAt,
          model: request.assistant.lucid_model ?? undefined,
          stopReason: 'error',
          error: {
            kind: /max wall time|timeout|timed out/i.test(message) ? 'timeout' : 'runtime_error',
            message,
          },
        },
      }
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}

export const defaultWorkerRunExecutor = new DefaultWorkerRunExecutor()
