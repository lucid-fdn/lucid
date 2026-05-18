import { describe, expect, it, vi } from 'vitest'
import {
  captureAgentCommerceError,
  redactAgentCommerceText,
  sanitizeAgentCommerceLogContext,
} from '../observability'
import {
  createAgentCommerceEnvSecretRef,
  createAgentCommerceSecretRef,
  maskAgentCommerceSecretRef,
  resolveAgentCommerceSecretRef,
} from '../secrets'
import { ErrorService } from '@/lib/errors/error-service'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const encryptionEnv = {
  AGENT_COMMERCE_SECRET_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
}

describe('Agent Commerce security helpers', () => {
  it('redacts provider secrets, card-like values, and email addresses from logs', () => {
    const redacted = redactAgentCommerceText('sk_live_123 paid user@example.com with 4242 4242 4242 4242')

    expect(redacted).not.toContain('sk_live_123')
    expect(redacted).not.toContain('user@example.com')
    expect(redacted).not.toContain('4242 4242 4242 4242')
  })

  it('hashes sensitive context keys while preserving operational tags', () => {
    const context = sanitizeAgentCommerceLogContext({
      provider: 'stripe_shared_payment_tokens',
      customer_email: 'buyer@example.com',
      provider_payment_id: 'pi_secret_123',
      nested: { merchant_name: 'Sensitive Merchant' },
    }) as Record<string, unknown>

    expect(context.provider).toBe('stripe_shared_payment_tokens')
    expect(String(context.customer_email)).toMatch(/^sha256:/)
    expect(String(context.provider_payment_id)).toMatch(/^sha256:/)
    expect(JSON.stringify(context)).not.toContain('Sensitive Merchant')
  })

  it('captures Sentry-safe Commerce errors with allowlisted tags', () => {
    captureAgentCommerceError(new Error('Stripe key sk_live_123 failed'), {
      operation: 'seller_accept',
      surface: 'provider',
      provider: 'stripe_shared_payment_tokens',
      context: {
        customer_reference: 'buyer@example.com',
      },
    })

    expect(ErrorService.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.not.stringContaining('sk_live_123') }),
      expect.objectContaining({
        tags: expect.objectContaining({
          stack: 'commerce',
          operation: 'seller_accept',
          provider: 'stripe_shared_payment_tokens',
        }),
        context: expect.objectContaining({
          customer_reference: expect.stringMatching(/^sha256:/),
        }),
      }),
    )
  })

  it('creates encrypted inline secret refs without exposing plaintext', () => {
    const ref = createAgentCommerceSecretRef({
      kind: 'provider_api_key',
      provider: 'stripe_shared_payment_tokens',
      value: 'sk_test_secret_123',
      env: encryptionEnv,
    })

    expect(ref).toContain('agent-commerce-secret:v1:')
    expect(ref).not.toContain('sk_test_secret_123')
    expect(maskAgentCommerceSecretRef(ref)).toBe('agent-commerce-secret:v1:[encrypted]')

    const resolved = resolveAgentCommerceSecretRef({
      secretRef: ref,
      expectedKind: 'provider_api_key',
      provider: 'stripe_shared_payment_tokens',
      env: encryptionEnv,
    })

    expect(resolved.value).toBe('sk_test_secret_123')
  })

  it('resolves environment-backed secret refs for provider adapters', () => {
    const ref = createAgentCommerceEnvSecretRef('STRIPE_SECRET_KEY')
    const resolved = resolveAgentCommerceSecretRef({
      secretRef: ref,
      expectedKind: 'provider_api_key',
      provider: 'stripe_shared_payment_tokens',
      env: { STRIPE_SECRET_KEY: 'sk_test_from_env' },
    })

    expect(resolved.value).toBe('sk_test_from_env')
    expect(maskAgentCommerceSecretRef(ref)).toBe('env:STRIPE_SECRET_KEY')
  })
})
