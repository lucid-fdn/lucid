import {
  AgentSpendRequestSchema,
  MachinePaymentChallengeSchema,
  MachinePaymentProofClaimSchema,
  CreateAgentSpendRequestSchema,
  SellerPaymentGrantSchema,
  type AgentCommerceCredential,
  type AgentCommerceProviderManifest,
  type CreateMachinePaymentChallenge,
  type MachinePaymentChallenge,
  type MachinePaymentProofClaim,
  type MachinePaymentProofClaimInput,
  type AgentSpendRequest,
  type CreateAgentSpendRequest,
  type SellerPaymentGrantInput,
} from '@contracts/agent-commerce'
import type {
  AgentCommerceProviderContext,
  AgentWalletCommerceProvider,
  MachinePaymentCommerceProvider,
  SellerAgentCommerceProvider,
} from '../provider'
import { evaluateAgentCommercePolicy, shouldRequireHumanApproval } from '../policy'

export const MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'manual',
  label: 'Manual approval',
  roles: ['agent_platform', 'seller', 'machine_payment'],
  capabilities: ['spend_request', 'manual_approval', 'machine_payment'],
  rails: ['manual_approval'],
  requires_account_access: false,
  availability: { mode: 'live', countries: [] },
}

export class ManualAgentCommerceProvider
  implements AgentWalletCommerceProvider, SellerAgentCommerceProvider, MachinePaymentCommerceProvider {
  readonly manifest = MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST

  async createSpendRequest(
    input: CreateAgentSpendRequest,
    _context?: AgentCommerceProviderContext,
  ): Promise<AgentSpendRequest> {
    const parsed = CreateAgentSpendRequestSchema.parse(input)
    const decision = evaluateAgentCommercePolicy({
      amount: parsed.amount,
      merchant: parsed.merchant,
      policy: parsed.policy,
    })
    const now = new Date().toISOString()
    let status: AgentSpendRequest['status'] = 'declined'
    if (decision.allowed) {
      status = shouldRequireHumanApproval(parsed.policy) ? 'requires_approval' : 'approved'
    }

    return AgentSpendRequestSchema.parse({
      ...parsed,
      id: crypto.randomUUID(),
      provider: 'manual',
      rail: parsed.rail ?? 'manual_approval',
      status,
      approval_required: shouldRequireHumanApproval(parsed.policy),
      created_at: now,
      updated_at: now,
      metadata: {
        ...(parsed.metadata ?? {}),
        policy_decision: decision,
      },
    })
  }

  async retrieveSpendRequest(): Promise<AgentSpendRequest | null> {
    return null
  }

  async issueCredential(
    spendRequest: AgentSpendRequest,
    _context?: AgentCommerceProviderContext,
  ): Promise<AgentCommerceCredential> {
    return {
      kind: 'manual_receipt',
      provider: 'manual',
      spend_request_id: spendRequest.id,
      org_id: spendRequest.org_id,
      status: 'issued',
      usage_limits: spendRequest.policy,
      display: { label: 'Manual approval receipt' },
      metadata: {},
    }
  }

  async acceptGrant(
    grant: SellerPaymentGrantInput,
    _context?: AgentCommerceProviderContext,
  ): Promise<{ payment_id: string; status: 'accepted' }> {
    SellerPaymentGrantSchema.parse(grant)
    return {
      payment_id: `manual_${crypto.randomUUID()}`,
      status: 'accepted',
    }
  }

  async createChallenge(
    input: CreateMachinePaymentChallenge,
    _context?: AgentCommerceProviderContext,
  ): Promise<MachinePaymentChallenge> {
    const now = new Date()
    const challenge = {
      ...input,
      id: crypto.randomUUID(),
      provider: 'manual',
      rail: 'manual_approval',
      amount: input.amount,
      challenge_hash: crypto.randomUUID().replaceAll('-', ''),
      status: 'challenge_created',
      created_at: now.toISOString(),
      expires_at: input.expires_at ?? new Date(now.getTime() + 5 * 60_000).toISOString(),
      metadata: input.metadata ?? {},
    }
    return MachinePaymentChallengeSchema.parse(challenge)
  }

  async verifyProof(
    input: MachinePaymentProofClaimInput,
    _context?: AgentCommerceProviderContext,
  ): Promise<MachinePaymentProofClaim> {
    return MachinePaymentProofClaimSchema.parse({
      id: crypto.randomUUID(),
      ...input,
      status: 'proof_claimed',
      claimed_at: new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
  }
}
