import 'server-only'

import { NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeById } from '@/lib/db/mission-control'
import { getL2BaseUrl } from '@/lib/deployment-mode'
import { ErrorService } from '@/lib/errors/error-service'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'

interface ProxyOptions {
  runtimeId: string
  orgId: string
  /** L2 path segment after /v1/agents/{passportId}/ */
  path: string
  method?: string
  body?: unknown
  /** Query string to append */
  query?: string
}

interface ProxySuccess {
  ok: true
  data: unknown
  runtime: { id: string; l2PassportId: string; provider: string }
}

interface ProxyError {
  ok: false
  response: NextResponse
}

/**
 * Shared proxy helper for L2 Gateway calls.
 *
 * 1. Auth check (userId + org membership)
 * 2. Get runtime from DB → l2PassportId
 * 3. Fetch L2 with Bearer auth
 * 4. Return normalized response
 */
export async function proxyToL2(options: ProxyOptions): Promise<ProxySuccess | ProxyError> {
  const userId = await getUserId()
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const isMember = await isUserOrgMember(userId, options.orgId)
  if (!isMember) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const runtime = await getRuntimeById(options.runtimeId, options.orgId)
  if (!runtime) {
    return { ok: false, response: NextResponse.json({ error: 'Runtime not found' }, { status: 404 }) }
  }

  if (!runtime.l2PassportId) {
    return { ok: false, response: NextResponse.json({ error: 'Unmanaged runtime — no L2 passport' }, { status: 404 }) }
  }

  const l2Base = getL2BaseUrl()
  if (!l2Base) {
    return { ok: false, response: NextResponse.json({ error: 'L2 Gateway not configured' }, { status: 502 }) }
  }

  const url = `${l2Base}/v1/agents/${encodeURIComponent(runtime.l2PassportId)}/${options.path}${options.query ? `?${options.query}` : ''}`

  try {
    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers: {
        ...getL2AdminAuthHeaders(),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    }

    if (options.body && options.method && options.method !== 'GET') {
      fetchOptions.body = JSON.stringify(options.body)
    }

    const l2Res = await fetch(url, fetchOptions)

    if (!l2Res.ok) {
      const errText = await l2Res.text().catch(() => '')
      return {
        ok: false,
        response: NextResponse.json(
          { error: `L2 returned ${l2Res.status}`, detail: errText },
          { status: l2Res.status >= 500 ? 502 : l2Res.status }
        ),
      }
    }

    const data = await l2Res.json()
    return {
      ok: true,
      data,
      runtime: { id: runtime.id, l2PassportId: runtime.l2PassportId, provider: runtime.provider },
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: `L2 proxy: ${options.path}` },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return {
      ok: false,
      response: NextResponse.json({ error: 'L2 Gateway unavailable' }, { status: 502 }),
    }
  }
}
