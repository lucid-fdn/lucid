import 'server-only'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import type {
  AgentCommerceMoneyInput,
  AgentCommerceProviderId,
  CommerceRail,
  MachinePaymentProofClaim,
} from '@contracts/agent-commerce'
import {
  agentCommerceErrorResponse,
  agentCommerceRequestId,
} from './api'
import { AgentCommerceError } from './errors'
import {
  claimAgentCommerceMachinePaymentProof,
  createAgentCommerceMachineChallenge,
} from './service'

export interface MachinePaymentGateInput {
  request: NextRequest
  orgId: string
  resourceType: string
  resourceId: string
  amount: AgentCommerceMoneyInput
  provider?: AgentCommerceProviderId
  rail?: CommerceRail
  challengeBody?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type MachinePaymentGateResult =
  | { ok: true; claim: MachinePaymentProofClaim & { first_claim?: boolean } }
  | { ok: false; response: NextResponse }

function proofHash(proof: string): string {
  return crypto.createHash('sha256').update(proof, 'utf8').digest('hex')
}

export async function requireAgentCommerceMachinePayment(
  input: MachinePaymentGateInput,
): Promise<MachinePaymentGateResult> {
  const requestId = agentCommerceRequestId(input.request)
  const provider = input.provider ?? 'machine_payments_x402'
  const rail = input.rail ?? 'machine_payment_x402'
  const proof = input.request.headers.get('x-agent-commerce-proof')
  const challengeId = input.request.headers.get('x-agent-commerce-challenge-id')
  const providerPaymentId = input.request.headers.get('x-agent-commerce-provider-payment-id') ?? undefined

  try {
    if (proof && challengeId) {
      const claim = await claimAgentCommerceMachinePaymentProof({
        challenge_id: challengeId,
        org_id: input.orgId,
        provider,
        proof_hash: proofHash(proof),
        provider_payment_id: providerPaymentId,
        metadata: {
          ...(input.metadata ?? {}),
          request_id: requestId,
          resource_type: input.resourceType,
          resource_id: input.resourceId,
        },
      }, { type: 'runtime', requestId })

      if (!claim.first_claim) {
        throw new AgentCommerceError('idempotency_conflict', 'Machine payment proof was already claimed.', 409)
      }

      return { ok: true, claim }
    }

    const challenge = await createAgentCommerceMachineChallenge({
      org_id: input.orgId,
      provider,
      rail,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      amount: input.amount,
      challenge_body: {
        protocol: rail,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        amount: input.amount,
        ...(input.challengeBody ?? {}),
      },
      metadata: {
        ...(input.metadata ?? {}),
        request_id: requestId,
      },
    }, { type: 'system', requestId })

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: 'payment_required',
            message: 'Machine payment is required for this resource.',
          },
          challenge,
          request_id: requestId,
        },
        {
          status: 402,
          headers: {
            'x-request-id': requestId,
            'x-agent-commerce-challenge-id': challenge.id,
            'x-agent-commerce-provider': provider,
          },
        },
      ),
    }
  } catch (error) {
    return {
      ok: false,
      response: agentCommerceErrorResponse(error, requestId),
    }
  }
}
