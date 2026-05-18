import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPrimary = vi.fn()
const mockListChannels = vi.fn()

vi.mock('@/lib/db', () => ({
  getPrimaryTelegramChannelForChat: (...args: unknown[]) => mockGetPrimary(...args),
  listTelegramChannelsForChat: (...args: unknown[]) => mockListChannels(...args),
}))

import { parseStartPayload, resolveActiveAgent } from '../hosted-router'

const UUID = '11111111-2222-3333-4444-555555555555'

describe('parseStartPayload', () => {
  it('returns null for non-/start text', () => {
    expect(parseStartPayload('hello')).toBeNull()
    expect(parseStartPayload('/help')).toBeNull()
  })

  it('parses bare /start as kind=none', () => {
    expect(parseStartPayload('/start')).toEqual({ kind: 'none' })
  })

  it('tolerates @bot suffix on /start', () => {
    expect(parseStartPayload('/start@LucidBot')).toEqual({ kind: 'none' })
  })

  it('parses /start <opaque> as connect_token', () => {
    expect(parseStartPayload('/start abcd1234XYZ')).toEqual({
      kind: 'connect_token',
      token: 'abcd1234XYZ',
    })
  })

  it('parses /start agent_<uuid> as agent_share', () => {
    expect(parseStartPayload(`/start agent_${UUID}`)).toEqual({
      kind: 'agent_share',
      assistantId: UUID,
    })
  })

  it('falls back to connect_token if agent_ payload is malformed UUID', () => {
    // Token literally starts with "agent_" but is not a UUID — must not be
    // swallowed as agent_share, the DB lookup would silently reject.
    expect(parseStartPayload('/start agent_not-a-uuid')).toEqual({
      kind: 'connect_token',
      token: 'agent_not-a-uuid',
    })
  })

  it('tolerates @bot suffix combined with payload', () => {
    expect(parseStartPayload(`/start@LucidBot agent_${UUID}`)).toEqual({
      kind: 'agent_share',
      assistantId: UUID,
    })
  })
})

describe('resolveActiveAgent', () => {
  beforeEach(() => {
    mockGetPrimary.mockReset()
    mockListChannels.mockReset()
  })

  it('returns primary when one exists', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'ch1', assistant_id: 'a1' })
    const result = await resolveActiveAgent('123')
    expect(result).toEqual({
      kind: 'primary',
      channel: { id: 'ch1', assistant_id: 'a1' },
    })
    // listTelegramChannelsForChat must NOT be called when primary is found
    expect(mockListChannels).not.toHaveBeenCalled()
  })

  it('returns has_bindings_no_primary when bindings exist but no primary', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([
      { id: 'ch1', assistant_id: 'a1', assistant_name: 'Alice', is_primary: false },
      { id: 'ch2', assistant_id: 'a2', assistant_name: 'Bob', is_primary: false },
    ])
    const result = await resolveActiveAgent('123')
    expect(result.kind).toBe('has_bindings_no_primary')
    if (result.kind === 'has_bindings_no_primary') {
      expect(result.bindings).toHaveLength(2)
    }
  })

  it('returns no_bindings when chat is unknown', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([])
    const result = await resolveActiveAgent('123')
    expect(result).toEqual({ kind: 'no_bindings' })
  })
})
