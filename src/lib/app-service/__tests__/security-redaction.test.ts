import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_REDACTED,
  containsAppServiceSecret,
  redactAppServiceMetadata,
  redactAppServiceText,
} from '../security-redaction'

describe('app service security redaction', () => {
  it('redacts secret-looking keys recursively while preserving operational ids', () => {
    const redacted = redactAppServiceMetadata({
      provider_deployment_id: 'dpl_123',
      agentops_trace_id: 'trace_123',
      headers: {
        authorization: 'Bearer sk-proj-secretsecretsecret',
      },
      provider: {
        V0_API_KEY: 'v0_super_secret',
        nested: [{ refresh_token: 'refresh_secret' }],
      },
    })

    expect(redacted.provider_deployment_id).toBe('dpl_123')
    expect(redacted.agentops_trace_id).toBe('trace_123')
    expect(redacted.headers).toEqual({ authorization: APP_SERVICE_REDACTED })
    expect(redacted.provider).toEqual({
      V0_API_KEY: APP_SERVICE_REDACTED,
      nested: [{ refresh_token: APP_SERVICE_REDACTED }],
    })
  })

  it('redacts provider secrets from text logs and error messages', () => {
    const text = [
      'VERCEL_API_TOKEN=vercel_super_secret',
      'Authorization: Bearer sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    ].join('\n')

    const redacted = redactAppServiceText(text)

    expect(redacted).toContain(`VERCEL_API_TOKEN=${APP_SERVICE_REDACTED}`)
    expect(redacted).toContain('Authorization: Bearer [redacted]')
    expect(redacted).not.toContain('vercel_super_secret')
    expect(redacted).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456')
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('detects whether a value would be changed by redaction', () => {
    expect(containsAppServiceSecret({ logs: ['build ok'] })).toBe(false)
    expect(containsAppServiceSecret({ logs: ['OPENAI_API_KEY=sk-secretsecretsecret'] })).toBe(true)
  })
})
