import 'server-only'

import { createHash } from 'crypto'
import { AgentCommerceError } from './errors'

export function normalizeIdempotencyKey(value: string | null | undefined): string {
  const key = value?.trim()
  if (!key) {
    throw new AgentCommerceError(
      'idempotency_required',
      'Idempotency-Key header is required for Agent Commerce mutations.',
      400,
    )
  }
  if (key.length < 8 || key.length > 255) {
    throw new AgentCommerceError(
      'idempotency_required',
      'Idempotency-Key must be between 8 and 255 characters.',
      400,
    )
  }
  return key
}

export function requestHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
