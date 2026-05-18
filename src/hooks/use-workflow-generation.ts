'use client'

import { DEFAULT_MODEL_ID } from '@/lib/ai/models'

/**
 * useWorkflowGeneration Hook
 *
 * Progressive UI rendering for structured workflow generation.
 * Uses AI SDK v6 useObject() to stream partial FlowSpec objects
 * as they're generated, giving real-time visual feedback.
 *
 * @example
 * ```tsx
 * const { generate, object, isLoading, error } = useWorkflowGeneration()
 *
 * // Trigger generation
 * generate('Send Slack notification when new Stripe payment arrives')
 *
 * // Render progressively — object updates as tokens stream in
 * {object?.flowspec?.name && <h3>{object.flowspec.name}</h3>}
 * {object?.flowspec?.nodes?.map(node => <NodeCard key={node.id} node={node} />)}
 * ```
 */

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { workflowGenerationSchema, type WorkflowGeneration } from '@/lib/ai/schemas'

interface UseWorkflowGenerationOptions {
  model?: string
  orgId?: string
  onFinish?: (result: WorkflowGeneration) => void
  onError?: (error: Error) => void
}

export function useWorkflowGeneration(options: UseWorkflowGenerationOptions = {}) {
  const {
    model = DEFAULT_MODEL_ID,
    orgId,
    onFinish,
    onError,
  } = options

  const {
    object,
    submit,
    isLoading,
    error,
    stop,
  } = useObject({
    api: '/api/ai/generate-workflow',
    schema: workflowGenerationSchema,
    onFinish: ({ object: result }: { object: unknown }) => {
      if (result && onFinish) {
        onFinish(result as WorkflowGeneration)
      }
    },
    onError: (err: Error) => {
      console.error('[useWorkflowGeneration] Error:', err)
      onError?.(err)
    },
  })

  /**
   * Generate a workflow from a text description.
   * The `object` will progressively update as tokens stream in.
   */
  const generate = (description: string) => {
    submit({
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: description,
          parts: [{ type: 'text', text: description }],
        },
      ],
      model,
      orgId,
      structured: true,
    })
  }

  return {
    /** The progressively-updating structured workflow object */
    object: object as Partial<WorkflowGeneration> | undefined,
    /** Trigger workflow generation from a description */
    generate,
    /** Whether the generation is currently streaming */
    isLoading,
    /** Any error that occurred during generation */
    error,
    /** Stop the current generation */
    stop,
    /** Convenience: extract just the flowspec (most commonly needed) */
    flowspec: (object as Partial<WorkflowGeneration> | undefined)?.flowspec,
    /** Convenience: number of nodes generated so far */
    nodeCount: (object as Partial<WorkflowGeneration> | undefined)?.flowspec?.nodes?.length ?? 0,
  }
}