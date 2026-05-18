import { describe, expect, it } from 'vitest'
import {
  agentsKeyboard,
  fitsTelegramCallbackData,
  launcherKeyboard,
  MAX_KEYBOARD_ROWS,
  onboardingKeyboard,
  PAGE_SIZE,
  parseCallbackData,
  replyControlsKeyboard,
  scopeSwitchKeyboard,
  TELEGRAM_CALLBACK_DATA_MAX_BYTES,
  TELEGRAM_LAUNCHER_AGENTS_TEXT,
  TELEGRAM_LAUNCHER_SWITCH_TEXT,
  TELEGRAM_LAUNCHER_VOICE_TEXT,
  TELEGRAM_LAUNCHER_WHOAMI_TEXT,
  TELEGRAM_LAUNCHER_WORKSPACE_TEXT,
  workspaceKeyboard,
} from '../inline-keyboards'

const UUID_A = '11111111-2222-3333-4444-555555555555'
const UUID_B = '99999999-8888-7777-6666-555555555555'

describe('agentsKeyboard', () => {
  it('builds one button per binding with stable callback_data', () => {
    const kb = agentsKeyboard([
      { id: 'ch1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: false },
      { id: 'ch2', assistant_id: UUID_B, assistant_name: 'Bob', is_primary: true },
    ])
    expect(kb.inline_keyboard).toHaveLength(2)
    expect(kb.inline_keyboard[0][0]).toEqual({
      text: 'Alice',
      callback_data: `switch:${UUID_A}`,
    })
    expect(kb.inline_keyboard[1][0]).toEqual({
      text: '✅ Bob',
      callback_data: `switch:${UUID_B}`,
      style: 'success',
    })
  })

  it('renders role titles when available', () => {
    const kb = agentsKeyboard([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Closer',
        assistant_role_title: 'Lead Conversion Specialist',
        is_primary: true,
      },
    ])
    expect(kb.inline_keyboard[0][0]?.text).toContain('Closer • Lead Conversion Specialist')
  })

  it('renders all rows (no pagination) up to MAX_KEYBOARD_ROWS bindings', () => {
    const bindings = Array.from({ length: MAX_KEYBOARD_ROWS }, (_, i) => ({
      id: `c${i}`,
      assistant_id: UUID_A,
      assistant_name: `Agent ${i}`,
      is_primary: false,
    }))
    const kb = agentsKeyboard(bindings)
    expect(kb.inline_keyboard).toHaveLength(MAX_KEYBOARD_ROWS)
    expect(kb.inline_keyboard.every((row) => row.length === 1)).toBe(true)
  })

  it('returns empty keyboard for empty bindings', () => {
    expect(agentsKeyboard([])).toEqual({ inline_keyboard: [] })
  })

  describe('pagination', () => {
    const manyBindings = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      assistant_id: `${String(i).padStart(8, '0')}-2222-3333-4444-555555555555`,
      assistant_name: `Agent ${i}`,
      is_primary: false,
    }))

    it('paginates when bindings exceed MAX_KEYBOARD_ROWS (page 0: no Prev, has Next)', () => {
      const kb = agentsKeyboard(manyBindings)
      expect(kb.inline_keyboard).toHaveLength(PAGE_SIZE + 1)
      const navRow = kb.inline_keyboard[PAGE_SIZE]
      expect(navRow).toHaveLength(2)
      expect(navRow[0].text).toBe('1/3')
      expect(navRow[0].callback_data).toBe('page:0')
      expect(navRow[1].text).toBe('Next ➡')
      expect(navRow[1].callback_data).toBe('page:1')
    })

    it('middle page has Prev, indicator, and Next', () => {
      const kb = agentsKeyboard(manyBindings, { page: 1 })
      const navRow = kb.inline_keyboard[PAGE_SIZE]
      expect(navRow).toHaveLength(3)
      expect(navRow[0].callback_data).toBe('page:0')
      expect(navRow[0].text).toBe('⬅ Prev')
      expect(navRow[1].text).toBe('2/3')
      expect(navRow[2].callback_data).toBe('page:2')
    })

    it('last page has Prev + indicator only, no Next', () => {
      const kb = agentsKeyboard(manyBindings, { page: 2 })
      expect(kb.inline_keyboard).toHaveLength(4 + 1)
      const navRow = kb.inline_keyboard[4]
      expect(navRow).toHaveLength(2)
      expect(navRow[0].callback_data).toBe('page:1')
      expect(navRow[0].text).toBe('⬅ Prev')
      expect(navRow[1].text).toBe('3/3')
    })

    it('clamps out-of-range page to last page', () => {
      const kb = agentsKeyboard(manyBindings, { page: 99 })
      const navRow = kb.inline_keyboard[kb.inline_keyboard.length - 1]
      expect(navRow[navRow.length - 1].text).toBe('3/3')
    })

    it('clamps negative and non-finite pages to 0', () => {
      const a = agentsKeyboard(manyBindings, { page: -5 })
      const navA = a.inline_keyboard[PAGE_SIZE]
      expect(navA[0].text).toBe('1/3')
      const b = agentsKeyboard(manyBindings, { page: Number.NaN })
      const navB = b.inline_keyboard[PAGE_SIZE]
      expect(navB[0].text).toBe('1/3')
    })
  })
})

