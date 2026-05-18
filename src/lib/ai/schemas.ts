/**
 * AI Output Schemas
 *
 * Zod schemas for structured AI output using Output.object().
 * These define the shape of data the AI generates — used for
 * type-safe workflow generation and other structured outputs.
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data
 */

import { z } from 'zod'

// ============================================================================
// WORKFLOW FLOWSPEC SCHEMA
// ============================================================================

export const triggerNodeSchema = z.object({
  type: z.enum(['webhook', 'cron', 'manual']).describe('How the workflow starts'),
  config: z
    .record(z.string(), z.any())
    .default({})
    .describe('Trigger configuration (e.g. cron expression, webhook path)'),
})

export const flowNodeSchema = z.object({
  id: z.string().describe('Unique node identifier (e.g. "node_1", "slack_send")'),
  type: z
    .string()
    .describe(
      'Node type — use n8n node names when possible (e.g. "n8n-nodes-base.slack", "n8n-nodes-base.httpRequest")'
    ),
  params: z
    .record(z.string(), z.any())
    .optional()
    .describe('Node parameters (API keys, URLs, message templates, etc.)'),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional()
    .describe('Visual position on the canvas'),
})

export const flowEdgeSchema = z.object({
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
  condition: z
    .string()
    .optional()
    .describe('Optional condition expression for conditional branching'),
})

export const flowSpecSchema = z.object({
  name: z.string().describe('Human-readable workflow name'),
  description: z
    .string()
    .optional()
    .describe('Brief description of what this workflow does'),
  trigger: triggerNodeSchema,
  nodes: z
    .array(flowNodeSchema)
    .min(1)
    .describe('Workflow steps/actions (at least one)'),
  edges: z
    .array(flowEdgeSchema)
    .describe('Connections between nodes defining execution order'),
  variables: z
    .record(z.string(), z.any())
    .optional()
    .describe('Workflow-level variables and secrets'),
})

// ============================================================================
// WORKFLOW GENERATION RESPONSE SCHEMA
// ============================================================================

export const workflowGenerationSchema = z.object({
  flowspec: flowSpecSchema.describe('The generated workflow specification'),
  reasoning: z
    .string()
    .describe('Brief explanation of design decisions and why these nodes were chosen'),
  complexity: z
    .enum(['simple', 'medium', 'complex'])
    .describe('Estimated complexity of the workflow'),
  suggestions: z
    .array(z.string())
    .optional()
    .describe('Optional improvement suggestions or next steps'),
})

export type WorkflowGeneration = z.infer<typeof workflowGenerationSchema>
export type FlowSpecInput = z.infer<typeof flowSpecSchema>