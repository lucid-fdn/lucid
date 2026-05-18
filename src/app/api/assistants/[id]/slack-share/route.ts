import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getAssistant,
  isUserOrgMember,
  setAssistantSlackShareEnabled,
} from '@/lib/db'
import { getOrgMemberRole } from '@/lib/db/organizations'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  enabled: z.boolean(),
})

const PRIVILEGED_ROLES = new Set(['owner', 'admin'])

export const PATCH = withCSRF(
  async (request: NextRequest, ctx: unknown) => {
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

      if (!assistant.org_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const isMember = await isUserOrgMember(userId, assistant.org_id)
      if (!isMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const role = await getOrgMemberRole(userId, assistant.org_id)
      if (!role || !PRIVILEGED_ROLES.has(role)) {
        return NextResponse.json(
          { error: 'Owner or admin role required' },
          { status: 403 },
        )
      }

      const json = await request.json().catch(() => null)
      const parsed = bodySchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid body', details: parsed.error.flatten() },
          { status: 400 },
        )
      }

      await setAssistantSlackShareEnabled(id, parsed.data.enabled)
      return NextResponse.json({ ok: true, enabled: parsed.data.enabled })
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'error',
        context: { endpoint: '/api/assistants/[id]/slack-share', method: 'PATCH' },
        tags: { layer: 'api', route: 'assistant-slack-share' },
      })
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
  },
)
