import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRuntime } from '../_auth'
import { supabase } from '@/lib/db/client'
import { writeAIGenerationEvent } from '@/lib/ai/control-plane/events'
import type { AIFeature, AIModality } from '@/lib/ai/control-plane/types'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const aiGenerationReceiptSchema = z.object({
  runId: z.string().min(1),
  agentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  feature: z.enum([
    'ai-chat',
    'workflow-generation',
    'project-generation',
    'image-generation',
    'agent-avatar-generation',
    'agent-cover-generation',
    'generic-image-generation',
    'voice-preview',
    'voice-reply',
    'transcription',
    'agent-run',
  ]),
  modality: z.enum([
    'text',
    'structured',
    'embedding',
    'image',
    'transcription',
    'speech',
    'builder',
    'agent-run',
  ]),
  prompt: z.string().min(1).max(100_000),
  success: z.boolean(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    imageTokens: z.number().int().nonnegative().optional(),
    textTokens: z.number().int().nonnegative().optional(),
    bytes: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().nonnegative().optional(),
  }).optional(),
  receipt: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  error: z.string().max(20_000).optional(),
})

// POST /api/runtimes/ai-generation-events — Runtime-authenticated AI generation receipt ingest.
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = aiGenerationReceiptSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const receipt = parsed.data
    let assistantId: string | null = receipt.agentId ?? null
    let projectId: string | null = receipt.projectId ?? null
    let userId: string | null = receipt.userId ?? null

    if (receipt.agentId) {
      const { data: assistant, error } = await supabase
        .from('ai_assistants')
        .select('id, org_id, project_id, created_by')
        .eq('id', receipt.agentId)
        .eq('org_id', runtime.orgId)
        .maybeSingle()

      if (error) throw error

      if (assistant) {
        assistantId = assistant.id
        projectId = assistant.project_id ?? projectId
        userId = assistant.created_by ?? userId
      }
    }

    if (!userId) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'No profile owner could be resolved for this AI generation receipt.',
      }, { status: 202 })
    }

    const generationEventId = await writeAIGenerationEvent({
      context: {
        userId,
        orgId: runtime.orgId,
        assistantId,
        projectId,
      },
      feature: receipt.feature as AIFeature,
      modality: receipt.modality as AIModality,
      prompt: receipt.prompt,
      success: receipt.success,
      model: receipt.model,
      provider: receipt.provider,
      usage: receipt.usage,
      metadata: {
        ...receipt.metadata,
        source: 'runtime',
        runtimeId: runtime.id,
        runtimeGeneration: runtime.generation,
        runId: receipt.runId,
        receipt: receipt.receipt ?? null,
      },
      error: receipt.error,
    })

    return NextResponse.json({ success: true, generationEventId })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/ai-generation-events' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
