import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getAgentOpsBrowserHostPlaybook,
  isUserOrgMember,
  updateAgentOpsBrowserHostPlaybookTrustState,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
})

const patchBodySchema = z.object({
  org_id: z.string().uuid(),
  action: z.enum(['promote', 'deprecate', 'quarantine', 'block']),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const playbook = await getAgentOpsBrowserHostPlaybook({
      orgId: parsed.data.orgId,
      playbookId: id,
    })
    if (!playbook) {
      return NextResponse.json({ error: 'Browser host playbook not found' }, { status: 404 })
    }

    return NextResponse.json({ playbook })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-host-playbooks/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to load browser host playbook' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async (
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = patchBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const playbook = await updateAgentOpsBrowserHostPlaybookTrustState({
      orgId: body.org_id,
      playbookId: id,
      trustState: trustStateForAction(body.action),
      metadata: {
        ...(body.metadata ?? {}),
        last_trust_action: body.action,
        last_trust_action_by: userId,
        last_trust_action_at: new Date().toISOString(),
      },
    })

    return NextResponse.json({ playbook })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-host-playbooks/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update browser host playbook' }, { status: 500 })
  }
})

function trustStateForAction(action: z.infer<typeof patchBodySchema>['action']) {
  switch (action) {
    case 'promote':
      return 'active'
    case 'deprecate':
      return 'deprecated'
    case 'quarantine':
      return 'quarantined'
    case 'block':
      return 'blocked'
  }
}
