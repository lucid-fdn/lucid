import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import type { BuiltInToolExecutorParams } from '../BuiltInToolExecutor.js'
import type { PluginToolContext } from '../PluginBridge.js'
import type { LoopDetector } from '../loop-detector.js'

export type ToolExecutionEventType =
  | 'tool_requested'
  | 'tool_approval_required'
  | 'tool_approved'
  | 'tool_denied'
  | 'tool_expired'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'tool_blocked_loop'

export interface ToolExecutionEvent {
  type: ToolExecutionEventType
  toolName: string
  toolCallId: string
  payload?: Record<string, unknown>
}

export interface CreateToolExecutionRuntimeInput {
  pluginCtxMap: Map<string, PluginToolContext>
  builtInParams?: BuiltInToolExecutorParams
  streamOutput?: AIStreamOutput
  onEvent?: (event: ToolExecutionEvent) => void
}

export interface ToolExecutionRuntime {
  readonly toolCallCount: number
  readonly loopDetector: LoopDetector
  execute(toolName: string, params: Record<string, unknown>): Promise<string>
}
