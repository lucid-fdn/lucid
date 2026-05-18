import { describe, it, expect } from 'vitest'
import { KNOWN_NATIVE_TOOLS, resolveEffectiveNativeTools } from '../native-catalog.js'

describe('KNOWN_NATIVE_TOOLS', () => {
  it('includes coding base tools', () => {
    expect(KNOWN_NATIVE_TOOLS.has('read')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('write')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('edit')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('exec')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('process')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('apply_patch')).toBe(true)
  })

  it('includes openclaw tools', () => {
    expect(KNOWN_NATIVE_TOOLS.has('web_search')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('web_fetch')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('image')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('pdf')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('cron')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('browser')).toBe(true)
  })
})

describe('resolveEffectiveNativeTools', () => {
  it('subtracts denied tools', () => {
    const effective = resolveEffectiveNativeTools(['exec', 'browser', 'cron'])
    expect(effective.has('exec')).toBe(false)
    expect(effective.has('browser')).toBe(false)
    expect(effective.has('cron')).toBe(false)
    expect(effective.has('web_search')).toBe(true)
    expect(effective.has('pdf')).toBe(true)
  })

  it('includes dynamic tools', () => {
    const effective = resolveEffectiveNativeTools([], new Set(['custom_channel_tool']))
    expect(effective.has('custom_channel_tool')).toBe(true)
  })

  it('denies dynamic tools too', () => {
    const effective = resolveEffectiveNativeTools(['whatsapp_login'])
    expect(effective.has('whatsapp_login')).toBe(false)
  })
})
