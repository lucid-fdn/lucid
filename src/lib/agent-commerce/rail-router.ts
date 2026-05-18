import {
  AgentCommerceIntentSchema,
  AgentCommercePolicySchema,
  AgentCommerceProviderManifestSchema,
  DEFAULT_AGENT_COMMERCE_POLICY,
  RailPolicyDecisionSchema,
  type AgentCommerceConnection,
  type AgentCommerceIntentInput,
  type AgentCommercePolicyInput,
  type AgentCommerceProviderManifest,
  type CommerceRail,
  type RailPolicyDecision,
  type RailPolicyReasonCode,
} from '@contracts/agent-commerce'
import { evaluateAgentCommercePolicy, shouldRequireHumanApproval } from './policy'

export interface ProviderHealth {
  provider: string
  mode?: 'live' | 'preview' | 'waitlist' | 'disabled'
  status: 'healthy' | 'degraded' | 'disabled'
}

export interface CommerceRiskScore {
  level: 'low' | 'medium' | 'high' | 'critical'
  score?: number
}

export interface ResolveCommerceRailInput {
  intent: AgentCommerceIntentInput
  policy?: AgentCommercePolicyInput
  userConnections?: AgentCommerceConnection[]
  providerManifests: AgentCommerceProviderManifest[]
  providerHealth?: ProviderHealth[]
  risk?: CommerceRiskScore
  features?: {
    coreEnabled?: boolean
    walletsEnabled?: boolean
    sellerEnabled?: boolean
    killSwitchActive?: boolean
  }
  now?: Date
}

const PROVIDER_RAILS: Record<string, CommerceRail[]> = {
  manual: ['manual_approval'],
  stripe_link_agents: ['stripe_link_one_time_card', 'stripe_shared_payment_token'],
  stripe_shared_payment_tokens: ['stripe_shared_payment_token'],
  stripe_issuing: ['stripe_issuing_card'],
  machine_payments_mpp: ['machine_payment_mpp'],
  machine_payments_x402: ['machine_payment_x402'],
  crypto_wallet: ['crypto_wallet_transfer'],
}

function deny(
  reason: RailPolicyReasonCode,
  policy: AgentCommercePolicyInput | undefined,
  evidence: Record<string, unknown> = {},
): RailPolicyDecision {
  return RailPolicyDecisionSchema.parse({
    decision: 'denied',
    reason_codes: [reason],
    policy_snapshot: AgentCommercePolicySchema.parse(policy ?? {}),
    evidence,
  })
}

function hasConnection(connections: AgentCommerceConnection[], provider: string): boolean {
  return connections.some((connection) => connection.provider === provider && connection.status === 'active')
}

function providerUnavailableReason(
  manifest: AgentCommerceProviderManifest,
  health: ProviderHealth | undefined,
  allowPreview: boolean,
): RailPolicyReasonCode | null {
  if (health?.status === 'disabled' || manifest.availability.mode === 'disabled') return 'provider_disabled'
  if (health?.status === 'degraded') return 'provider_unavailable'
  if (!allowPreview && (manifest.availability.mode === 'preview' || manifest.availability.mode === 'waitlist')) {
    return 'provider_preview_only'
  }
  return null
}

export function resolveCommerceRail(input: ResolveCommerceRailInput): RailPolicyDecision {
  const intent = AgentCommerceIntentSchema.parse(input.intent)
  const policy = AgentCommercePolicySchema.parse(input.policy ?? DEFAULT_AGENT_COMMERCE_POLICY)
  const now = input.now ?? new Date()

  if (input.features?.killSwitchActive) return deny('kill_switch_active', policy)
  if (input.features?.coreEnabled === false) return deny('feature_disabled', policy)
  if (!intent.idempotency_key) return deny('idempotency_required', policy)
  if (!intent.org_id || (!intent.actor_user_id && !intent.assistant_id && !intent.run_id)) {
    return deny('identity_required', policy)
  }

  const policyDecision = evaluateAgentCommercePolicy({
    amount: intent.amount,
    merchant: intent.merchant,
    policy,
    now,
  })
  if (!policyDecision.allowed) {
    return deny(policyDecision.reasonCode ?? 'policy_denied', policy, {
      policy_reason: policyDecision.reason,
    })
  }

  if (input.risk?.level === 'critical') {
    return RailPolicyDecisionSchema.parse({
      decision: 'manual_review',
      reason_codes: ['risk_manual_review'],
      policy_snapshot: policy,
      evidence: { risk: input.risk },
    })
  }

  const manifests = input.providerManifests.map((manifest) => AgentCommerceProviderManifestSchema.parse(manifest))
  const healthByProvider = new Map((input.providerHealth ?? []).map((health) => [health.provider, health]))
  const allowedProviders = new Set(policy.allowed_providers)
  const allowedRails = new Set(policy.allowed_rails)

  const candidates = manifests
    .filter((manifest) => manifest.roles.includes('agent_platform') || manifest.roles.includes('machine_payment'))
    .filter((manifest) => allowedProviders.size === 0 || allowedProviders.has(manifest.id))
    .filter((manifest) => !intent.preferred_provider || manifest.id === intent.preferred_provider)
    .map((manifest) => ({
      manifest,
      rails: (manifest.rails.length > 0 ? manifest.rails : PROVIDER_RAILS[manifest.id] ?? [])
        .filter((rail) => !intent.preferred_rail || rail === intent.preferred_rail)
        .filter((rail) => allowedRails.size === 0 || allowedRails.has(rail)),
    }))
    .filter((entry) => entry.rails.length > 0)

  if (candidates.length === 0) {
    return deny('provider_capability_missing', policy, {
      preferred_provider: intent.preferred_provider,
      preferred_rail: intent.preferred_rail,
    })
  }

  for (const candidate of candidates) {
    const unavailable = providerUnavailableReason(
      candidate.manifest,
      healthByProvider.get(candidate.manifest.id),
      policy.allow_preview_providers,
    )
    if (unavailable) {
      if (intent.preferred_provider) return deny(unavailable, policy, { provider: candidate.manifest.id })
      continue
    }

    const rail = candidate.rails[0]
    if (candidate.manifest.requires_account_access && !hasConnection(input.userConnections ?? [], candidate.manifest.id)) {
      return RailPolicyDecisionSchema.parse({
        decision: 'requires_connection',
        selected_provider: candidate.manifest.id,
        selected_rail: rail,
        reason_codes: ['connection_missing'],
        policy_snapshot: policy,
        evidence: { provider: candidate.manifest.id },
      })
    }

    if (shouldRequireHumanApproval(policy)) {
      return RailPolicyDecisionSchema.parse({
        decision: 'requires_approval',
        selected_provider: candidate.manifest.id,
        selected_rail: rail,
        reason_codes: ['approval_required'],
        policy_snapshot: policy,
        evidence: { provider: candidate.manifest.id },
      })
    }

    return RailPolicyDecisionSchema.parse({
      decision: candidate.manifest.capabilities.includes('one_time_card') || candidate.manifest.capabilities.includes('shared_payment_token')
        ? 'approved_to_issue_credential'
        : 'ready',
      selected_provider: candidate.manifest.id,
      selected_rail: rail,
      reason_codes: [],
      policy_snapshot: policy,
      evidence: { provider: candidate.manifest.id },
    })
  }

  return deny('provider_unavailable', policy)
}
