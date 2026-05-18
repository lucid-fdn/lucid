/**
 * Billing, Subscriptions, Plans, Usage & Payments operations
 */

import { cache } from 'react'
import { supabase, ErrorService } from './client'
import { getEntitlements } from '@/lib/control-plane/client'

const PLAN_SELECT =
  'id, name, display_name, description, price_monthly_usd, price_yearly_usd, price_monthly_crypto, price_yearly_crypto, stripe_price_monthly_id, stripe_price_yearly_id, features, limits, is_active, is_featured, sort_order, created_at, updated_at' as const

const SUBSCRIPTION_SELECT =
  'id, org_id, plan_id, status, billing_period, payment_method, current_period_start, current_period_end, stripe_subscription_id, stripe_customer_id, coinbase_charge_id, crypto_wallet_address, cancel_at_period_end, canceled_at, metadata, created_at, updated_at' as const

const USAGE_METRIC_SELECT =
  'id, org_id, metric_name, metric_value, period_start, period_end, created_at, updated_at' as const

const PAYMENT_SELECT =
  'id, subscription_id, org_id, amount, currency, payment_method, status, provider, provider_payment_id, provider_customer_id, transaction_hash, block_number, wallet_address, confirmations, metadata, created_at, updated_at' as const

/**
 * Get all available plans
 */
export const getPlans = cache(async () => {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_SELECT)
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        table: 'plans',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'plans'
      }
    });
    return []
  }

  return data || []
})

/**
 * Get plan by name
 */
export const getPlanByName = cache(async (name: 'starter' | 'pro' | 'business') => {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_SELECT)
    .eq('name', name)
    .eq('is_active', true)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        planName: name,
        table: 'plans',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'plans'
      }
    });
    return null
  }

  return data
})

/**
 * Get organization's active subscription with plan details.
 *
 * Strategy: prefer the centralized control-plane (faster, single source of
 * truth once deployed) and fall back to the local Supabase RPC when the
 * control-plane is not configured or returns an error.
 */
export const getOrgSubscription = cache(async (orgId: string) => {
  // ── 1. Try control-plane ──────────────────────────────────────────────
  const cp = await getEntitlements(orgId)

  if (cp) {
    // Map control-plane response → shape callers expect (Subscription)
    return {
      subscription_id: cp.subscription_id as string,
      org_id: (cp.org_id as string | undefined) ?? (cp.tenant_id as string),
      plan_id: cp.plan_id as string,
      plan_name: cp.plan_name as string,
      plan_display_name: cp.plan_display_name as string,
      status: cp.status as string,
      billing_period: cp.billing_period as string,
      payment_method: (cp.payment_method as string | undefined) ?? 'stripe_card',
      current_period_start: cp.current_period_start as string,
      current_period_end: cp.current_period_end as string,
      features: (cp.features as Record<string, boolean>) ?? {},
      limits: (cp.limits as Record<string, number>) ?? {},
    }
  }

  // ── 2. Fallback: local Supabase RPC ───────────────────────────────────
  const { data, error } = await supabase.rpc('get_org_subscription', {
    p_org_id: orgId
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        function: 'get_org_subscription',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  return data[0]
})

/**
 * Create subscription for organization
 */
export async function createSubscription(subscription: {
  org_id: string
  plan_id: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
  billing_period: 'monthly' | 'yearly'
  payment_method: 'stripe_card' | 'stripe_paypal' | 'crypto'
  current_period_start: string
  current_period_end: string
  stripe_subscription_id?: string
  stripe_customer_id?: string
  coinbase_charge_id?: string
  crypto_wallet_address?: string
  metadata?: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from('subscriptions')
    .insert(subscription as Record<string, unknown>)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: subscription.org_id,
        planId: subscription.plan_id,
        table: 'subscriptions',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'subscriptions'
      }
    });
    throw error
  }

  return data
}

/**
 * Update subscription
 */
export async function updateSubscription(
  subscriptionId: string,
  updates: {
    status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
    plan_id?: string
    cancel_at_period_end?: boolean
    canceled_at?: string
    current_period_start?: string
    current_period_end?: string
    metadata?: Record<string, unknown>
  }
) {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    } as Record<string, unknown>)
    .eq('id', subscriptionId)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        subscriptionId,
        updateFields: Object.keys(updates),
        table: 'subscriptions',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'subscriptions'
      }
    });
    throw error
  }

  return data
}

/**
 * Cancel subscription (sets cancel_at_period_end)
 */
export async function cancelSubscription(subscriptionId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString()
    } as Record<string, unknown>)
    .eq('id', subscriptionId)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        subscriptionId,
        table: 'subscriptions',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'subscriptions'
      }
    });
    throw error
  }

  return data
}

/**
 * Get active/trialing subscription for an org (any status that grants access)
 * Used by webhooks to find the subscription to update
 */
export async function getActiveSubscriptionByOrgId(orgId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('org_id', orgId)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        table: 'subscriptions',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'subscriptions'
      }
    });
    return null
  }

  return data
}

