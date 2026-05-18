import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import type { BuiltInToolExecutorParams } from '../BuiltInToolExecutor.js'
import type { PluginToolContext } from '../PluginBridge.js'
import { createToolExecutionRuntime } from '../tool-runtime/ToolExecutionRuntime.js'
import type { ToolExecutionEvent } from '../tool-runtime/types.js'

export function createUnifiedExecutor(
  pluginCtxMap: Map<string, PluginToolContext>,
  builtInParams: BuiltInToolExecutorParams | undefined,
  streamOutput?: AIStreamOutput,
  onToolEvent?: (event: ToolExecutionEvent) => void,
) {
  const runtime = createToolExecutionRuntime({
    pluginCtxMap,
    builtInParams,
    streamOutput,
    onEvent: onToolEvent,
  })

  return {
    get toolCallCount() { return runtime.toolCallCount },
    get loopDetector() { return runtime.loopDetector },
    executor: async (toolName: string, params: Record<string, unknown>): Promise<string> =>
      runtime.execute(toolName, params),
  }
}
