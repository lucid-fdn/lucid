export type NativeSchedulerMode =
  | 'disabled'
  | 'observe'
  | 'import'
  | 'delegate_experimental'
  | 'delegate_supported'

export interface NativeSchedulerCapabilityLike {
  id?: string
  kind?: string
  supportLevel?: string
  availability?: string
  readOnly?: boolean
  metadata?: Record<string, unknown>
}

export interface NativeSchedulerDecision {
  mode: NativeSchedulerMode
  allowed: boolean
  executionDelegated: boolean
  reasons: string[]
  requiredCapabilities: string[]
}

const OBSERVE_CAPABILITIES = ['scheduled.native_scheduler.observe']
const IMPORT_CAPABILITIES = ['scheduled.native_scheduler.observe', 'scheduled.native_scheduler.import']
const DELEGATE_CAPABILITIES = [
  'scheduled.native_scheduler.delegate',
  'scheduled.ack',
  'scheduled.reconcile',
  'scheduled.idempotency',
]

function capabilityKey(capability: NativeSchedulerCapabilityLike): string[] {
  return [capability.id, capability.kind].filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function hasCapability(capabilities: NativeSchedulerCapabilityLike[], required: string): boolean {
  return capabilities.some((capability) => {
    if (capability.availability === 'unavailable') return false
    if (capability.availability === 'unknown') return false
    if (capability.supportLevel === 'unsupported') return false
    return capabilityKey(capability).includes(required)
  })
}

function isDelegateStable(capabilities: NativeSchedulerCapabilityLike[]): boolean {
  return capabilities.some((capability) => (
    capabilityKey(capability).includes('scheduled.native_scheduler.delegate') &&
    capability.supportLevel === 'stable' &&
    capability.availability !== 'unavailable' &&
    capability.readOnly !== true
  ))
}

export function evaluateNativeSchedulerDecision(input: {
  requestedMode: NativeSchedulerMode | null | undefined
  capabilities?: NativeSchedulerCapabilityLike[] | null
}): NativeSchedulerDecision {
  const mode = input.requestedMode ?? 'disabled'
  const capabilities = input.capabilities ?? []
  if (mode === 'disabled') {
    return {
      mode,
      allowed: true,
      executionDelegated: false,
      reasons: ['Lucid Routine scheduler remains the source of truth.'],
      requiredCapabilities: [],
    }
  }

  const requiredCapabilities = mode === 'observe'
    ? OBSERVE_CAPABILITIES
    : mode === 'import'
      ? IMPORT_CAPABILITIES
      : DELEGATE_CAPABILITIES

  const missing = requiredCapabilities.filter((capability) => !hasCapability(capabilities, capability))
  const reasons: string[] = missing.map((capability) => `Missing runtime capability: ${capability}`)

  if (mode === 'delegate_supported' && !isDelegateStable(capabilities)) {
    reasons.push('Native scheduler delegation must be stable, writable, and ACK/reconcile-capable before supported delegation is allowed.')
  }

  return {
    mode,
    allowed: reasons.length === 0,
    executionDelegated: (mode === 'delegate_experimental' || mode === 'delegate_supported') && missing.length === 0 && (mode === 'delegate_experimental' || isDelegateStable(capabilities)),
    reasons: mode === 'delegate_experimental' && missing.length === 0
      ? ['Experimental delegation allowed; Lucid receipts remain canonical audit state.']
      : reasons,
    requiredCapabilities,
  }
}
