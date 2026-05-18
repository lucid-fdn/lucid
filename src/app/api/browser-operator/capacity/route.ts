import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid(),
})

export async function GET(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('orgId'),
    })
    await requireAgentCommerceOrgMembership(userId, query.orgId)
    const gateway = await readGatewayHealth()
    return browserOperatorOk({
      capacity: {
        default_provider: process.env.BROWSER_OPERATOR_DEFAULT_PROVIDER ?? 'playwright',
        external_providers_enabled: envFlag('BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED'),
        byo_providers_enabled: envFlag('BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED'),
        premium_fallback_enabled: envFlag('BROWSER_OPERATOR_PREMIUM_FALLBACK_ENABLED'),
        gateway,
      },
    }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

async function readGatewayHealth(): Promise<Record<string, unknown> | null> {
  const baseUrl = process.env.BROWSER_QA_CONTROL_URL
  if (!baseUrl) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(new URL('/pool-health', baseUrl).toString(), {
      headers: process.env.BROWSER_QA_CONTROL_TOKEN
        ? { authorization: `Bearer ${process.env.BROWSER_QA_CONTROL_TOKEN}` }
        : undefined,
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    return {
      ok: response.ok,
      status: response.status,
      payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').trim().toLowerCase())
}
