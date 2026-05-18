import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { ErrorService, withErrorHandling, withRetry } from '../error-service'
import { APIError } from '../types'

// Mock @sentry/nextjs
vi.mock('@sentry/nextjs', () => {
  const scopeMethods = {
    setLevel: vi.fn(),
    setContext: vi.fn(),
    setTag: vi.fn(),
    setFingerprint: vi.fn(),
  }
  return {
    withScope: vi.fn((cb: (scope: typeof scopeMethods) => void) => cb(scopeMethods)),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
    addBreadcrumb: vi.fn(),
    startSpan: vi.fn((_opts: unknown, cb: () => unknown) => cb()),
    __scopeMethods: scopeMethods,
  }
})

// Import the mocked module so we can assert on it
import * as Sentry from '@sentry/nextjs'

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as typeof process.stderr.write)

interface SentryScopeMethods {
  setLevel: ReturnType<typeof vi.fn>
  setContext: ReturnType<typeof vi.fn>
  setTag: ReturnType<typeof vi.fn>
  setFingerprint: ReturnType<typeof vi.fn>
}

function getScopeMethods(): SentryScopeMethods {
  return (Sentry as unknown as { __scopeMethods: SentryScopeMethods }).__scopeMethods
}

describe('ErrorService', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://fake@sentry.io/123')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    stderrWriteSpy.mockRestore()
  })

  describe('captureException', () => {
    it('should call Sentry.withScope and captureException when DSN is set', () => {
      const error = new Error('something broke')

      ErrorService.captureException(error)

      expect(Sentry.withScope).toHaveBeenCalledTimes(1)
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Error',
        message: 'something broke',
      }))
    })

    it('should set severity level on the scope', () => {
      const error = new Error('warning case')
      const scopeMethods = getScopeMethods()

      ErrorService.captureException(error, { severity: 'warning' })

      expect(scopeMethods.setLevel).toHaveBeenCalledWith('warning')
    })

    it('should set context on the scope when provided', () => {
      const error = new Error('context test')
      const scopeMethods = getScopeMethods()

      ErrorService.captureException(error, {
        context: { userId: 'user-1', action: 'save' },
      })

      expect(scopeMethods.setContext).toHaveBeenCalledWith('userId', { value: 'us***' })
      expect(scopeMethods.setContext).toHaveBeenCalledWith('action', { value: 'save' })
    })

    it('redacts error messages, contexts, and tags before local and Sentry reporting', () => {
      const error = new Error('Authorization: Bearer secret.token.value for q@example.com')
      const scopeMethods = getScopeMethods()

      ErrorService.captureException(error, {
        context: {
          userId: 'user_1234567890',
          apiKey: 'sk-secret-value',
          email: 'quentin@example.com',
        },
        tags: { token: 'raw-token', layer: 'api' },
      })

      const reported = vi.mocked(Sentry.captureException).mock.calls[0]?.[0] as Error
      expect(reported.message).toBe('Authorization: Bearer [redacted] for q***@example.com')
      expect(scopeMethods.setContext).toHaveBeenCalledWith('userId', { value: 'user_1...7890' })
      expect(scopeMethods.setContext).toHaveBeenCalledWith('apiKey', { value: '[redacted]' })
      expect(scopeMethods.setContext).toHaveBeenCalledWith('email', { value: 'qu***@example.com' })
      expect(scopeMethods.setTag).toHaveBeenCalledWith('token', '[redacted]')
      expect(scopeMethods.setTag).toHaveBeenCalledWith('layer', 'api')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ErrorService] Authorization: Bearer [redacted] for q***@example.com',
        expect.objectContaining({
          userId: 'user_1...7890',
          apiKey: '[redacted]',
          email: 'qu***@example.com',
        }),
      )
    })

    it('should set tags on the scope when provided', () => {
      const error = new Error('tags test')
      const scopeMethods = getScopeMethods()

      ErrorService.captureException(error, {
        tags: { module: 'auth', layer: 'api' },
      })

      expect(scopeMethods.setTag).toHaveBeenCalledWith('module', 'auth')
      expect(scopeMethods.setTag).toHaveBeenCalledWith('layer', 'api')
    })

    it('should set fingerprint on the scope when provided', () => {
      const error = new Error('fingerprint test')
      const scopeMethods = getScopeMethods()

      ErrorService.captureException(error, {
        fingerprint: ['custom-group'],
      })

      expect(scopeMethods.setFingerprint).toHaveBeenCalledWith(['custom-group'])
    })

    it('should extract APIError details and set tags', () => {
      const error = new APIError('not found', 404, 'NOT_FOUND', 'warning', {
        route: '/api/test',
      })
      const scopeMethods = getScopeMethods()

      ErrorService.captureException(error)

      expect(scopeMethods.setTag).toHaveBeenCalledWith('error_code', 'NOT_FOUND')
      expect(scopeMethods.setTag).toHaveBeenCalledWith('status_code', '404')
    })

    it('should not call Sentry when DSN is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

      ErrorService.captureException(new Error('no dsn'))

      expect(Sentry.withScope).not.toHaveBeenCalled()
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })
  })

  describe('captureMessage', () => {
    it('should call Sentry.captureMessage when DSN is set', () => {
      ErrorService.captureMessage('hello sentry')

      expect(Sentry.withScope).toHaveBeenCalledTimes(1)
      expect(Sentry.captureMessage).toHaveBeenCalledWith('hello sentry')
    })

    it('redacts messages and contexts before capture', () => {
      const scopeMethods = getScopeMethods()

      ErrorService.captureMessage('email q@example.com token sk-secret-value', {
        context: { userId: 'user_1234567890', secret: 'raw-secret' },
      })

      expect(Sentry.captureMessage).toHaveBeenCalledWith('email q***@example.com token [redacted]')
      expect(scopeMethods.setContext).toHaveBeenCalledWith('userId', { value: 'user_1...7890' })
      expect(scopeMethods.setContext).toHaveBeenCalledWith('secret', { value: '[redacted]' })
    })

    it('should not call Sentry when DSN is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

      ErrorService.captureMessage('no dsn message')

      expect(Sentry.withScope).not.toHaveBeenCalled()
    })
  })

  describe('setUser', () => {
    it('should call Sentry.setUser with user info', () => {
      ErrorService.setUser({ id: 'u-1', email: 'a@b.com', username: 'alice' })

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: 'u-1',
        email: 'a@b.com',
        username: 'alice',
      })
    })

    it('should not call Sentry.setUser when DSN is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

      ErrorService.setUser({ id: 'u-1' })

      expect(Sentry.setUser).not.toHaveBeenCalled()
    })
  })

  describe('clearUser', () => {
    it('should call Sentry.setUser(null) when DSN is set', () => {
      ErrorService.clearUser()

      expect(Sentry.setUser).toHaveBeenCalledWith(null)
    })
  })

  describe('addBreadcrumb', () => {
    it('should call Sentry.addBreadcrumb with correct params', () => {
      ErrorService.addBreadcrumb('navigation', 'clicked settings for q@example.com', {
        page: '/settings',
        token: 'raw-token',
      }, 'info')

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        message: 'clicked settings for q***@example.com',
        data: { page: '/settings', token: '[redacted]' },
        level: 'info',
      })
    })
  })

  describe('setTag', () => {
    it('should call Sentry.setTag', () => {
      ErrorService.setTag('release', 'v1.0.0')

      expect(Sentry.setTag).toHaveBeenCalledWith('release', 'v1.0.0')
    })
  })

  describe('setContext', () => {
    it('should call Sentry.setContext', () => {
      ErrorService.setContext('device', { os: 'linux', apiKey: 'raw-key' })

      expect(Sentry.setContext).toHaveBeenCalledWith('device', { os: 'linux', apiKey: '[redacted]' })
    })
  })

  describe('startSpan', () => {
    it('should execute the callback and return its result', () => {
      const result = ErrorService.startSpan('my-op', 'http', () => 42)
      expect(result).toBe(42)
    })

    it('should execute callback directly when DSN is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')

      const result = ErrorService.startSpan('my-op', 'http', () => 'hello')
      expect(result).toBe('hello')
    })
  })
})

describe('withErrorHandling', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    vi.clearAllMocks()
    vi.spyOn(ErrorService, 'captureException').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return the result of a successful async function', async () => {
    const result = await withErrorHandling(async () => 'success')
    expect(result).toBe('success')
  })

  it('should return undefined when the function throws and no fallback is set', async () => {
    const result = await withErrorHandling(async () => {
      throw new Error('fail')
    })
    expect(result).toBeUndefined()
  })

  it('should return the fallback value when the function throws', async () => {
    const result = await withErrorHandling(
      async () => {
        throw new Error('fail')
      },
      { fallback: 'default' }
    )
    expect(result).toBe('default')
  })

  it('should rethrow the error when rethrow option is true', async () => {
    await expect(
      withErrorHandling(
        async () => {
          throw new Error('rethrown')
        },
        { rethrow: true }
      )
    ).rejects.toThrow('rethrown')
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    vi.clearAllMocks()
    vi.spyOn(ErrorService, 'captureException').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should return the result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxRetries: 3, delay: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry and succeed on a later attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { maxRetries: 3, delay: 1, backoff: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('should throw after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fail'))

    await expect(
      withRetry(fn, { maxRetries: 2, delay: 1, backoff: 1 })
    ).rejects.toThrow('always-fail')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
