import 'server-only'

import crypto from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import {
  BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG,
  evaluateBrowserOperatorCredentialAccess,
} from '@/lib/browser-operator/credential-safety'
import {
  getBrowserOperatorCredentialRef,
  markBrowserOperatorCredentialAccessed,
  recordBrowserOperatorAuditEvent,
} from '@/lib/db/browser-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const AUTH_WINDOW_MS = 5 * 60_000

const credentialAccessSchema = z.object({
  orgId: z.string().uuid(),
  credentialRefId: z.string().uuid(),
  opsRunId: z.string().uuid().optional(),
  browserAccountId: z.string().uuid().optional(),
  actorType: z.enum(['user', 'agent', 'runtime', 'provider', 'system']).optional(),
  actorId: z.string().max(255).optional(),
  reason: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const requestId = browserOperatorRequestId(request)
  const rawBody = await request.text()

  if (!verifyBrowserOperatorInternalAuth(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized', request_id: requestId }, { status: 401 })
  }

  try {
    const body = credentialAccessSchema.parse(JSON.parse(rawBody || '{}'))
    const credentialRef = await getBrowserOperatorCredentialRef({
      orgId: body.orgId,
      credentialRefId: body.credentialRefId,
    })
    if (!credentialRef) {
      throw new AgentCommerceError('not_found', 'Browser Operator credential ref not found.', 404)
    }

    const decision = evaluateBrowserOperatorCredentialAccess({
      credentialRef,
      rawCredentialsEnabled: isRawCredentialAccessEnabled(),
      enabledFeatureFlags: enabledBrowserOperatorFeatureFlags(),
    })

    const audit = await recordBrowserOperatorAuditEvent({
      orgId: body.orgId,
      browserAccountId: body.browserAccountId ?? credentialRef.browser_account_id,
      credentialRefId: credentialRef.id,
      opsRunId: body.opsRunId,
      actorType: body.actorType ?? 'runtime',
      actorId: body.actorId ?? null,
      eventType: decision.auditEventType,
      severity: decision.allowed ? 'info' : 'block',
      reason: body.reason ?? (decision.reasonCodes.join(',') || null),
      result: decision.allowed ? 'allowed' : 'denied',
      metadata: {
        reason_codes: decision.reasonCodes,
        storage_owner: credentialRef.storage_owner,
        credential_kind: credentialRef.credential_kind,
        provider: credentialRef.provider,
      },
    })

    if (decision.allowed) {
      await markBrowserOperatorCredentialAccessed({
        orgId: body.orgId,
        credentialRefId: credentialRef.id,
        opsRunId: body.opsRunId,
        auditEventId: audit?.id,
      })
    }

    return browserOperatorOk({
      allowed: decision.allowed,
      reason_codes: decision.reasonCodes,
      runtime_ref: decision.runtimeRef ?? null,
      audit_id: audit?.id ?? null,
    }, requestId)
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}

function verifyBrowserOperatorInternalAuth(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET || process.env.INTERNAL_SERVICE_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true

  const requestId = request.headers.get('x-lucid-request-id')
  const timestamp = request.headers.get('x-lucid-timestamp')
  const signature = request.headers.get('x-lucid-signature')
  if (!requestId || !timestamp || !signature) return false

  const timestampMs = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(timestampMs)) return false
  if (Math.abs(Date.now() - timestampMs) > AUTH_WINDOW_MS) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${timestamp}:${rawBody}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

function isRawCredentialAccessEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes(
    (process.env.BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED ?? '').trim().toLowerCase(),
  )
}

function enabledBrowserOperatorFeatureFlags(): string[] {
  const flags = new Set(
    (process.env.BROWSER_OPERATOR_FEATURE_FLAGS ?? '')
      .split(',')
      .map((flag) => flag.trim())
      .filter(Boolean),
  )
  if (isRawCredentialAccessEnabled()) flags.add(BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG)
  return Array.from(flags)
}