describe('parseCallbackData', () => {
  it('parses valid switch payload', () => {
    expect(parseCallbackData(`switch:${UUID_A}`)).toEqual({
      kind: 'switch',
      assistantId: UUID_A,
    })
  })

  it('rejects malformed payloads', () => {
    expect(parseCallbackData('switch:not-a-uuid')).toBeNull()
    expect(parseCallbackData(UUID_A)).toBeNull()
    expect(parseCallbackData('delete:' + UUID_A)).toBeNull()
    expect(parseCallbackData('')).toBeNull()
  })

  it('parses valid page payload', () => {
    expect(parseCallbackData('page:0')).toEqual({ kind: 'page', page: 0 })
    expect(parseCallbackData('page:7')).toEqual({ kind: 'page', page: 7 })
    expect(parseCallbackData('page:99')).toEqual({ kind: 'page', page: 99 })
  })

  it('parses panel payloads', () => {
    expect(parseCallbackData('panel:agents')).toEqual({ kind: 'panel', panel: 'agents' })
    expect(parseCallbackData('panel:help')).toEqual({ kind: 'panel', panel: 'help' })
    expect(parseCallbackData('panel:switch')).toEqual({ kind: 'panel', panel: 'switch' })
    expect(parseCallbackData('panel:start')).toEqual({ kind: 'panel', panel: 'start' })
  })

  it('parses scope payloads', () => {
    expect(parseCallbackData(`scopea:${UUID_A}`)).toEqual({
      kind: 'scope',
      mode: 'assistant',
      assistantId: UUID_A,
    })
    expect(parseCallbackData(`scopet:${UUID_A}`)).toEqual({
      kind: 'scope',
      mode: 'token',
      token: UUID_A,
    })
    expect(parseCallbackData('scopecancel')).toEqual({
      kind: 'scope',
      mode: 'cancel',
    })
  })

  it('parses workspace payloads', () => {
    expect(parseCallbackData(`workspace:${UUID_A}`)).toEqual({
      kind: 'workspace',
      orgId: UUID_A,
    })
  })

  it('rejects malformed page payloads', () => {
    expect(parseCallbackData('page:')).toBeNull()
    expect(parseCallbackData('page:abc')).toBeNull()
    expect(parseCallbackData('page:-1')).toBeNull()
    expect(parseCallbackData('page:100')).toBeNull()
  })

  it('rejects payloads exceeding the 64-byte Telegram cap', () => {
    const overlong = 'switch:' + 'a'.repeat(58)
    expect(Buffer.byteLength(overlong, 'utf8')).toBe(65)
    expect(parseCallbackData(overlong)).toBeNull()
  })
})

describe('panel keyboards', () => {
  it('builds onboarding keyboard', () => {
    expect(onboardingKeyboard().inline_keyboard).toEqual([
      [{ text: 'Talk Here', callback_data: 'panel:start', style: 'primary' }],
      [{ text: 'Meet Other Agents', callback_data: 'panel:agents' }],
    ])
  })

  it('builds reply controls keyboard', () => {
    expect(replyControlsKeyboard().inline_keyboard[0]).toEqual([
      { text: 'Switch Agent', callback_data: 'panel:switch', style: 'primary' },
      { text: 'Meet Others', callback_data: 'panel:agents' },
      { text: 'Help', callback_data: 'panel:help' },
    ])
  })

  it('builds persistent launcher keyboard', () => {
    expect(launcherKeyboard()).toEqual({
      keyboard: [
        [
          { text: TELEGRAM_LAUNCHER_SWITCH_TEXT },
          { text: TELEGRAM_LAUNCHER_AGENTS_TEXT },
        ],
        [
          { text: TELEGRAM_LAUNCHER_WORKSPACE_TEXT },
          { text: TELEGRAM_LAUNCHER_VOICE_TEXT },
        ],
        [{ text: TELEGRAM_LAUNCHER_WHOAMI_TEXT }],
      ],
      resize_keyboard: true,
      is_persistent: true,
      input_field_placeholder: 'Message the active Lucid agent',
    })
  })

  it('builds scope switch keyboard', () => {
    expect(scopeSwitchKeyboard({ assistantId: UUID_A }).inline_keyboard[0]).toEqual([
      { text: 'Switch Workspace', callback_data: `scopea:${UUID_A}`, style: 'primary' },
      { text: 'Keep Current', callback_data: 'scopecancel', style: 'success' },
    ])
  })

  it('builds workspace keyboard', () => {
    expect(workspaceKeyboard([
      { org_id: UUID_A, org_name: 'Alpha', agent_count: 2, is_current: true },
    ]).inline_keyboard[0]).toEqual([
      { text: '✅ Alpha (2)', callback_data: `workspace:${UUID_A}`, style: 'success' },
    ])
  })
})

describe('fitsTelegramCallbackData', () => {
  it('accepts payloads at or under 64 bytes', () => {
    expect(fitsTelegramCallbackData('')).toBe(true)
    expect(fitsTelegramCallbackData('a'.repeat(TELEGRAM_CALLBACK_DATA_MAX_BYTES))).toBe(true)
  })

  it('rejects payloads over 64 bytes', () => {
    expect(fitsTelegramCallbackData('a'.repeat(TELEGRAM_CALLBACK_DATA_MAX_BYTES + 1))).toBe(false)
  })

  it('measures UTF-8 bytes, not characters (multi-byte emoji)', () => {
    const sixteenRockets = '🚀'.repeat(16)
    expect(fitsTelegramCallbackData(sixteenRockets)).toBe(true)
    const seventeenRockets = '🚀'.repeat(17)
    expect(fitsTelegramCallbackData(seventeenRockets)).toBe(false)
  })

  it('built-in switch callback_data fits with room to spare', () => {
    const payload = 'switch:11111111-2222-3333-4444-555555555555'
    expect(Buffer.byteLength(payload, 'utf8')).toBe(43)
    expect(fitsTelegramCallbackData(payload)).toBe(true)
  })
})
