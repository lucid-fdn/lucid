/**
 * Conversations API Route
 *
 * Endpoints for managing AI chat conversations:
 * - GET: List conversations for current user
 * - POST: Create a new conversation
 * - DELETE: Remove a conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import {
  getConversations,
  createConversation,
  deleteConversation,
} from '@/lib/ai/service'

export const dynamic = 'force-dynamic'

// ============================================================================
// SCHEMAS
// ============================================================================

const listSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  limit: z.coerce.number().min(1).max(100).default(50),
})

const createSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  envId: z.string().uuid().optional(),
  title: z.string().min(1).max(500).default('New Chat'),
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
})

const deleteSchema = z.object({
  conversationId: z.string().uuid(),
})

// ============================================================================
// GET /api/ai/conversations — List conversations
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const { searchParams } = new URL(request.url)

    const validated = listSchema.parse({
      orgId: searchParams.get('orgId'),
      projectId: searchParams.get('projectId'),
      limit: searchParams.get('limit') || 50,
    })

    const conversations = await getConversations(
      userId,
      validated.projectId,
      validated.limit,
    )

    return NextResponse.json({ conversations })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/conversations', method: 'GET' },
      tags: { layer: 'api', route: 'conversations' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to list conversations' },
      { status: 500 },
    )
  }
}

// ============================================================================
// POST /api/ai/conversations — Create a new conversation
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const body = await request.json()
    const validated = createSchema.parse(body)

    const conversation = await createConversation({
      user_id: userId,
      org_id: validated.orgId,
      project_id: validated.projectId,
      ...(validated.envId ? { env_id: validated.envId } : {}),
      title: validated.title,
      model: validated.model,
      system_prompt: validated.systemPrompt,
    })

    return NextResponse.json({ conversation }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/conversations', method: 'POST' },
      tags: { layer: 'api', route: 'conversations' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 },
    )
  }
}

// ============================================================================
// DELETE /api/ai/conversations — Delete a conversation
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const body = await request.json()
    const validated = deleteSchema.parse(body)

    await deleteConversation(validated.conversationId, userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/conversations', method: 'DELETE' },
      tags: { layer: 'api', route: 'conversations' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 },
    )
  }
}