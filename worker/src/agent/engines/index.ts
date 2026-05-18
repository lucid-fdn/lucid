import type { EngineRunner, WorkerAgentEngine } from './types.js'
import type { OpenClawAgentParams } from '../OpenClawAgent.js'

type EngineRunnerLoader = () => Promise<EngineRunner>

const runnerLoaders: Record<WorkerAgentEngine, EngineRunnerLoader> = {
  openclaw: async () => {
    const { OpenClawEngineRunner } = await import('./OpenClawEngineRunner.js')
    return new OpenClawEngineRunner()
  },
  hermes: async () => {
    const { HermesEngineRunner } = await import('./HermesEngineRunner.js')
    return new HermesEngineRunner()
  },
}

function resolveEngine(engine: string | null | undefined): WorkerAgentEngine {
  if (!engine) return 'openclaw'
  if (engine in runnerLoaders) return engine as WorkerAgentEngine
  throw new Error(`Unsupported engine "${engine}"`)
}

export async function getEngineRunner(engine: string | null | undefined): Promise<EngineRunner> {
  const resolvedEngine = resolveEngine(engine)
  const loadRunner = runnerLoaders[resolvedEngine]
  if (!loadRunner) {
    throw new Error(`No engine runner registered for "${resolvedEngine}"`)
  }
  return loadRunner()
}

export async function runAgent(params: OpenClawAgentParams) {
  const runner = await getEngineRunner(params.assistant.engine)
  return runner.run(params)
}

export type { EngineRunner, WorkerAgentEngine } from './types.js'
