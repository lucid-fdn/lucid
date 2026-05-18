import { runOpenClawAgent } from '../OpenClawAgent.js'
import type { EngineRunner } from './types.js'

export class OpenClawEngineRunner implements EngineRunner {
  readonly engine = 'openclaw' as const
  readonly capabilities = {
    sharedExecution: 'stable',
    toolRuntime: 'stable',
    approvals: 'stable',
    usageAccounting: 'stable',
    mutationPolicy: 'stable',
  } as const

  async run(params: Parameters<typeof runOpenClawAgent>[0]) {
    return runOpenClawAgent(params)
  }
}