/**
 * Check if a webhook event has already been processed (idempotency).
 *
 * Dedupe key is `(provider, event_id, event_type)` so that legitimate state
 * transitions for the same upstream object (e.g. NOWPayments `partially_paid`
 * → `finished`) are NOT collapsed into the first event we saw. The
 * `event_type` filter is required to prevent suppressing the terminal status
 * event after an intermediate one has been recorded.
 */
export async function isWebhookEventProcessed(
  provider: string,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .eq('event_type', eventType)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        provider,
        eventId,
        eventType,
        table: 'webhook_events',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'webhook_events'
      }
    });
    return false
  }

  return !!data
}

/**
 * Record a processed webhook event for idempotency
 */
export async function recordWebhookEvent(provider: string, eventId: string, eventType: string): Promise<void> {
  const { error } = await supabase
    .from('webhook_events')
    .insert({
      provider,
      event_id: eventId,
      event_type: eventType,
    })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        provider,
        eventId,
        eventType,
        table: 'webhook_events',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'webhook_events'
      }
    });
  }
}

/**
 * Get current usage for a metric
 * Uses database function for current month
 */
export async function getCurrentUsage(orgId: string, metricName: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_current_usage', {
    p_org_id: orgId,
    p_metric_name: metricName
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        metricName,
        function: 'get_current_usage',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
    return 0
  }

  return data || 0
}

/**
 * Increment usage metric
 * Uses database function for atomic increment.
 *
 * Charging model: "accepted request consumes quota" — the increment fires
 * immediately after the entitlement check passes, before the LLM call starts.
 * This means a request is charged even if the downstream LLM call fails.
 *
 * @param idempotencyKey  Caller-supplied dedup key (e.g. runId, documentId).
 *   When provided, the DB skips the increment if the same key was already seen
 *   within the 24-hour dedup window. Pass a stable key derived from the
 *   request to prevent double-charging on retries or transport repeats.
 */
export async function incrementUsage(
  orgId: string,
  metricName: string,
  amount: number = 1,
  idempotencyKey?: string
): Promise<void> {
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { error } = await supabase.rpc('increment_usage_metric', {
    p_org_id: orgId,
    p_metric_name: metricName,
    p_amount: amount,
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString(),
    p_idempotency_key: idempotencyKey ?? null,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        metricName,
        amount,
        function: 'increment_usage_metric',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
    throw error
  }
}

/**
 * Check if usage limit has been exceeded
 * Uses database function for limit checking
 */
export async function checkUsageLimit(orgId: string, metricName: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_usage_limit', {
    p_org_id: orgId,
    p_metric_name: metricName
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        metricName,
        function: 'check_usage_limit',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
    return false
  }

  return data || false
}

/**
 * Get usage metrics for organization (current month)
 */
export async function getUsageMetrics(orgId: string) {
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { data, error } = await supabase
    .from('usage_metrics')
    .select(USAGE_METRIC_SELECT)
    .eq('org_id', orgId)
    .gte('period_start', periodStart.toISOString())
    .lte('period_end', periodEnd.toISOString())

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        table: 'usage_metrics',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'usage_metrics'
      }
    });
    return []
  }

  return data || []
}

/**
 * Create payment record
 */
export async function createPayment(payment: {
  subscription_id: string
  org_id: string
  amount: number
  currency: string
  payment_method: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  provider: 'stripe' | 'coinbase' | 'nowpayments'
  provider_payment_id: string
  provider_customer_id?: string
  transaction_hash?: string
  block_number?: number
  wallet_address?: string
  metadata?: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from('payments')
    .insert(payment as Record<string, unknown>)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: payment.org_id,
        provider: payment.provider,
        amount: payment.amount,
        table: 'payments',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'payments'
      }
    });
    throw error
  }

  return data
}

/**
 * Update payment status
 */
export async function updatePayment(
  paymentId: string,
  updates: {
    status?: 'pending' | 'succeeded' | 'failed' | 'refunded'
    transaction_hash?: string
    block_number?: number
    confirmations?: number
    metadata?: Record<string, unknown>
  }
) {
  const { data, error } = await supabase
    .from('payments')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    } as Record<string, unknown>)
    .eq('id', paymentId)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        paymentId,
        updateFields: Object.keys(updates),
        table: 'payments',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'payments'
      }
    });
    throw error
  }

  return data
}

/**
 * Get payment history for organization
 */
export async function getPaymentHistory(orgId: string, limit: number = 50) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        limit,
        table: 'payments',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'payments'
      }
    });
    return []
  }

  return data || []
}

export async function getPaymentByProviderPaymentId(
  provider: string,
  providerPaymentId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('provider', provider)
    .eq('provider_payment_id', providerPaymentId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { table: 'payments', operation: 'SELECT', provider, providerPaymentId },
      tags: { layer: 'database', table: 'payments' },
    })
    return null
  }

  return data
}
