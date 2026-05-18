import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { runExternalKnowledgeOperation } from '@/lib/knowledge/external-operation-runner'

export const dynamic = 'force-dynamic'

const externalOperationBodySchema = z.object({
  operation: z.string().min(1).max(160),
  input: z.unknown().optional(),
}).passthrough()

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const token = parseBearerToken(req.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })

  const parsed = externalOperationBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }

  const operationInput = parsed.data.input === undefined
    ? omitOperation(parsed.data)
    : parsed.data.input
  const result = await runExternalKnowledgeOperation({
    token,
    operation: parsed.data.operation,
    input: operationInput,
    surface: 'external_agent',
  })

  return NextResponse.json(result.envelope, { status: result.status })
}

function parseBearerToken(value: string | null): string | null {
  if (!value) return null
  const match = /^Bearer\s+(.+)$/i.exec(value.trim())
  return match?.[1] ?? null
}

function omitOperation(value: Record<string, unknown>): Record<string, unknown> {
  const { operation: _operation, ...rest } = value
  return rest
}
