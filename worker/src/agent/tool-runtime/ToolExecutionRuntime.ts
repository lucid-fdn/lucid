import crypto from 'node:crypto'

import { executeBuiltInTool, isBuiltInTool } from '../BuiltInToolExecutor.js'
import { executePluginTool } from '../PluginBridge.js'
import { parseWireToolName } from '../plugin-types.js'
import { DANGER_TOOLS } from '../CommandsAllowlist.js'
import { defaultAgentGovernanceRuntime } from '../contracts/governance-runtime.js'
import { LoopDetector } from '../loop-detector.js'
import { emitNotification, ALERTS } from '../../notifications/emitter.js'
import { isProofEligibleTool, recordProofAnchor, fetchPolicySnapshot } from '../proof-anchor.js'
import type { CreateToolExecutionRuntimeInput, ToolExecutionRuntime } from './types.js'
import { resolveToolProgressMetadata } from '../../core/progress/tool-capabilities.js'

class DefaultToolExecutionRuntime implements ToolExecutionRuntime {
  private _toolCallCount = 0
  readonly loopDetector = new LoopDetector()

  constructor(private readonly input: CreateToolExecutionRuntimeInput) {}

  private emit(type: import('./types.js').ToolExecutionEventType, toolName: string, toolCallId: string, payload?: Record<string, unknown>): void {
    const progressMetadata = resolveToolProgressMetadata(toolName)
    this.input.onEvent?.({
      type,
      toolName,
      toolCallId,
      payload: {
        ...progressMetadata,
        ...payload,
      },
    })
  }

  get toolCallCount(): number {
    return this._toolCallCount
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<string> {
    if (!isBuiltInTool(toolName) && !this.input.pluginCtxMap.has(toolName)) {
      if (DANGER_TOOLS.has(toolName)) {
        console.error(`[tool-runtime] SECURITY: Blocked dangerous tool: ${toolName}`)
      } else {
        console.warn(`[tool-runtime] BLOCKED tool call: ${toolName} (not in allowlist)`)
      }
      return JSON.stringify({ error: `Tool "${toolName}" is not allowed.` })
    }

    this._toolCallCount++
    const toolCallId = crypto.randomUUID()
    this.emit('tool_requested', toolName, toolCallId, {
      toolArgsPreview: JSON.stringify(params).slice(0, 500),
    })

    if (this.input.builtInParams?.assistant) {
      if (defaultAgentGovernanceRuntime.requiresApproval(this.input.builtInParams.assistant, toolName)) {
        this.emit('tool_approval_required', toolName, toolCallId)
      }
      const approvalFlow = await defaultAgentGovernanceRuntime.authorizeToolCall({
        supabase: this.input.builtInParams.supabase,
        assistant: this.input.builtInParams.assistant,
        toolName,
        toolArgs: params,
        runId: this.input.builtInParams.runId,
        toolCallId,
        streamOutput: this.input.streamOutput,
      })
      if (approvalFlow.status === 'blocked') {
        if (approvalFlow.lifecycle === 'denied') {
          this.emit('tool_denied', toolName, toolCallId)
        } else if (approvalFlow.lifecycle === 'expired') {
          this.emit('tool_expired', toolName, toolCallId)
        }
        return approvalFlow.response ?? JSON.stringify({ error: 'Tool execution blocked by governance.' })
      }
      if (approvalFlow.lifecycle === 'approved') {
        this.emit('tool_approved', toolName, toolCallId)
      }
    }

    const loopResult = this.loopDetector.record(toolName, params)
    if (loopResult) {
      console.warn(`[tool-runtime] LOOP DETECTED: ${loopResult.explanation}`)
      this.emit('tool_blocked_loop', toolName, toolCallId, {
        explanation: loopResult.explanation,
        callCount: loopResult.callCount,
      })
      const msg = JSON.stringify({
        error: 'Loop detected — this tool call was blocked.',
        explanation: loopResult.explanation,
        tool: loopResult.toolName,
        call_count: loopResult.callCount,
      })
      this.input.streamOutput?.toolError(toolCallId, loopResult.explanation)

      if (this.input.builtInParams?.assistant?.org_id) {
        void emitNotification(this.input.builtInParams.supabase, {
          orgId: this.input.builtInParams.assistant.org_id,
          ...ALERTS.loopDetected(this.input.builtInParams.assistant.name ?? 'Agent', toolName),
        })
      }

      return msg
    }

    if (isBuiltInTool(toolName) && this.input.builtInParams) {
      console.log(`[tool-runtime] Executing built-in tool: ${toolName}`)
      this.emit('tool_started', toolName, toolCallId, { executionKind: 'builtin' })
      this.input.streamOutput?.toolStart(toolCallId, toolName)
      try {
        const result = await executeBuiltInTool(toolName, params, this.input.builtInParams, toolCallId)
        if (result !== null) {
          this.emit('tool_completed', toolName, toolCallId, {
            executionKind: 'builtin',
            outputPreview: result.slice(0, 500),
          })
          this.input.streamOutput?.toolResult(toolCallId, result)

          if (isProofEligibleTool(toolName) && this.input.builtInParams.assistant?.org_id) {
            recordProofAnchor({
              supabase: this.input.builtInParams.supabase,
              orgId: this.input.builtInParams.assistant.org_id,
              agentId: this.input.builtInParams.assistant.id,
              runId: this.input.builtInParams.runId ?? toolCallId,
              toolName,
              toolArgs: params,
              toolResult: result,
              policySnapshot: await fetchPolicySnapshot(
                this.input.builtInParams.supabase,
                this.input.builtInParams.assistant.id,
              ),
            }).catch((err) => {
              console.error('[proof-anchor] Fire-and-forget error:', err)
            })
          }

          return result
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
        this.emit('tool_failed', toolName, toolCallId, {
          executionKind: 'builtin',
          error: errorMsg.slice(0, 500),
        })
        this.input.streamOutput?.toolError(toolCallId, errorMsg)
        return JSON.stringify({ error: errorMsg })
      }
    }

    const parsed = parseWireToolName(toolName)
    const ctx = this.input.pluginCtxMap.get(toolName)
    if (!parsed || !ctx) {
      console.warn(`[tool-runtime] Unknown tool: ${toolName}`)
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }

    const displayName = `${parsed.pluginSlug}:${parsed.toolName}`
    console.log(`[tool-runtime] Executing plugin tool: ${displayName}`)
    this.emit('tool_started', toolName, toolCallId, {
      executionKind: 'plugin',
      displayName,
    })
    this.input.streamOutput?.toolStart(toolCallId, displayName)
    try {
      const result = await executePluginTool(parsed.pluginSlug, parsed.toolName, params, ctx)
      this.emit('tool_completed', toolName, toolCallId, {
        executionKind: 'plugin',
        displayName,
        outputPreview: result.slice(0, 500),
      })
      this.input.streamOutput?.toolResult(toolCallId, result)
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
      this.emit('tool_failed', toolName, toolCallId, {
        executionKind: 'plugin',
        displayName,
        error: errorMsg.slice(0, 500),
      })
      this.input.streamOutput?.toolError(toolCallId, errorMsg)
      return JSON.stringify({ error: errorMsg })
    }
  }
}

export function createToolExecutionRuntime(
  input: CreateToolExecutionRuntimeInput,
): ToolExecutionRuntime {
  return new DefaultToolExecutionRuntime(input)
}
