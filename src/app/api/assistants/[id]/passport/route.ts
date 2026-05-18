import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { getAgentPassport, ensureAssistantPassport } from '@/lib/ai/passports'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { insertReceiptEvent } from '@/lib/db/mission-control'

export const dynamic = 'force-dynamic'

/**
 * GET /api/assistants/[id]/passport
 *
 * Fetch L2 passport identity for an assistant.
 * Returns { passport: Passport } or { passport: null } if not provisioned.
 */
export async function GET(_req: NextRequest, ctx: unknown) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params

    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    if (assistant.org_id) {
      const isMember = await isUserOrgMember(userId, assistant.org_id)
      if (!isMember) {
        return NextResponse.json(
          { error: 'You do not have access to this assistant' },
          { status: 403 },
        )
      }
    }

    if (!assistant.passport_id) {
      return NextResponse.json({ passport: null })
    }

    const passport = await getAgentPassport(assistant.passport_id)
    return NextResponse.json({ passport })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/passport', method: 'GET' },
      tags: { layer: 'api', route: 'assistants' },
    })
    return NextResponse.json(
      { error: 'Failed to fetch passport' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/assistants/[id]/passport
 *
 * On-demand retry: provision a passport for an assistant that doesn't have one.
 * Idempotent — if passport_id is already set, returns it without creating a new one.
 */
export const POST = withCSRF(async (_req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params

    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    if (assistant.org_id) {
      const isMember = await isUserOrgMember(userId, assistant.org_id)
      if (!isMember) {
        return NextResponse.json(
          { error: 'You do not have access to this assistant' },
          { status: 403 },
        )
      }
    }

    const passportId = await ensureAssistantPassport({
      assistantId: id,
      existingPassportId: assistant.passport_id ?? null,
      name: assistant.name,
      orgId: assistant.org_id ?? undefined,
    })

    if (!passportId) {
      return NextResponse.json(
        { error: 'Failed to provision passport (L2 unavailable or not configured)' },
        { status: 502 },
      )
    }

    const passport = await getAgentPassport(passportId)

    // Emit feed event (fire-and-forget)
    if (assistant.org_id) {
      insertReceiptEvent({
        agentId: id,
        orgId: assistant.org_id,
        eventType: 'passport_provisioned',
        payload: {
          passport_id: passportId,
          passport_name: passport?.name ?? null,
          owner: passport?.owner ?? null,
          chain_tx: passport?.onChain?.tx ?? null,
          chain_pda: passport?.onChain?.pda ?? null,
        },
      }).catch(() => {})
    }

    return NextResponse.json({ passport })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/passport', method: 'POST' },
      tags: { layer: 'api', route: 'assistants' },
    })
    return NextResponse.json(
      { error: 'Failed to provision passport' },
      { status: 500 },
    )
  }
})
