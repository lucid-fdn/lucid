import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPrimary = vi.fn()
const mockListChannels = vi.fn()

vi.mock('@/lib/db', () => ({
  getPrimaryDiscordChannelForGuild: (...args: unknown[]) =>
    mockGetPrimary(...args),
  listDiscordChannelsForGuild: (...args: unknown[]) =>
    mockListChannels(...args),
}))

import {
  parseInteractionPayload,
  hasGuildAdminPerms,
  resolveActiveAgent,
  INTERACTION_TYPE,
} from '../hosted-router'

beforeEach(() => {
  mockGetPrimary.mockReset()
  mockListChannels.mockReset()
})

describe('parseInteractionPayload', () => {
  it('parses a PING', () => {
    const parsed = parseInteractionPayload({ type: INTERACTION_TYPE.PING })
    expect(parsed.kind).toBe('ping')
  })

  it('parses a slash command', () => {
    const parsed = parseInteractionPayload({
      type: INTERACTION_TYPE.APPLICATION_COMMAND,
      id: 'i1',
      token: 't1',
      guild_id: 'g1',
      channel_id: 'c1',
      member: { user: { id: 'u1' }, permissions: '8' },
      data: {
        name: 'switch',
        options: [{ name: 'name', type: 3, value: 'alice' }],
      },
    })
    expect(parsed.kind).toBe('slash_command')
    if (parsed.kind !== 'slash_command') return
    expect(parsed.commandName).toBe('switch')
    expect(parsed.userId).toBe('u1')
    expect(parsed.guildId).toBe('g1')
    expect(parsed.options[0]).toEqual({
      name: 'name',
      type: 3,
      value: 'alice',
    })
  })

  it('parses an autocomplete', () => {
    const parsed = parseInteractionPayload({
      type: INTERACTION_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE,
      id: 'i1',
      token: 't1',
      guild_id: 'g1',
      member: { user: { id: 'u1' } },
      data: {
        name: 'switch',
        options: [
          { name: 'name', type: 3, value: 'ali', focused: true },
        ],
      },
    })
    expect(parsed.kind).toBe('autocomplete')
    if (parsed.kind !== 'autocomplete') return
    expect(parsed.focusedOption).toEqual({ name: 'name', value: 'ali' })
  })

  it('parses a component interaction', () => {
    const parsed = parseInteractionPayload({
      type: INTERACTION_TYPE.MESSAGE_COMPONENT,
      id: 'i1',
      token: 't1',
      guild_id: 'g1',
      channel_id: 'c1',
      member: { user: { id: 'u1' }, permissions: '0' },
      data: {
        custom_id: 'agents_select:g1:0:abc',
        component_type: 3,
        values: ['a-uuid'],
      },
    })
    expect(parsed.kind).toBe('component')
    if (parsed.kind !== 'component') return
    expect(parsed.customId).toBe('agents_select:g1:0:abc')
    expect(parsed.values).toEqual(['a-uuid'])
  })

  it('returns unknown for missing fields', () => {
    expect(parseInteractionPayload(null).kind).toBe('unknown')
    expect(parseInteractionPayload({ type: 999 }).kind).toBe('unknown')
    expect(
      parseInteractionPayload({
        type: INTERACTION_TYPE.APPLICATION_COMMAND,
      }).kind,
    ).toBe('unknown')
  })

  it('uses obj.user when member is absent (DM)', () => {
    const parsed = parseInteractionPayload({
      type: INTERACTION_TYPE.APPLICATION_COMMAND,
      id: 'i1',
      token: 't1',
      user: { id: 'dm-user' },
      data: { name: 'help' },
    })
    expect(parsed.kind).toBe('slash_command')
    if (parsed.kind !== 'slash_command') return
    expect(parsed.userId).toBe('dm-user')
    expect(parsed.guildId).toBeNull()
  })
})

describe('hasGuildAdminPerms', () => {
  it('returns false on null', () => {
    expect(hasGuildAdminPerms(null)).toBe(false)
  })
  it('returns true when ADMINISTRATOR bit is set', () => {
    expect(hasGuildAdminPerms('8')).toBe(true) // 1 << 3
  })
  it('returns true when MANAGE_GUILD bit is set', () => {
    expect(hasGuildAdminPerms('32')).toBe(true) // 1 << 5
  })
  it('returns false for non-privileged bitfields', () => {
    expect(hasGuildAdminPerms('1')).toBe(false)
    expect(hasGuildAdminPerms('2')).toBe(false)
  })
  it('handles huge bitfields via BigInt', () => {
    // 1 << 62 OR 1 << 3 = admin present
    const bits = (1n << 62n) | (1n << 3n)
    expect(hasGuildAdminPerms(bits.toString())).toBe(true)
  })
  it('returns false for invalid bitfields', () => {
    expect(hasGuildAdminPerms('not-a-number')).toBe(false)
  })
})

describe('resolveActiveAgent', () => {
  it('returns primary when one exists', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'ch1', assistant_id: 'a1' })
    const res = await resolveActiveAgent('g1')
    expect(res.kind).toBe('primary')
  })

  it('returns has_bindings_no_primary when bindings exist but none primary', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Alice', is_primary: false },
    ])
    const res = await resolveActiveAgent('g1')
    expect(res.kind).toBe('has_bindings_no_primary')
  })

  it('returns no_bindings when empty', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([])
    const res = await resolveActiveAgent('g1')
    expect(res.kind).toBe('no_bindings')
  })
})
