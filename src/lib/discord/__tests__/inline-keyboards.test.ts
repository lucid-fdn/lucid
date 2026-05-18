import { describe, it, expect } from 'vitest'
import {
  signCustomId,
  verifyCustomId,
  agentsComponents,
  leaveConfirmComponents,
  modelsComponents,
  DISCORD_CUSTOM_ID_MAX_BYTES,
  COMPONENT_TYPE,
  BUTTON_STYLE,
  SELECT_OPTIONS_MAX,
  type GuildBinding,
  type GuildModelChoice,
} from '../inline-keyboards'

const SECRET = 'a'.repeat(32)

function makeBindings(n: number): GuildBinding[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ch-${i}`,
    assistant_id: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
    assistant_name: `Agent ${i}`,
    assistant_description: null,
    is_primary: i === 0,
  }))
}

function makeModels(n: number): GuildModelChoice[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `model-${i}`,
    name: `Model ${i}`,
    provider: i % 2 === 0 ? 'openai' : 'anthropic',
    is_current: i === 0,
  }))
}

describe('signCustomId / verifyCustomId', () => {
  it('round-trips a signed payload', () => {
    const id = signCustomId({
      action: 'agents_select',
      args: ['guild123', 'user123', '0'],
      secret: SECRET,
    })
    const parsed = verifyCustomId(id, { secret: SECRET })
    expect(parsed).not.toBeNull()
    expect(parsed!.action).toBe('agents_select')
    expect(parsed!.args).toEqual(['guild123', 'user123', '0'])
  })

  it('enforces expectedAction binding', () => {
    const id = signCustomId({
      action: 'agents_select',
      args: ['g1', 'u1'],
      secret: SECRET,
    })
    expect(
      verifyCustomId(id, { expectedAction: 'leave_confirm', secret: SECRET }),
    ).toBeNull()
    expect(
      verifyCustomId(id, { expectedAction: 'agents_select', secret: SECRET }),
    ).not.toBeNull()
  })

  it('rejects an expired custom_id', () => {
    const now = 1_700_000_000_000
    const id = signCustomId({
      action: 'agents_page',
      args: ['g1', 'u1', '0'],
      secret: SECRET,
      now,
      ttlSeconds: 60,
    })
    expect(
      verifyCustomId(id, { secret: SECRET, now: now + 120_000 }),
    ).toBeNull()
  })

  it('rejects a signature forged with a different secret', () => {
    const id = signCustomId({
      action: 'agents_select',
      args: ['g1'],
      secret: SECRET,
    })
    expect(verifyCustomId(id, { secret: 'b'.repeat(32) })).toBeNull()
  })

  it('throws when args or action contain the separator', () => {
    expect(() =>
      signCustomId({ action: 'bad:action', args: [], secret: SECRET }),
    ).toThrow()
    expect(() =>
      signCustomId({
        action: 'ok',
        args: ['has:colon'],
        secret: SECRET,
      }),
    ).toThrow()
  })

  it('rejects custom_id exceeding Discord cap', () => {
    const long = 'x'.repeat(DISCORD_CUSTOM_ID_MAX_BYTES + 10)
    expect(verifyCustomId(long, { secret: SECRET })).toBeNull()
  })

  it('rejects malformed signatures', () => {
    expect(verifyCustomId('', { secret: SECRET })).toBeNull()
    expect(verifyCustomId('noColon', { secret: SECRET })).toBeNull()
    expect(
      verifyCustomId('agents_select:g1:1700000000:zzzzzzzzzzzzzzzz', {
        secret: SECRET,
      }),
    ).toBeNull()
  })
})

describe('agentsComponents', () => {
  it('returns empty array when no bindings', () => {
    expect(agentsComponents([], { guildId: 'g1', secret: SECRET })).toEqual([])
  })

  it('renders a single select row under 25 bindings', () => {
    const rows = agentsComponents(makeBindings(3), {
      guildId: 'g1',
      userId: 'u1',
      secret: SECRET,
    })
    expect(rows).toHaveLength(1)
    const select = rows[0]!.components[0]! as { type: number; options: unknown[]; custom_id: string }
    expect(select.type).toBe(COMPONENT_TYPE.STRING_SELECT)
    expect(select.options).toHaveLength(3)
    // Custom id is signed with the agents_select action
    const parsed = verifyCustomId(select.custom_id, {
      secret: SECRET,
      expectedAction: 'agents_select',
    })
    expect(parsed).not.toBeNull()
  })

  it('marks the primary binding with ✓', () => {
    const rows = agentsComponents(makeBindings(2), {
      guildId: 'g1',
      userId: 'u1',
      secret: SECRET,
    })
    const select = rows[0]!.components[0]! as {
      options: Array<{ label: string }>
    }
    expect(select.options[0]!.label.startsWith('✓')).toBe(true)
    expect(select.options[1]!.label.startsWith('✓')).toBe(false)
  })

  it('paginates above 25 bindings with nav buttons', () => {
    const bindings = makeBindings(SELECT_OPTIONS_MAX + 5)
    const rows = agentsComponents(bindings, {
      guildId: 'g1',
      userId: 'u1',
      secret: SECRET,
      page: 0,
    })
    expect(rows).toHaveLength(2)
    const select = rows[0]!.components[0]! as { options: unknown[] }
    expect(select.options).toHaveLength(SELECT_OPTIONS_MAX)
    const navRow = rows[1]!
    // Page 0 → no Prev, current page indicator, Next
    const buttons = navRow.components as Array<{ label: string; style: number; disabled?: boolean }>
    expect(buttons.some((b) => b.label === 'Next ▶')).toBe(true)
    expect(buttons.some((b) => b.label === '◀ Prev')).toBe(false)
  })
})

describe('leaveConfirmComponents', () => {
  it('returns danger + cancel pair with signed custom_ids', () => {
    const rows = leaveConfirmComponents({
      guildId: 'g1',
      userId: 'u1',
      assistantId: 'a1',
      secret: SECRET,
    })
    expect(rows).toHaveLength(1)
    const buttons = rows[0]!.components as Array<{
      style: number
      custom_id: string
    }>
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.style).toBe(BUTTON_STYLE.DANGER)
    expect(buttons[1]!.style).toBe(BUTTON_STYLE.SECONDARY)
    expect(
      verifyCustomId(buttons[0]!.custom_id, {
        secret: SECRET,
        expectedAction: 'leave_confirm',
      }),
    ).not.toBeNull()
    expect(
      verifyCustomId(buttons[1]!.custom_id, {
        secret: SECRET,
        expectedAction: 'leave_cancel',
      }),
    ).not.toBeNull()
  })
})

describe('modelsComponents', () => {
  it('returns empty array when no models', () => {
    expect(modelsComponents([], { guildId: 'g1', userId: 'u1', secret: SECRET })).toEqual([])
  })

  it('renders a select row for models', () => {
    const rows = modelsComponents(makeModels(3), {
      guildId: 'g1',
      userId: 'u1',
      secret: SECRET,
    })
    expect(rows).toHaveLength(1)
    const select = rows[0]!.components[0]! as { type: number; options: unknown[]; custom_id: string }
    expect(select.type).toBe(COMPONENT_TYPE.STRING_SELECT)
    expect(select.options).toHaveLength(3)
    const parsed = verifyCustomId(select.custom_id, {
      secret: SECRET,
      expectedAction: 'model_select',
    })
    expect(parsed).not.toBeNull()
  })

  it('marks the current model and paginates when needed', () => {
    const rows = modelsComponents(makeModels(SELECT_OPTIONS_MAX + 2), {
      guildId: 'g1',
      userId: 'u1',
      secret: SECRET,
      page: 0,
    })
    expect(rows).toHaveLength(2)
    const select = rows[0]!.components[0]! as {
      options: Array<{ label: string }>
    }
    expect(select.options[0]!.label.startsWith('[current]')).toBe(true)
    const buttons = rows[1]!.components as Array<{ label: string }>
    expect(buttons.some((b) => b.label === 'Next >')).toBe(true)
  })
})
