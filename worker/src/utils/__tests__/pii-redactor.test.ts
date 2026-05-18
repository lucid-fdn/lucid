import { afterEach, describe, expect, it, vi } from 'vitest'

import { initPiiRedactor, redact, redactObject, wrapConsole } from '../pii-redactor'

const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
}

describe('pii-redactor', () => {
  afterEach(() => {
    console.log = originalConsole.log
    console.info = originalConsole.info
    console.debug = originalConsole.debug
    console.warn = originalConsole.warn
    console.error = originalConsole.error
    vi.restoreAllMocks()
    initPiiRedactor(true)
  })

  it('redacts common PII in strings', () => {
    initPiiRedactor(true)

    const value = redact('email alice@example.com phone +14155552671 ip 192.168.1.42 id 123e4567-e89b-12d3-a456-426614174000 evm 0x1234567890abcdef1234567890abcdef12345678 solana 4Nd1mYjY7W7utPMNjpXZYx4aA4HxPFTNyg7Zk6N4vTGM')

    expect(value).toContain('a***@example.com')
    expect(value).toContain('+***2671')
    expect(value).toContain('***.***.***.42')
    expect(value).toContain('123e4567***')
    expect(value).toContain('0x1234...5678')
    expect(value).toContain('4Nd1mY...vTGM')
    expect(value).not.toContain('alice@example.com')
    expect(value).not.toContain('192.168.1.42')
    expect(value).not.toContain('0x1234567890abcdef1234567890abcdef12345678')
    expect(value).not.toContain('4Nd1mYjY7W7utPMNjpXZYx4aA4HxPFTNyg7Zk6N4vTGM')
  })

  it('deep-redacts nested objects and arrays without mutating the input', () => {
    initPiiRedactor(true)
    const input = {
      user: {
        email: 'bob@example.com',
        devices: ['10.0.0.9', { phone: '+33123456789' }],
      },
    }

    const output = redactObject(input)

    expect(output).toEqual({
      user: {
        email: 'b***@example.com',
        devices: ['***.***.***.9', { phone: '+***6789' }],
      },
    })
    expect(input.user.email).toBe('bob@example.com')
    expect(input.user.devices[0]).toBe('10.0.0.9')
  })

  it('can be disabled for local diagnostics', () => {
    initPiiRedactor(false)

    expect(redact('alice@example.com')).toBe('alice@example.com')
  })

  it('redacts console info and debug arguments', () => {
    const info = vi.fn()
    const debug = vi.fn()
    console.info = info
    console.debug = debug

    wrapConsole(true)

    console.info('user alice@example.com', { runId: '123e4567-e89b-12d3-a456-426614174000' })
    console.debug('device 192.168.1.42')

    expect(info).toHaveBeenCalledWith('user a***@example.com', { runId: '123e4567***' })
    expect(debug).toHaveBeenCalledWith('device ***.***.***.42')
  })
})
