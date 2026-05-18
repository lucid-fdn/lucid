import 'server-only'

import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { AgentCommerceError } from './errors'

export interface AgentCommerceInternalAuthResult {
  body: string
  requestId: string
}

const TIMESTAMP_WINDOW_MS = 60_000
const TIMESTAMP_CLOCK_SKEW_MS = 5_000

function getInternalSecret(): string {
  const secret = process.env.AGENT_COMMERCE_INTERNAL_SECRET || process.env.INTERNAL_SERVICE_SECRET
  if (!secret) {
    throw new AgentCommerceError(
      'unauthorized',
      'Agent Commerce internal auth is not configured.',
      401,
    )
  }
  return secret
}

export async function verifyAgentCommerceInternalAuth(
  request: NextRequest,
): Promise<AgentCommerceInternalAuthResult> {
  const secret = getInternalSecret()
  const timestamp = request.headers.get('x-timestamp')
  const signature = request.headers.get('x-signature')
  const requestId = request.headers.get('x-request-id')

  if (!timestamp || !signature || !requestId) {
    const legacySecret = request.headers.get('x-agent-commerce-internal-secret')
    if (legacySecret && legacySecret === secret) {
      return { body: await request.text(), requestId: crypto.randomUUID() }
    }
    throw new AgentCommerceError('unauthorized', 'Missing Agent Commerce internal auth headers.', 401)
  }

  const ts = Number.parseInt(timestamp, 10)
  if (Number.isNaN(ts)) {
    throw new AgentCommerceError('unauthorized', 'Invalid Agent Commerce auth timestamp.', 401)
  }

  const age = Date.now() - ts
  if (age > TIMESTAMP_WINDOW_MS || age < -TIMESTAMP_CLOCK_SKEW_MS) {
    throw new AgentCommerceError('unauthorized', 'Agent Commerce internal auth timestamp expired.', 401)
  }

  const body = await request.text()
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${timestamp}:${body}`)
    .digest('hex')

  let valid = false
  try {
    valid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    valid = false
  }

  if (!valid) {
    throw new AgentCommerceError('unauthorized', 'Invalid Agent Commerce internal auth signature.', 401)
  }

  return { body, requestId }
}

export function generateAgentCommerceInternalAuthHeaders(
  body: string,
  secret: string,
): Record<string, string> {
  const requestId = crypto.randomUUID()
  const timestamp = Date.now().toString()
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${timestamp}:${body}`)
    .digest('hex')

  return {
    'x-request-id': requestId,
    'x-timestamp': timestamp,
    'x-signature': signature,
    'content-type': 'application/json',
  }
}
