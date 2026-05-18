/**
 * AI Tool Definitions
 *
 * Vercel AI SDK v6 tool calling — gives the AI assistant access to
 * platform capabilities like marketplace search and workflow helpers.
 *
 * Usage in streamText():
 *   import { platformTools } from '@/lib/ai/tools'
 *   streamText({ model, messages, tools: platformTools })
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchMarketplace,
  getPopularModels,
  type AssetsResponse,
} from '@/lib/marketplace/marketplace-service'

// ============================================================================
// MARKETPLACE TOOLS
// ============================================================================

const searchMarketplaceTool = tool({
  description:
    'Search the AI marketplace for models, datasets, agents, and connectors. Use this when the user asks about available models, wants to find a specific AI tool, or needs recommendations.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'Search query (e.g. "image generation", "llama", "code assistant")'
      ),
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe('Number of results to return'),
  }),
  execute: async ({ query, limit }) => {
    try {
      const response: AssetsResponse = await searchMarketplace(query, {
        limit,
      })
      return {
        query,
        resultCount: response.assets.length,
        results: response.assets.map((r) => ({
          name: r.name,
          id: r.id,
          kind: r.kind,
          provider: r.provider,
          description: r.description?.slice(0, 200),
          tags: r.tags?.slice(0, 5),
        })),
      }
    } catch {
      return { error: 'Failed to search marketplace', query }
    }
  },
})

const getPopularModelsTool = tool({
  description:
    'Get the most popular AI models on the platform. Use this when the user asks for model recommendations or wants to see trending models.',
  inputSchema: z.object({
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe('Number of models to return'),
  }),
  execute: async ({ limit }) => {
    try {
      const response: AssetsResponse = await getPopularModels({ limit })
      return {
        modelCount: response.assets.length,
        models: response.assets.map((m) => ({
          name: m.name,
          id: m.id,
          provider: m.provider,
          description: m.description?.slice(0, 200),
          tags: m.tags?.slice(0, 5),
        })),
      }
    } catch {
      return { error: 'Failed to fetch popular models' }
    }
  },
})

// ============================================================================
// WORKFLOW TOOLS
// ============================================================================

const suggestWorkflowTool = tool({
  description:
    'Generate a workflow suggestion based on a description. Returns a structured workflow spec with trigger, actions, and connections. Use this when the user wants to create or design an automation workflow.',
  inputSchema: z.object({
    description: z
      .string()
      .describe(
        'What the workflow should do (e.g. "send Slack notification when new Stripe payment arrives")'
      ),
    complexity: z
      .enum(['simple', 'medium', 'complex'])
      .default('medium')
      .describe('How complex the workflow should be'),
  }),
  execute: async ({ description, complexity }) => {
    const maxNodes =
      complexity === 'simple' ? 3 : complexity === 'medium' ? 6 : 10
    return {
      suggestion: {
        description,
        complexity,
        maxNodes,
        hint: `Create a workflow with up to ${maxNodes} nodes. Include a trigger, processing steps, and output actions. Use connectors from the marketplace.`,
      },
    }
  },
})

// ============================================================================
// UTILITY TOOLS
// ============================================================================

const getCurrentTimeTool = tool({
  description:
    'Get the current date and time. Use this when the user asks about the current time or date.',
  inputSchema: z.object({}),
  execute: async () => ({
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    time: new Date().toLocaleTimeString('en-US'),
  }),
})

// ============================================================================
// EXPORTED TOOL SETS
// ============================================================================

/**
 * Full platform tool set for the AI chat assistant.
 * Wire into streamText({ tools: platformTools })
 */
export const platformTools = {
  searchMarketplace: searchMarketplaceTool,
  getPopularModels: getPopularModelsTool,
  suggestWorkflow: suggestWorkflowTool,
  getCurrentTime: getCurrentTimeTool,
}

/**
 * Lightweight tool set (no marketplace calls).
 * For contexts where marketplace access isn't needed.
 */
export const basicTools = {
  suggestWorkflow: suggestWorkflowTool,
  getCurrentTime: getCurrentTimeTool,
}