import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import {
  addProviderKey,
  getProviderKeys,
  SUPPORTED_PROVIDERS,
  type ProviderType,
} from '@/lib/db/provider-keys'
import { getOrgMemberRole } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const addKeySchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS as unknown as [string, ...string[]]),
  key: z.string().min(10, 'API key is too short'),
  keyName: z.string().max(100).optional(),
})

const WRITE_ROLES = new Set(['owner', 'admin'])

function isProviderKeyValidationError(error: Error) {
  const message = error.message.toLowerCase()
  return message.includes('invalid')
    || message.includes('api key')
    || message.includes('keys should start')
    || message.includes('unsupported provider')
}

// GET /api/orgs/[id]/provider-keys — list provider keys (safe fields only)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId()
    const { id: orgId } = await params
    const role = await getOrgMemberRole(userId, orgId)
    if (!role) {
      return NextResponse.json({ error: 'Organization membership required' }, { status: 403 })
    }

    const keys = await getProviderKeys(orgId)

    return NextResponse.json({ keys })
  } catch (error) {
    ErrorService.captureException(error, {
      context: { operation: 'GET /api/orgs/[id]/provider-keys' },
    })
    return NextResponse.json(
      { error: 'Failed to fetch provider keys' },
      { status: 500 }
    )
  }
}

// POST /api/orgs/[id]/provider-keys — add a new provider key
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await requireUserId()
    const { id: orgId } = (await (ctx as { params: Promise<{ id: string }> }).params)
    const role = await getOrgMemberRole(userId, orgId)
    if (!WRITE_ROLES.has(role ?? '')) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const body = await req.json()

    const validated = addKeySchema.parse(body)

    const key = await addProviderKey({
      orgId,
      provider: validated.provider as ProviderType,
      key: validated.key,
      keyName: validated.keyName,
      userId,
    })

    return NextResponse.json({ key }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    // Check for format validation errors from our service.
    if (error instanceof Error && isProviderKeyValidationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error instanceof Error && error.message.includes('TrustGate provider key sync failed')) {
      return NextResponse.json(
        { error: 'Provider key could not be synced to TrustGate. Try again.' },
        { status: 502 },
      )
    }

    ErrorService.captureException(error, {
      context: { operation: 'POST /api/orgs/[id]/provider-keys' },
    })
    return NextResponse.json(
      { error: 'Failed to add provider key' },
      { status: 500 }
    )
  }
})
