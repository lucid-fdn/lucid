import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeById, updateRuntimeL2Status, updateRuntimeStatus } from '@/lib/db/mission-control'
import { getL2BaseUrl } from '@/lib/deployment-mode'
import { ErrorService } from '@/lib/errors/error-service'
import type { L2DeployStatus } from '@/lib/mission-control/types'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'

export const dynamic = 'force-dynamic'

function normalizeL2StatusPayload(
  payload: {
    status?: string | { status?: string; health?: string; url?: string; deployment_id?: string; error?: string }
    health?: string
    url?: string
    error?: string
  },
  fallbackUrl?: string | null,
  fallbackError?: string | null,
): L2DeployStatus {
  const nested = typeof payload.status === 'object' && payload.status ? payload.status : null
  return {
    status: (nested?.status ?? payload.status ?? 'deploying') as L2DeployStatus['status'],
    health: (nested?.health ?? payload.health) as L2DeployStatus['health'],
    url: nested?.url ?? payload.url ?? fallbackUrl ?? undefined,
    error: nested?.error ?? payload.error ?? fallbackError ?? undefined,
  }
}

function getCachedL2Status(runtime: {
  lastL2Status: string | null
  lastL2Error: string | null
  deploymentUrl: string | null
}): L2DeployStatus | null {
  if (!runtime.lastL2Status) return null

  try {
    const parsed = JSON.parse(runtime.lastL2Status) as {
      status?: string | { status?: string; health?: string; url?: string; deployment_id?: string; error?: string }
      health?: string
      url?: string
      error?: string
    }
    if (parsed && typeof parsed === 'object') {
      return normalizeL2StatusPayload(parsed, runtime.deploymentUrl, runtime.lastL2Error)
    }
  } catch {
    return {
      status: runtime.lastL2Status as L2DeployStatus['status'],
      url: runtime.deploymentUrl ?? undefined,
      error: runtime.lastL2Error ?? undefined,
    }
  }

  return null
}

// GET /api/runtimes/[id]/l2-status?org_id=xxx
// Proxies L2 Gateway status, persists snapshot to dedicated_runtimes row.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    // No passport ID — manual deploy, local self-hosted fallback, or older
    // runtime without L2 integration.
    if (!runtime.l2PassportId) {
      const cached = getCachedL2Status(runtime)
      if (cached) {
        return NextResponse.json({ l2Status: cached })
      }

      if (runtime.status === 'connected' && runtime.deploymentUrl) {
        return NextResponse.json({
          l2Status: {
            status: 'running',
            health: 'healthy',
            url: runtime.deploymentUrl,
          },
        })
      }

      return NextResponse.json({ l2Status: null })
    }

    const l2Base = getL2BaseUrl()
    if (!l2Base) {
      return NextResponse.json({ l2Status: getCachedL2Status(runtime) })
    }

    let l2Status = getCachedL2Status(runtime)
    try {
      const l2Res = await fetch(
        `${l2Base}/v1/agents/${encodeURIComponent(runtime.l2PassportId)}/status`,
        {
          headers: {
            ...getL2AdminAuthHeaders(),
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!l2Res.ok) {
        await updateRuntimeL2Status(id, 'unknown', `L2 returned ${l2Res.status}`)
        return NextResponse.json({ l2Status })
      }

      const data = (await l2Res.json()) as {
        status?: string | { status?: string; health?: string; url?: string; deployment_id?: string; error?: string }
        health?: string
        url?: string
        error?: string
      }

      l2Status = normalizeL2StatusPayload(data, runtime.deploymentUrl, runtime.lastL2Error)
    } catch (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { endpoint: '/api/runtimes/[id]/l2-status GET', runtimeId: id, fallback: 'cached' },
        tags: { layer: 'api', route: 'runtimes' },
      })
      return NextResponse.json({ l2Status })
    }

    const isTerminalFailure =
      l2Status.status === 'failed' ||
      l2Status.status === 'terminated' ||
      l2Status.health === 'unhealthy'

    const snapshotError =
      l2Status.error ??
      (isTerminalFailure
        ? `L2 reported ${l2Status.status}${l2Status.health ? ` (${l2Status.health})` : ''}`
        : undefined)

    // Persist snapshot — fire-and-forget (non-blocking)
    updateRuntimeL2Status(id, l2Status.status, snapshotError).catch(() => {})
    if (isTerminalFailure && runtime.status !== 'failed' && runtime.status !== 'revoked') {
      updateRuntimeStatus(id, orgId, 'failed').catch(() => {})
    }

    return NextResponse.json({ l2Status })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/l2-status GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
