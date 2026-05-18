import type { AgentRuntime, RunTurnInput, RunTurnOutput } from './types.js'

export class GatewayRuntime implements AgentRuntime {
  async runTurn(_input: RunTurnInput): Promise<RunTurnOutput> {
    throw new Error(
      'GatewayRuntime is not enabled. Set runtime_mode to "embedded" or deploy an OpenClaw gateway pool.'
    )
  }
}
