import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import {
  BrainIntakeCommitRequestSchema,
  type BrainIntakeDraftItem,
} from '@/lib/brain-intake/schema'
import { rememberBrain } from '@/lib/brain'
import type { BrainGuidanceKind, BrainRememberKind } from '@/lib/brain'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = BrainIntakeCommitRequestSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const results = []
    for (const item of body.items) {
      if (!item.selected) {
        results.push({
          itemId: item.id,
          destination: item.destination,
          status: 'skipped' as const,
          message: 'Not selected.',
        })
        continue
      }

      if (item.recommendedAction === 'skip') {
        results.push({
          itemId: item.id,
          destination: item.destination,
          status: 'skipped' as const,
          message: item.duplicateOf
            ? `Skipped duplicate of "${item.duplicateOf.title}".`
            : 'Skipped by Brain intake recommendation.',
        })
        continue
      }

      results.push(await commitItem({
        orgId: body.orgId,
        scopeId: body.scopeId,
        userId,
        item,
      }))
    }

    return NextResponse.json({ results })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/brain/intake/commit', method: 'POST' },
      tags: { layer: 'api', route: 'brain-intake' },
    })
    return NextResponse.json({ error: 'Failed to save Brain input' }, { status: 500 })
  }
})

async function commitItem(input: {
  orgId: string
  scopeId: string
  userId: string
  item: BrainIntakeDraftItem
}) {
  const { orgId, scopeId, userId, item } = input

  if (item.destination === 'recall_test') {
    return {
      itemId: item.id,
      destination: item.destination,
      status: 'skipped' as const,
      message: 'Opened as a recall test instead of storing.',
      recallQuery: item.body,
    }
  }

  if (item.destination === 'knowledge_document' && (!item.body.trim() || item.warnings.length > 0)) {
    return {
      itemId: item.id,
      destination: item.destination,
      status: 'needs_upload' as const,
      message: 'Binary or unreadable files need the document uploader.',
    }
  }

  const result = await rememberBrain({
    org_id: orgId,
    kind: mapDestinationToRememberKind(item.destination),
    title: item.title,
    body: item.body,
    url: item.url ?? null,
    file_name: item.fileName ?? null,
    mime_type: item.mimeType ?? null,
    guidance_kind: item.destination === 'context'
      ? mapContextRecordTypeToGuidanceKind(item.contextRecordType)
      : undefined,
    confidence: item.destination === 'knowledge_fact'
      ? Math.max(0.62, item.confidence)
      : item.confidence,
    metadata: {
      managedBy: 'brain_intake',
      intakeItemId: item.id,
      intakeKind: item.kind,
      intakeDestination: item.destination,
      intakeScopeId: scopeId,
      classifierConfidence: item.confidence,
      warnings: item.warnings,
      suggestedScope: item.suggestedScope,
      trustLevel: item.trustLevel,
      priority: item.priority,
      freshness: item.freshness,
      recommendedAction: item.recommendedAction,
      duplicateOf: item.duplicateOf ?? null,
      conflicts: item.conflicts,
      citations: item.citations,
      extractedFacts: item.extractedFacts,
      explanation: item.explanation,
      visibility: 'org',
      retentionPolicy: 'standard',
      refreshPolicy: item.url ? 'on_change' : 'manual',
    },
    actorUserId: userId,
    surface: 'app_api',
  })

  return {
    itemId: item.id,
    destination: item.destination,
    status: result.status,
    id: result.id,
    message: toIntakeMessage(item.destination, result.message),
  }
}

function mapDestinationToRememberKind(destination: BrainIntakeDraftItem['destination']): BrainRememberKind {
  if (destination === 'context') return 'guidance'
  if (destination === 'knowledge_fact') return 'fact'
  if (destination === 'knowledge_document') return 'document'
  if (destination === 'knowledge_source') return 'source'
  return 'recall_test'
}

function mapContextRecordTypeToGuidanceKind(recordType: BrainIntakeDraftItem['contextRecordType']): BrainGuidanceKind {
  if (
    recordType === 'policy' ||
    recordType === 'decision' ||
    recordType === 'risk' ||
    recordType === 'thesis' ||
    recordType === 'signal' ||
    recordType === 'open_question'
  ) {
    return recordType
  }
  return 'memory'
}

function toIntakeMessage(destination: BrainIntakeDraftItem['destination'], message: string) {
  if (destination === 'context') return message.replace('Guidance', 'Context')
  if (destination === 'knowledge_fact') return message.replace('Brain', 'Knowledge')
  return message
}
