// Note: supabase from ./client uses SUPABASE_SERVICE_ROLE_KEY (service-role client).
// checkout_attempts has service-only RLS, so this MUST be the service-role client.

import { supabase, ErrorService } from './client'
import type { ProviderId } from '@/lib/payments/types'

export interface CheckoutAttempt {
  id: string
  org_id: string
  user_id: string
  plan_name: string
  billing_period: string
  provider: ProviderId
  provider_invoice_id: string | null
  status: 'pending' | 'completed' | 'partial' | 'expired' | 'failed'
  amount_cents: number
  created_at: string
  expires_at: string
  completed_at: string | null
}

const CHECKOUT_ATTEMPT_SELECT =
  'id, org_id, user_id, plan_name, billing_period, provider, provider_invoice_id, status, amount_cents, created_at, expires_at, completed_at' as const

export async function createCheckoutAttempt(attempt: {
  org_id: string
  user_id: string
  plan_name: string
  billing_period: string
  provider: ProviderId
  amount_cents: number
  expires_at: string
}): Promise<CheckoutAttempt> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .insert(attempt)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'INSERT', orgId: attempt.org_id },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    throw error
  }

  return data as CheckoutAttempt
}

export async function getCheckoutAttempt(id: string): Promise<CheckoutAttempt | null> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .select(CHECKOUT_ATTEMPT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'SELECT', attemptId: id },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    return null
  }

  return data as CheckoutAttempt | null
}

export async function updateCheckoutAttemptStatus(
  id: string,
  status: CheckoutAttempt['status'],
  extra?: { provider_invoice_id?: string; completed_at?: string },
): Promise<void> {
  const { error } = await supabase
    .from('checkout_attempts')
    .update({
      status,
      ...extra,
      ...(status === 'completed' ? { completed_at: extra?.completed_at ?? new Date().toISOString() } : {}),
    })
    .eq('id', id)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'UPDATE', attemptId: id, status },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
  }
}

/**
 * Atomically claim a checkout attempt: pending/partial → completed.
 * Returns the attempt if successfully claimed, null if already claimed (idempotency guard).
 * We intentionally allow `partial` here because NOWPayments may emit
 * `partially_paid` before the terminal `finished` webhook for the same attempt.
 */
export async function claimCheckoutAttempt(
  id: string,
): Promise<CheckoutAttempt | null> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['pending', 'partial'])
    .select()
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'checkout_attempts', operation: 'CLAIM', attemptId: id },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    return null
  }

  return data as CheckoutAttempt | null
}

/**
 * Mark stale pending checkout attempts as expired.
 * Call this from a periodic cron or on-demand before creating new attempts.
 */
export async function expireStaleCheckoutAttempts(): Promise<number> {
  const { data, error } = await supabase
    .from('checkout_attempts')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { table: 'checkout_attempts', operation: 'EXPIRE_STALE' },
      tags: { layer: 'database', table: 'checkout_attempts' },
    })
    return 0
  }

  return data?.length ?? 0
}
