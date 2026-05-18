import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { incrementUsage } from '@/lib/plans'
import { ingestDocument, listDocuments } from '@/lib/rag'
import { createKnowledgeDocumentSchema } from '@/features/knowledge-manager/schema'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const orgId = req.nextUrl.searchParams.get('org_id')
    if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 })

    const access = await resolveKnowledgeManagerAccess({ userId, orgId })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await listDocuments(orgId, {
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      limit: 100,
    })
    return NextResponse.json(result)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/documents', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge documents' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createKnowledgeDocumentSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    if (body.team_id || body.assistant_id) {
      return NextResponse.json({
        error: 'Document ingestion currently supports workspace and project scopes. Use facts for team/agent scoped guidance until scoped document partitioning is enabled.',
      }, { status: 409 })
    }

    const storageCheck = await evaluateEntitlement({ orgId: body.org_id, action: 'upload_file' })
    const storageGuard = guardEntitlement(storageCheck, { orgId: body.org_id, route: '/api/knowledge/documents' })
    if (storageGuard) return storageGuard

    const result = await ingestDocument({
      orgId: body.org_id,
      projectId: body.project_id ?? undefined,
      userId,
      title: body.title,
      content: body.content,
      sourceType: body.source_type === 'file' ? 'upload' : body.source_type,
      sourceUrl: body.source_url ?? undefined,
      fileName: body.file_name ?? undefined,
      fileSizeBytes: body.file_size_bytes ?? undefined,
      mimeType: body.mime_type ?? undefined,
      scope: 'org',
      metadata: {
        managedBy: 'knowledge_manager',
        trustLevel: body.trust_level ?? 'operator_approved',
        visibility: body.visibility ?? (body.project_id ? 'project' : 'org'),
        retentionPolicy: body.retention_policy ?? 'standard',
        refreshPolicy: body.refresh_policy ?? 'manual',
      },
    })

    if (result.status === 'error') {
      return NextResponse.json({ error: result.error, documentId: result.documentId }, { status: 422 })
    }

    if (body.file_size_bytes && result.documentId) {
      incrementUsage(
        body.org_id,
        'storage_gb',
        body.file_size_bytes / (1024 * 1024 * 1024),
        `knowledge-doc-upload:${result.documentId}`,
      ).catch(() => {})
    }

    return NextResponse.json({ document: result }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/documents', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to ingest knowledge document' }, { status: 500 })
  }
})
