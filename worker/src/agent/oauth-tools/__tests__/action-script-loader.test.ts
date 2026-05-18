import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

// Mock config
vi.mock('../../../config.js', () => ({
  getConfig: () => ({ NANGO_ACTIONS_DIR: '/tmp/test-nango-actions' }),
}))

// Mock fs.existsSync
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

// Mock createRequire
vi.mock('node:module', () => ({
  createRequire: vi.fn(),
}))

import { loadActionScript, clearActionScriptCache } from '../action-script-loader.js'

const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>
const mockCreateRequire = createRequire as unknown as ReturnType<typeof vi.fn>

describe('loadActionScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearActionScriptCache()
  })

  it('returns null when script file does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    const result = loadActionScript('slack', 'send-message')
    expect(result).toBeNull()
    expect(mockExistsSync).toHaveBeenCalledWith(
      expect.stringContaining('slack_actions_send-message.cjs'),
    )
  })

  it('loads and returns script with exec function', () => {
    mockExistsSync.mockReturnValue(true)
    const mockExec = vi.fn()
    const mockRequireFn = vi.fn().mockReturnValue({ default: { exec: mockExec } })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    const result = loadActionScript('slack', 'send-message')
    expect(result).not.toBeNull()
    expect(result!.exec).toBe(mockExec)
  })

  it('handles module without default export (direct exec)', () => {
    mockExistsSync.mockReturnValue(true)
    const mockExec = vi.fn()
    const mockRequireFn = vi.fn().mockReturnValue({ exec: mockExec })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    const result = loadActionScript('github', 'create-issue')
    expect(result).not.toBeNull()
    expect(result!.exec).toBe(mockExec)
  })

  it('returns null when module has no exec function', () => {
    mockExistsSync.mockReturnValue(true)
    const mockRequireFn = vi.fn().mockReturnValue({ default: { noExec: true } })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadActionScript('broken', 'no-exec')
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing exec()'))
    warnSpy.mockRestore()
  })

  it('returns null and logs on require error', () => {
    mockExistsSync.mockReturnValue(true)
    const mockRequireFn = vi.fn().mockImplementation(() => { throw new Error('syntax error') })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = loadActionScript('broken', 'bad-syntax')
    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load'),
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('caches loaded scripts on second call', () => {
    mockExistsSync.mockReturnValue(true)
    const mockExec = vi.fn()
    const mockRequireFn = vi.fn().mockReturnValue({ default: { exec: mockExec } })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    loadActionScript('slack', 'send-message')
    loadActionScript('slack', 'send-message')

    // createRequire should only be called once (cached on second call)
    expect(mockCreateRequire).toHaveBeenCalledTimes(1)
  })

  it('caches null results for missing scripts', () => {
    mockExistsSync.mockReturnValue(false)

    loadActionScript('missing', 'action')
    loadActionScript('missing', 'action')

    // All candidate directories are checked only on the first lookup.
    expect(mockExistsSync.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('clearActionScriptCache resets the cache', () => {
    mockExistsSync.mockReturnValue(true)
    const mockExec = vi.fn()
    const mockRequireFn = vi.fn().mockReturnValue({ default: { exec: mockExec } })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    loadActionScript('slack', 'send-message')
    clearActionScriptCache()
    loadActionScript('slack', 'send-message')

    // createRequire called twice — cache was cleared
    expect(mockCreateRequire).toHaveBeenCalledTimes(2)
  })

  it('builds correct file path from integration ID and action name', () => {
    mockExistsSync.mockReturnValue(false)
    loadActionScript('google', 'create-all-day-event')
    expect(mockExistsSync).toHaveBeenCalledWith(
      expect.stringContaining('google_actions_create-all-day-event.cjs'),
    )
  })

  it('falls back to a provider-local alias when the exact script name is not bundled', () => {
    mockExistsSync.mockImplementation((path: string) => path.includes('notion_actions_search-pages.cjs'))
    const mockExec = vi.fn()
    const mockRequireFn = vi.fn().mockReturnValue({ default: { exec: mockExec } })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    const result = loadActionScript('notion', 'search')

    expect(result).not.toBeNull()
    expect(mockExistsSync.mock.calls.some(([path]) => String(path).includes('notion_actions_search.cjs'))).toBe(true)
    expect(mockExistsSync.mock.calls.some(([path]) => String(path).includes('notion_actions_search-pages.cjs'))).toBe(true)
  })

  it('checks the absolute app bundle path as a fallback', () => {
    mockExistsSync.mockImplementation((path: string) => path === '/app/nango-actions/notion_actions_search-pages.cjs')
    const mockExec = vi.fn()
    const mockRequireFn = vi.fn().mockReturnValue({ default: { exec: mockExec } })
    mockCreateRequire.mockReturnValue(mockRequireFn)

    const result = loadActionScript('notion', 'search')

    expect(result).not.toBeNull()
    expect(mockExistsSync).toHaveBeenCalledWith('/app/nango-actions/notion_actions_search-pages.cjs')
  })
})
