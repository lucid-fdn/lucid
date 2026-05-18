import type {
  AgentCommerceCredential,
  AgentCommerceProviderId,
  AgentCommerceProviderManifest,
  CreateMachinePaymentChallenge,
  MachinePaymentChallenge,
  MachinePaymentProofClaim,
  MachinePaymentProofClaimInput,
  AgentSpendRequest,
  CreateAgentSpendRequest,
  SellerPaymentGrantInput,
} from '@contracts/agent-commerce'

export interface AgentCommerceProviderContext {
  requestId?: string
  orgId?: string
  projectId?: string
  assistantId?: string
  runId?: string
}

export interface AgentWalletCommerceProvider {
  readonly manifest: AgentCommerceProviderManifest
  createSpendRequest(
    input: CreateAgentSpendRequest,
    context?: AgentCommerceProviderContext,
  ): Promise<AgentSpendRequest>
  retrieveSpendRequest(
    id: string,
    context?: AgentCommerceProviderContext,
  ): Promise<AgentSpendRequest | null>
  issueCredential?(
    spendRequest: AgentSpendRequest,
    context?: AgentCommerceProviderContext,
  ): Promise<AgentCommerceCredential>
}

export interface SellerAgentCommerceProvider {
  readonly manifest: AgentCommerceProviderManifest
  acceptGrant(
    grant: SellerPaymentGrantInput,
    context?: AgentCommerceProviderContext,
  ): Promise<{ payment_id: string; status: 'accepted' | 'processing' | 'completed' | 'requires_action' }>
}

export interface MachinePaymentCommerceProvider {
  readonly manifest: AgentCommerceProviderManifest
  createChallenge(
    input: CreateMachinePaymentChallenge,
    context?: AgentCommerceProviderContext,
  ): Promise<MachinePaymentChallenge>
  verifyProof(
    input: MachinePaymentProofClaimInput,
    context?: AgentCommerceProviderContext,
  ): Promise<MachinePaymentProofClaim>
}

export type AgentCommerceProvider =
  | AgentWalletCommerceProvider
  | SellerAgentCommerceProvider
  | MachinePaymentCommerceProvider

export function isWalletCommerceProvider(
  provider: AgentCommerceProvider,
): provider is AgentWalletCommerceProvider {
  return 'createSpendRequest' in provider
}

export function isSellerCommerceProvider(
  provider: AgentCommerceProvider,
): provider is SellerAgentCommerceProvider {
  return 'acceptGrant' in provider
}

export function isMachinePaymentCommerceProvider(
  provider: AgentCommerceProvider,
): provider is MachinePaymentCommerceProvider {
  return 'createChallenge' in provider && 'verifyProof' in provider
}

export class AgentCommerceProviderUnavailableError extends Error {
  readonly providerId: AgentCommerceProviderId

  constructor(providerId: AgentCommerceProviderId, message?: string) {
    super(message ?? `Agent commerce provider is not registered: ${providerId}`)
    this.name = 'AgentCommerceProviderUnavailableError'
    this.providerId = providerId
  }
}
