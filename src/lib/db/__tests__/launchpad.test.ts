import { describe, it, expect } from 'vitest'
import {
  CreateLaunchedAgentInput,
  LaunchpadCategory,
  LaunchStatus,
  RecordUsageInput,
} from '@contracts/launchpad'

describe('launchpad contracts', () => {
  it('validates CreateLaunchedAgentInput', () => {
    const valid = {
      assistant_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      creator_wallet: 'SoLWaLLeTaDdReSs',
      org_id: 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b',
      slug: 'my-agent',
      display_name: 'My Agent',
    }

    expect(() => CreateLaunchedAgentInput.parse(valid)).not.toThrow()
  })

  it('rejects invalid slug', () => {
    const invalid = {
      assistant_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      creator_wallet: 'wallet',
      org_id: 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b',
      slug: 'INVALID SLUG!',
      display_name: 'Test',
    }

    expect(() => CreateLaunchedAgentInput.parse(invalid)).toThrow()
  })

  it('validates categories', () => {
    expect(() => LaunchpadCategory.parse('trading')).not.toThrow()
    expect(() => LaunchpadCategory.parse('invalid')).toThrow()
  })

  it('validates launch statuses', () => {
    expect(() => LaunchStatus.parse('draft')).not.toThrow()
    expect(() => LaunchStatus.parse('nonexistent')).toThrow()
  })

  it('validates RecordUsageInput', () => {
    const valid = {
      launched_agent_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      payment_method: 'crypto' as const,
      amount_usdc: 0.01,
    }

    expect(() => RecordUsageInput.parse(valid)).not.toThrow()
  })

  it('rejects negative usage amount', () => {
    const invalid = {
      launched_agent_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      payment_method: 'crypto' as const,
      amount_usdc: -1,
    }

    expect(() => RecordUsageInput.parse(invalid)).toThrow()
  })
})
