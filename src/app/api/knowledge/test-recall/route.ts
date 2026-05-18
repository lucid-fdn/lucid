import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { queryBrain } from '@/lib/brain/query'
import type { KnowledgeLayer, KnowledgePromptPacketItem } from '@/lib/knowledge/types'
import { testKnowledgeRecallSchema } from '@/features/knowledge-manager/schema'
import type { KnowledgeManagerScope, KnowledgeRecallPreview } from '@/features/knowledge-manager/types'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = testKnowledgeRecallSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({ userId, orgId: body.org_id })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await queryBrain({
      org_id: body.org_id,
      project_id: body.project_id ?? null,
      team_id: body.team_id ?? null,
      assistant_id: body.assistant_id ?? null,
      scoped_user_id: body.scoped_user_id ?? userId,
      query: body.query,
      mode: 'evidence',
      actorUserId: userId,
      surface: 'mission_control',
      audit: false,
      proofMode: body.proof_mode ?? 'optional',
      knowledgeLayers: [
        'assistant_memory',
        'team_brain',
        'project_brain',
        'org_brain',
        'rag',
        'evidence',
        'l2',
      ],
      budget: {
        max_latency_ms: 900,
        max_prompt_tokens: 2400,
        max_items_per_layer: 6,
      },
      contextLadder: {
        orgId: body.org_id,
        projectId: body.project_id ?? null,
        teamId: body.team_id ?? null,
        assistantId: body.assistant_id ?? null,
        channelType: body.channel_type ?? 'web',
        channelId: null,
        conversationId: null,
        ownerUserId: userId,
        policyHints: [
          body.runtime ? `runtime:${body.runtime}` : 'runtime:shared',
          body.engine ? `engine:${body.engine}` : 'engine:shared',
          'surface:knowledge_manager',
        ],
        summaries: [{
          layer: 'org',
          text: 'Operator is testing the exact knowledge packet that would be injected before an agent answer.',
        }],
      },
      evalCapture: {
        enabled: true,
        surface: 'mission_control',
        actorUserId: userId,
        metadata: {
          source: 'knowledge_manager_test_recall',
          runtime: body.runtime ?? 'shared',
          engine: body.engine ?? 'shared',
        },
      },
    })
    const packet = result.packet

    const scope = resolvePreviewScope(body)
    const preview: KnowledgeRecallPreview = {
      requestId: packet.generatedAt,
      query: body.query,
      scope,
      items: packet.items.map(mapPacketItem),
      omitted: packet.omitted.map((item) => ({
        layer: item.layer,
        reason: item.reason,
        count: item.count ?? 0,
      })),
      readyForAgents: packet.items.length > 0 && !packet.telemetry.timedOut,
    }

    return NextResponse.json({ preview, packetTelemetry: packet.telemetry })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/test-recall', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to test knowledge recall' }, { status: 500 })
  }
})

function mapPacketItem(item: KnowledgePromptPacketItem): KnowledgeRecallPreview['items'][number] {
  return {
    id: item.id,
    label: item.label,
    layer: mapLayer(item.layer),
    content: item.content,
    sourceLabel: item.sourceLabel ?? null,
    citations: item.citationKeys,
    confidence: item.confidence ?? null,
  }
}

function mapLayer(layer: KnowledgeLayer): KnowledgeRecallPreview['items'][number]['layer'] {
  if (layer === 'org_brain') return 'workspace'
  if (layer === 'project_brain') return 'project'
  if (layer === 'team_brain') return 'team'
  if (layer === 'assistant_memory') return 'agent'
  if (layer === 'rag') return 'document'
  if (layer === 'l2') return 'proof'
  return 'evidence'
}

function resolvePreviewScope(body: z.infer<typeof testKnowledgeRecallSchema>): KnowledgeManagerScope {
  if (body.assistant_id) return { type: 'agent', orgId: body.org_id, projectId: body.project_id ?? null, assistantId: body.assistant_id, label: 'Agent' }
  if (body.team_id) return { type: 'team', orgId: body.org_id, projectId: body.project_id ?? null, teamId: body.team_id, label: 'Team' }
  if (body.project_id) return { type: 'project', orgId: body.org_id, projectId: body.project_id, label: 'Project' }
  return { type: 'workspace', orgId: body.org_id, label: 'Workspace' }
}
