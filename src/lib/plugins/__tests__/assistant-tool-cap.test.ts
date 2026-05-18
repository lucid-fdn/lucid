import { describe, expect, it } from 'vitest'

import {
  formatAssistantToolCapMessage,
  getActiveUnifiedSkillToolCount,
  getEnabledToolCount,
  HARD_MAX_TOOLS_PER_AGENT,
} from '../assistant-tool-cap'

describe('assistant-tool-cap', () => {
  it('counts enabled tools when explicitly configured', () => {
    expect(getEnabledToolCount(['a', 'b'], 10)).toBe(2)
  })

  it('falls back to tool_count when enabled_tools is not set', () => {
    expect(getEnabledToolCount(null, 7)).toBe(7)
  })

  it('counts only active plugin items for an agent', () => {
    expect(getActiveUnifiedSkillToolCount([
      { item_type: 'plugin', is_active: true, enabled_tools: ['a', 'b'], tool_count: 10 },
      { item_type: 'plugin', is_active: true, enabled_tools: null, tool_count: 5 },
      { item_type: 'plugin', is_active: false, enabled_tools: null, tool_count: 99 },
      { item_type: 'skill', is_active: true, enabled_tools: null, tool_count: 50 },
    ])).toBe(7)
  })

  it('formats the hard cap message', () => {
    expect(formatAssistantToolCapMessage(HARD_MAX_TOOLS_PER_AGENT)).toContain(`${HARD_MAX_TOOLS_PER_AGENT}`)
  })
})
