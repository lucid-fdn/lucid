/**
 * Internal API Authentication for Trading
 *
 * HMAC request signing + timestamp validation + request ID deduplication.
 * Used to secure worker → Next.js internal trading API calls.
 *
 * Worker signs: `${requestId}:${timestamp}:${rawBody}` with INTERNAL_SERVICE_SECRET
 * API verifies signature + checks timestamp within 60s + deduplicates request IDs.
 */

import 'server-only'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { summarizeError } from '@/lib/logging/safe-log'

// ============================================================================
// Types
// ============================================================================

export interface InternalAuthResult {
  valid: boolean
  body?: string
  requestId?: string
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const TIMESTAMP_WINDOW_MS = 60_000 // 60 seconds
const TIMESTAMP_CLOCK_SKEW_MS = 5_000 // 5 seconds future tolerance

// ============================================================================
// Supabase client for dedup (uses service role)
// ============================================================================

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ============================================================================
// HMAC Verification
// ============================================================================

/**
 * Verify an internal API request from the worker.
 *
 * Required headers:
 * - X-Timestamp: Unix timestamp in ms
 * - X-Signature: HMAC-SHA256 hex of `${requestId}:${timestamp}:${body}`
 * - X-Request-Id: UUID for deduplication
 * - X-Internal-Secret: (legacy fallback, checked if HMAC headers missing)
 */
export async function verifyInternalAuth(
  request: NextRequest
): Promise<InternalAuthResult> {
  const secret = process.env.INTERNAL_SERVICE_SECRET
  if (!secret) {
    console.error('[InternalAuth] Internal service signing key is not configured')
    return { valid: false, error: 'Internal auth not configured' }
  }

  const timestamp = request.headers.get('X-Timestamp')
  const signature = request.headers.get('X-Signature')
  const requestId = request.headers.get('X-Request-Id')

  // If HMAC headers are present, use strict verification
  if (timestamp && signature && requestId) {
    return verifyHMAC(secret, timestamp, signature, requestId, request)
  }

  // Legacy fallback: simple secret check (will be removed)
  const legacySecret = request.headers.get('X-Internal-Service-Secret')
  if (legacySecret === secret) {
    console.warn('[InternalAuth] Using legacy internal auth — migrate to HMAC')
    // Read body for downstream use
    const body = await request.text()
    return { valid: true, body, requestId: crypto.randomUUID() }
  }

  return { valid: false, error: 'Missing authentication headers' }
}

async function verifyHMAC(
  secret: string,
  timestamp: string,
  signature: string,
  requestId: string,
  request: NextRequest
): Promise<InternalAuthResult> {
  // 1. Validate timestamp
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) {
    return { valid: false, error: 'Invalid timestamp' }
  }

  const age = Date.now() - ts
  if (age > TIMESTAMP_WINDOW_MS || age < -TIMESTAMP_CLOCK_SKEW_MS) {
    return { valid: false, error: `Request expired (age: ${age}ms)` }
  }

  // 2. Read body ONCE (Next.js streams are one-shot)
  const rawBody = await request.text()

  // 3. Verify HMAC
  const payload = `${requestId}:${timestamp}:${rawBody}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  // Constant-time comparison
  let signatureValid = false
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    // Length mismatch = invalid
    signatureValid = false
  }

  if (!signatureValid) {
    return { valid: false, error: 'Invalid signature' }
  }

  // 4. Deduplication: reject replayed request IDs
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('request_dedup').insert({
      request_id: requestId,
      created_at: new Date().toISOString(),
    })

    if (error) {
      // Unique constraint violation = replay
      if (error.code === '23505') {
        return { valid: false, error: 'Replay detected (duplicate request ID)' }
      }
      // Other DB errors — log but don't block (dedup is defense-in-depth)
      console.error('[InternalAuth] Dedup insert error:', summarizeError(error))
    }
  } catch (err) {
    console.error('[InternalAuth] Dedup check failed:', summarizeError(err))
    // Don't block on dedup failures — HMAC is the primary gate
  }

  return { valid: true, body: rawBody, requestId }
}

// ============================================================================
// Worker-side: Generate HMAC headers
// ============================================================================

/**
 * Generate HMAC authentication headers for internal API calls.
 * Use this in the worker when calling Next.js internal APIs.
 */
export function generateInternalAuthHeaders(
  body: string,
  secret: string
): Record<string, string> {
  const requestId = crypto.randomUUID()
  const timestamp = Date.now().toString()
  const payload = `${requestId}:${timestamp}:${body}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return {
    'X-Request-Id': requestId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json',
  }
}
