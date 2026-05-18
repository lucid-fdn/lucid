import { AgentCommerceError } from './errors'

export const LUCID_L2_P0_GATE_IDS = [
  'P0-L2-001',
  'P0-L2-002',
  'P0-L2-003',
] as const

export type LucidL2P0GateId = typeof LUCID_L2_P0_GATE_IDS[number]

export interface LucidL2P0Gate {
  id: LucidL2P0GateId
  title: string
  requiredControl: string
}

export const LUCID_L2_P0_GATES: readonly LucidL2P0Gate[] = [
  {
    id: 'P0-L2-001',
    title: 'Public Solana write operations cannot spend with server credentials.',
    requiredControl: 'Money-moving chain writes are private by default and require verified, policy-scoped authorization.',
  },
  {
    id: 'P0-L2-002',
    title: 'Passport mutation requires verified ownership.',
    requiredControl: 'Endpoint, pricing, ownership, and merchant metadata mutations require a verified owner or admin principal.',
  },
  {
    id: 'P0-L2-003',
    title: 'Trading execution cannot trust caller-supplied user identity.',
    requiredControl: 'Trading and wallet execution derive user, org, and run identity from LucidMerged auth or internal context.',
  },
] as const

export const LUCID_L2_EXECUTION_ENABLED_ENV = 'AGENT_COMMERCE_LUCID_L2_EXECUTION_ENABLED' as const
export const LUCID_L2_P0_GATES_CLOSED_ENV = 'AGENT_COMMERCE_LUCID_L2_P0_GATES_CLOSED' as const
export const LUCID_L2_SECURITY_REVIEW_REF_ENV = 'AGENT_COMMERCE_LUCID_L2_SECURITY_REVIEW_REF' as const

export interface LucidL2P0GateState {
  executionEnabled: boolean
  p0GatesClosed: boolean
  securityReviewRef?: string
  allClosed: boolean
  openGates: LucidL2P0GateId[]
  requiredEnv: readonly [
    typeof LUCID_L2_EXECUTION_ENABLED_ENV,
    typeof LUCID_L2_P0_GATES_CLOSED_ENV,
    typeof LUCID_L2_SECURITY_REVIEW_REF_ENV,
  ]
}

export interface LucidL2P0ExecutionGateInput {
  env?: Record<string, string | undefined>
  surface: string
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function isTruthy(value: string | undefined): boolean {
  return TRUE_VALUES.has((value ?? '').trim().toLowerCase())
}

export function getLucidL2P0GateState(
  env: Record<string, string | undefined> = process.env,
): LucidL2P0GateState {
  const executionEnabled = isTruthy(env[LUCID_L2_EXECUTION_ENABLED_ENV])
  const p0GatesClosed = isTruthy(env[LUCID_L2_P0_GATES_CLOSED_ENV])
  const securityReviewRef = env[LUCID_L2_SECURITY_REVIEW_REF_ENV]?.trim()
  const allClosed = executionEnabled && p0GatesClosed && Boolean(securityReviewRef)

  return {
    executionEnabled,
    p0GatesClosed,
    securityReviewRef: securityReviewRef || undefined,
    allClosed,
    openGates: allClosed ? [] : [...LUCID_L2_P0_GATE_IDS],
    requiredEnv: [
      LUCID_L2_EXECUTION_ENABLED_ENV,
      LUCID_L2_P0_GATES_CLOSED_ENV,
      LUCID_L2_SECURITY_REVIEW_REF_ENV,
    ],
  }
}

export function assertLucidL2P0ExecutionGate(input: LucidL2P0ExecutionGateInput): void {
  const state = getLucidL2P0GateState(input.env)
  if (state.allClosed) return

  throw new AgentCommerceError(
    'provider_unavailable',
    'Lucid-L2 execution remains blocked until P0 gates are closed and reviewed.',
    503,
    {
      details: {
        reason_code: 'lucid_l2_gate_open',
        surface: input.surface,
        open_gates: state.openGates,
        required_env: state.requiredEnv,
      },
    },
  )
}
