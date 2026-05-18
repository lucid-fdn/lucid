import 'server-only'

import { z } from 'zod'

import { generateStructuredObject } from '@/lib/ai/generation'
import type { BrainIntakeClassifyRequest, BrainIntakeDraftItem } from './schema'

const AI_TIMEOUT_MS = 3500

const PlannedItemSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(4000),
  destination: z.enum(['context', 'knowledge_fact', 'knowledge_document', 'knowledge_source', 'recall_test']),
  kind: z.enum(['instruction', 'fact', 'document', 'source_url', 'recall_question']),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(500),
  warnings: z.array(z.string().max(240)).default([]),
})

const PlannerSchema = z.object({
  items: z.array(PlannedItemSchema).max(12),
})

export async function planBrainIntakeWithAI(input: {
  request: BrainIntakeClassifyRequest
  deterministicItems: BrainIntakeDraftItem[]
  userId: string
}): Promise<BrainIntakeDraftItem[] | null> {
  if (process.env.LUCID_BRAIN_INTAKE_AI_PLANNER_ENABLED !== 'true') return null
  const text = input.request.text.trim()
  if (text.length < 40 || text.length > 40_000) return null

  try {
    const result = await withTimeout(
      generateStructuredObject({
        model: process.env.LUCID_BRAIN_INTAKE_MODEL ?? 'gpt-4.1-mini',
        provider: 'auto',
        schema: PlannerSchema,
        temperature: 0,
        maxTokens: 1800,
        system: [
          'You classify user-provided company Brain input for a SaaS agent platform.',
          'Split mixed input into context, facts, documents, sources, or recall tests.',
          'Be conservative. Do not invent facts. Keep bodies concise and source-grounded.',
          'Policies, operating rules, decisions, risks, and strategy belong in context.',
          'Stable factual claims belong in knowledge_fact.',
          'Long pasted content belongs in knowledge_document.',
          'Questions asking what agents would remember belong in recall_test.',
        ].join('\n'),
        messages: [{
          role: 'user',
          content: [
            `Existing deterministic items:\n${JSON.stringify(input.deterministicItems.slice(0, 8))}`,
            `Raw text:\n${text.slice(0, 20_000)}`,
          ].join('\n\n'),
        }],
        telemetry: {
          userId: input.userId,
          orgId: input.request.orgId,
          feature: 'brain-intake-ai-planner',
        },
      }),
      AI_TIMEOUT_MS,
    )

    const planned: BrainIntakeDraftItem[] = result.object.items.map((item) => ({
      id: `ai-${item.id}`,
      kind: item.kind,
      destination: item.destination,
      selected: true,
      title: item.title,
      body: item.body,
      confidence: item.confidence,
      requiresReview: item.confidence < 0.82 || item.warnings.length > 0,
      warnings: item.warnings,
      url: undefined,
      fileName: undefined,
      mimeType: undefined,
      contextRecordType: undefined,
      explanation: `AI planner: ${item.explanation}`,
      citations: [],
      extractedFacts: item.destination === 'knowledge_fact'
        ? [{ text: item.body, confidence: item.confidence, citationKeys: [] }]
        : [],
      conflicts: [],
      suggestedScope: 'workspace' as const,
      trustLevel: item.destination === 'context' ? 'operator_approved' as const : 'observed' as const,
      priority: 'normal' as const,
      freshness: 'unknown' as const,
      recommendedAction: item.confidence < 0.82 ? 'review' as const : 'store' as const,
    }))

    return planned.length > 0 ? planned : null
  } catch {
    return null
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('Brain intake AI planner timed out')), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
