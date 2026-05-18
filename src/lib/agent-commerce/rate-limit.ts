import 'server-only'

import { claimAgentCommerceRateLimit } from '@/lib/db/agent-commerce'
import { AgentCommerceError } from './errors'

export interface AgentCommerceRateLimitPolicy {
  scope: string
  bucket: string
  windowSeconds: number
  limit: number
  increment?: number
}

export const AGENT_COMMERCE_RATE_LIMITS = {
  publicSpendRequest: { windowSeconds: 60, limit: 30 },
  publicSpendMerchant: { windowSeconds: 60, limit: 120 },
  publicSpendCurrency: { windowSeconds: 60, limit: 240 },
  publicSpendMutation: { windowSeconds: 60, limit: 60 },
  publicConnectionCreate: { windowSeconds: 60, limit: 20 },
  internalSpendRequest: { windowSeconds: 60, limit: 120 },
  internalSpendMerchant: { windowSeconds: 60, limit: 300 },
  internalSpendCurrency: { windowSeconds: 60, limit: 600 },
  sellerGrantReceive: { windowSeconds: 60, limit: 120 },
  sellerGrantResource: { windowSeconds: 60, limit: 180 },
  sellerGrantCurrency: { windowSeconds: 60, limit: 300 },
  sellerGrantAccept: { windowSeconds: 60, limit: 60 },
  machineChallengeCreate: { windowSeconds: 60, limit: 240 },
  machineProofClaim: { windowSeconds: 60, limit: 240 },
} as const

function sanitizeRateLimitPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 160) || 'unknown'
}

export function agentCommerceRateLimitScope(...parts: Array<string | undefined | null>): string {
  return parts.map((part) => sanitizeRateLimitPart(part ?? 'unknown')).join(':')
}

export async function enforceAgentCommerceRateLimit(policy: AgentCommerceRateLimitPolicy): Promise<void> {
  const claim = await claimAgentCommerceRateLimit({
    scopeKey: policy.scope,
    bucketKey: policy.bucket,
    windowSeconds: policy.windowSeconds,
    limit: policy.limit,
    increment: policy.increment ?? 1,
  })

  if (claim.allowed) return

  throw new AgentCommerceError(
    'rate_limited',
    'Agent Commerce request rate limit exceeded.',
    429,
    {
      retryable: true,
      details: {
        bucket: policy.bucket,
        current_value: claim.currentValue,
        limit_value: claim.limitValue,
        reset_at: claim.resetAt,
      },
    },
  )
}

export async function enforceAgentCommerceRateLimits(policies: AgentCommerceRateLimitPolicy[]): Promise<void> {
  for (const policy of policies) {
    await enforceAgentCommerceRateLimit(policy)
  }
}
