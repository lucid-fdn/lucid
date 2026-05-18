import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_EXTERNAL_HOST_IDS,
  buildAgentOpsExternalHostPack,
  contentTypeForHostPack,
  renderAgentOpsExternalHostInstructions,
} from '@/lib/agent-ops'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const hostIdSchema = z.enum(AGENT_OPS_EXTERNAL_HOST_IDS)

type RouteContext = {
  params: Promise<{ hostId: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const parsedHostId = hostIdSchema.safeParse(params.hostId)
    if (!parsedHostId.success) {
      return NextResponse.json({ error: 'Unknown Agent Ops external host pack' }, { status: 404 })
    }

    const pack = buildAgentOpsExternalHostPack({ hostId: parsedHostId.data })
    const instructions = renderAgentOpsExternalHostInstructions({ hostId: parsedHostId.data })

    if (req.nextUrl.searchParams.get('format') === 'raw') {
      return new NextResponse(instructions, {
        headers: {
          'content-type': contentTypeForHostPack(pack.pack.format),
          'cache-control': 'private, max-age=60',
          'x-lucid-agent-ops-host-pack': pack.pack.id,
          'x-lucid-agent-ops-install-target': pack.pack.installTarget,
        },
      })
    }

    return NextResponse.json({
      pack,
      instructions,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/external-host-packs/[hostId]', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to fetch Agent Ops external host pack' }, { status: 500 })
  }
}
