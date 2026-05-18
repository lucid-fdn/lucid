import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { getWorkerLlmConfig } from '../ai/lucid-provider-config.js'
import { runAgent } from '../agent/engines/index.js'
import type { Config } from '../config.js'

const internalAgentRunSchema = z.object({
  agent: z.object({
    id: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    engine: z.enum(['openclaw', 'hermes']).optional(),
    systemPrompt: z.string().trim().min(1),
    soulContent: z.string().optional(),
    model: z.string().trim().min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(128).max(32768).optional(),
    orgId: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1).optional(),
    memoryEnabled: z.boolean().optional(),
  }),
  input: z.object({
    message: z.string().trim().min(1),
    messages: z.array(z.object({
      role: z.string().trim().min(1),
      content: z.string(),
    })).optional(),
    memories: z.array(z.string()).optional(),
    conversationId: z.string().trim().min(1).optional(),
  }),
  budget: z.object({
    maxLlmCalls: z.number().int().min(1).max(20).optional(),
    maxToolCalls: z.number().int().min(0).max(20).optional(),
    maxWallTimeMs: z.number().int().min(1000).max(300000).optional(),
    maxOutputTokens: z.number().int().min(64).max(32768).optional(),
  }).optional(),
  policy: z.object({
    allowBuiltInSkills: z.boolean().optional(),
    allowedTools: z.array(z.string().trim().min(1)).optional(),
  }).optional(),
})

export function createInternalAgentRunHandler(
  supabase: SupabaseClient,
  config: Config,
) {
  return async (req: Request, res: Response) => {
    const parsed = internalAgentRunSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid internal agent request',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const { agent, input, budget, policy } = parsed.data
    const allowedTools = policy?.allowedTools ?? []
    const allowBuiltInSkills = policy?.allowBuiltInSkills ?? false
    const runId = crypto.randomUUID()

    try {
      const result = await runAgent({
        assistant: {
          id: agent.id ?? `internal-${runId}`,
          name: agent.name,
          engine: agent.engine ?? 'openclaw',
          runtime_flavor: 'shared',
          system_prompt: agent.systemPrompt,
          soul_content: agent.soulContent ?? null,
          lucid_model: agent.model,
          temperature: agent.temperature ?? 0.2,
          max_tokens: agent.maxTokens ?? 2048,
          memory_enabled: agent.memoryEnabled ?? false,
          memory_window_size: 0,
          org_id: agent.orgId ?? null,
          passport_id: null,
          policy_config: {
            disable_builtin_skills: !allowBuiltInSkills,
            internal_allowed_tools: allowedTools,
          },
          wallet_enabled: false,
          agent_wallets: [],
          approval_required_tools: allowedTools,
        },
        conversationId: input.conversationId ?? `internal-${runId}`,
        messages: input.messages ?? [],
        memories: input.memories ?? [],
        userMessage: input.message,
        budget: {
          maxLlmCalls: budget?.maxLlmCalls ?? 4,
          maxToolCalls: allowedTools.length === 0 ? 0 : (budget?.maxToolCalls ?? allowedTools.length),
          maxWallTimeMs: budget?.maxWallTimeMs ?? 45000,
          ...(budget?.maxOutputTokens ? { maxOutputTokens: budget.maxOutputTokens } : {}),
        },
        runId,
        userId: agent.userId,
        plugins: [],
        llmConfig: getWorkerLlmConfig(config),
        supabase,
      })

      return res.json({
        text: result.text,
        usage: result.usage,
        steps: result.steps,
        toolCallsUsed: result.toolCallsUsed,
        budgetExhausted: result.budgetExhausted,
        hasProviderError: result.hasProviderError ?? false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown internal agent failure'
      console.error('[internal-agent-run] failed:', message)
      return res.status(500).json({ error: message })
    }
  }
}
