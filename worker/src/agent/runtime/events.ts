import type { ToolOwner } from '../tool-surface/types.js'

export interface RuntimeEventEmitter {
  onRunStart(ctx: { runId: string; assistantId: string; orgId: string; model: string }): void
  onRunEnd(ctx: {
    runId: string; durationMs: number; toolCallsUsed: number;
    usage?: { input?: number; output?: number; total?: number }
  }): void
  onRunError(ctx: { runId: string; error: Error; phase: string }): void

  onToolCallStart(ctx: { runId: string; toolName: string; toolCallId: string; owner: ToolOwner }): void
  onToolCallEnd(ctx: {
    runId: string; toolName: string; toolCallId: string;
    durationMs: number; isError: boolean; owner: ToolOwner
  }): void

  onModelCallStart(ctx: { runId: string; model: string; turnIndex: number }): void
  onModelCallEnd(ctx: { runId: string; turnIndex: number; usage?: { input?: number; output?: number } }): void
}

/** No-op emitter for use when no consumers are wired up yet */
export const noopEmitter: RuntimeEventEmitter = {
  onRunStart() {},
  onRunEnd() {},
  onRunError() {},
  onToolCallStart() {},
  onToolCallEnd() {},
  onModelCallStart() {},
  onModelCallEnd() {},
}
