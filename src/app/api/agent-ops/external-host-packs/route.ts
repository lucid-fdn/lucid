import { NextRequest, NextResponse } from 'next/server'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  buildAgentOpsExternalHostInstallerManifest,
  buildAgentOpsExternalHostPackManifest,
  listAgentOpsExternalHostPacks,
} from '@/lib/agent-ops'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      manifest: buildAgentOpsExternalHostPackManifest(),
      installerManifest: buildAgentOpsExternalHostInstallerManifest({ baseUrl: req.nextUrl.origin }),
      packs: listAgentOpsExternalHostPacks(),
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/external-host-packs', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list Agent Ops external host packs' }, { status: 500 })
  }
}
