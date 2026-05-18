import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getAssistant,
  getAssistantSkills,
  getOrgSkills,
  activateSkill,
  deactivateSkill,
  updateSkillOrder,
  isUserOrgMember,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/assistants/[id]/skills
 * List skills activated for this assistant + available org skills.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(_req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params

    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [activations, orgSkills] = await Promise.all([
      getAssistantSkills(assistantId),
      getOrgSkills(assistant.org_id),
    ])

    return NextResponse.json({
      activations,
      orgSkills,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/skills', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-skills' },
    })
    return NextResponse.json({ error: 'Failed to load skills' }, { status: 500 })
  }
}

/**
 * POST /api/assistants/[id]/skills
 * Activate a skill for this assistant.
 * Body: { installationId: string, sortOrder?: number }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params

    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { installationId, sortOrder } = body as { installationId: string; sortOrder?: number }

    if (!installationId) {
      return NextResponse.json({ error: 'installationId is required' }, { status: 400 })
    }

    const result = await activateSkill(assistantId, installationId, sortOrder)
    if (!result) {
      return NextResponse.json({ error: 'Failed to activate skill. It may already be active.' }, { status: 409 })
    }

    return NextResponse.json({ activation: result }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/skills', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-skills' },
    })
    return NextResponse.json({ error: 'Failed to activate skill' }, { status: 500 })
  }
}

/**
 * PATCH /api/assistants/[id]/skills
 * Update sort_order for an activation.
 * Body: { activationId: string, sortOrder: number }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params

    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { activationId, sortOrder } = body as { activationId: string; sortOrder: number }

    if (!activationId || sortOrder === undefined) {
      return NextResponse.json({ error: 'activationId and sortOrder are required' }, { status: 400 })
    }

    const success = await updateSkillOrder(activationId, sortOrder, assistantId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to update skill order' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/skills', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-skills' },
    })
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 })
  }
}

/**
 * DELETE /api/assistants/[id]/skills
 * Deactivate (remove) a skill from this assistant.
 * Body: { activationId: string }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params

    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { activationId } = body as { activationId: string }

    if (!activationId) {
      return NextResponse.json({ error: 'activationId is required' }, { status: 400 })
    }

    const success = await deactivateSkill(assistantId, activationId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to deactivate skill' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/skills', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-skills' },
    })
    return NextResponse.json({ error: 'Failed to deactivate skill' }, { status: 500 })
  }
}
