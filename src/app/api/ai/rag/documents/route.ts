/**
 * RAG Documents API Route
 *
 * Endpoints for managing knowledge base documents:
 * - POST: Upload/ingest a document
 * - GET: List documents for an organization
 * - DELETE: Remove a document
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { incrementUsage } from '@/lib/plans'
import {
  ingestDocument,
  listDocuments,
  deleteDocument,
  getDocument,
} from '@/lib/ai/rag'

export const dynamic = 'force-dynamic'

// ============================================================================
// SCHEMAS
// ============================================================================

const ingestSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  sourceType: z.enum(['upload', 'url', 'api', 'paste']).default('upload'),
  sourceUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  fileSizeBytes: z.number().optional(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const listSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
})

const deleteSchema = z.object({
  orgId: z.string().uuid(),
  documentId: z.string().uuid(),
})

// ============================================================================
// POST /api/ai/rag/documents — Ingest a document
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const body = await request.json()
    const validated = ingestSchema.parse(body)

    // Check storage limit before accepting upload
    const storageCheck = await evaluateEntitlement({ orgId: validated.orgId, action: 'upload_file' })
    const storageGuard = guardEntitlement(storageCheck, { orgId: validated.orgId, route: '/api/ai/rag/documents' })
    if (storageGuard) return storageGuard

    const result = await ingestDocument({
      ...validated,
      userId,
    })

    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.error, documentId: result.documentId },
        { status: 422 },
      )
    }

    // Track storage increase (fire-and-forget). Document ID is a natural
    // idempotency key — re-uploading the same doc won't double-count.
    if (validated.fileSizeBytes && result.documentId) {
      incrementUsage(validated.orgId, 'storage_gb', validated.fileSizeBytes / (1024 * 1024 * 1024), `doc-upload:${result.documentId}`).catch(() => {})
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/rag/documents', method: 'POST' },
      tags: { layer: 'api', route: 'rag-documents' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to ingest document' },
      { status: 500 },
    )
  }
}

// ============================================================================
// GET /api/ai/rag/documents — List documents
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    await requireUserId()
    const { searchParams } = new URL(request.url)

    const validated = listSchema.parse({
      orgId: searchParams.get('orgId'),
      projectId: searchParams.get('projectId') || undefined,
      limit: searchParams.get('limit') || 20,
      offset: searchParams.get('offset') || 0,
    })

    const result = await listDocuments(validated.orgId, {
      projectId: validated.projectId,
      limit: validated.limit,
      offset: validated.offset,
    })

    return NextResponse.json(result)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/rag/documents', method: 'GET' },
      tags: { layer: 'api', route: 'rag-documents' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to list documents' },
      { status: 500 },
    )
  }
}

// ============================================================================
// DELETE /api/ai/rag/documents — Delete a document
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    await requireUserId()
    const body = await request.json()
    const validated = deleteSchema.parse(body)

    // Verify document exists and user has access
    const doc = await getDocument(validated.documentId, validated.orgId)
    if (!doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      )
    }

    // Capture size before deletion for usage tracking
    const fileSizeBytes = (doc as unknown as { file_size_bytes?: number }).file_size_bytes

    await deleteDocument(validated.documentId, validated.orgId)

    // Track storage decrease AFTER successful delete (fire-and-forget).
    // Document ID is the idempotency key — prevents double-decrement on retry.
    if (fileSizeBytes) {
      incrementUsage(validated.orgId, 'storage_gb', -(fileSizeBytes / (1024 * 1024 * 1024)), `doc-delete:${validated.documentId}`).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/rag/documents', method: 'DELETE' },
      tags: { layer: 'api', route: 'rag-documents' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 },
    )
  }
}