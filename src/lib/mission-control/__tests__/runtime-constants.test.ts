import { describe, it, expect } from 'vitest'
import {
  PROVIDER_LABELS,
  CONNECTION_STATUS_COLORS,
  RUNTIME_POLL_INTERVAL,
  ELEVATED_TOOLS,
  getStatusLabel,
  getEventLabel,
  getConnectionLabel,
  getPresenceLabel,
  STATUS_EXPRESSIONS,
  EVENT_EXPRESSIONS,
  CONNECTION_EXPRESSIONS,
  PRESENCE_EXPRESSIONS,
} from '../constants'

describe('PROVIDER_LABELS', () => {
  it('has labels for all 7 providers', () => {
    const expectedProviders = ['railway', 'akash', 'phala', 'io.net', 'nosana', 'docker', 'manual']
    for (const provider of expectedProviders) {
      expect(PROVIDER_LABELS[provider]).toBeDefined()
      expect(typeof PROVIDER_LABELS[provider]).toBe('string')
      expect(PROVIDER_LABELS[provider].length).toBeGreaterThan(0)
    }
  })

  it('returns undefined for unknown providers', () => {
    expect(PROVIDER_LABELS['kubernetes']).toBeUndefined()
  })
})

describe('CONNECTION_STATUS_COLORS', () => {
  it('has colors for all 3 connection states', () => {
    expect(CONNECTION_STATUS_COLORS.connected).toContain('green')
    expect(CONNECTION_STATUS_COLORS.stale).toContain('amber')
    expect(CONNECTION_STATUS_COLORS.offline).toBeDefined()
  })
})

describe('expression catalogs', () => {
  it('has expressions for all agent statuses', () => {
    for (const status of ['active', 'paused', 'error', 'idle']) {
      expect(STATUS_EXPRESSIONS[status].length).toBeGreaterThanOrEqual(4)
    }
  })

  it('has expressions for all event types', () => {
    for (const type of ['tool_call', 'error', 'run_started', 'run_finished', 'transaction_confirmed']) {
      expect(EVENT_EXPRESSIONS[type].length).toBeGreaterThanOrEqual(3)
    }
  })

  it('has expressions for all connection states', () => {
    for (const status of ['connected', 'stale', 'offline']) {
      expect(CONNECTION_EXPRESSIONS[status].length).toBeGreaterThanOrEqual(3)
    }
  })

  it('has expressions for all presence states', () => {
    for (const state of ['idle', 'receiving', 'thinking', 'tool-calling', 'responding']) {
      expect(PRESENCE_EXPRESSIONS[state].length).toBeGreaterThanOrEqual(5)
    }
  })

  it('returns deterministic labels for same seed', () => {
    const a = getStatusLabel('active', 'agent-123')
    const b = getStatusLabel('active', 'agent-123')
    expect(a).toBe(b)
  })

  it('returns different labels for different seeds', () => {
    const labels = new Set<string>()
    for (let i = 0; i < 20; i++) {
      labels.add(getStatusLabel('active', `agent-${i}`))
    }
    expect(labels.size).toBeGreaterThan(1)
  })

  it('falls back to key for unknown categories', () => {
    expect(getStatusLabel('unknown_status')).toBe('unknown_status')
    expect(getEventLabel('unknown_event')).toBe('unknown_event')
    expect(getConnectionLabel('unknown')).toBe('unknown')
    expect(getPresenceLabel('unknown')).toBe('unknown')
  })
})

describe('RUNTIME_POLL_INTERVAL', () => {
  it('is 30 seconds', () => {
    expect(RUNTIME_POLL_INTERVAL).toBe(30_000)
  })
})

describe('ELEVATED_TOOLS', () => {
  it('includes all 4 elevated tools', () => {
    expect(ELEVATED_TOOLS).toContain('dex_swap')
    expect(ELEVATED_TOOLS).toContain('wallet_transfer')
    expect(ELEVATED_TOOLS).toContain('hl_place_order')
    expect(ELEVATED_TOOLS).toContain('hl_cancel_order')
    expect(ELEVATED_TOOLS).toHaveLength(4)
  })
})
