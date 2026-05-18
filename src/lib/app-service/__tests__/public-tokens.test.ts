import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPublicAppToken } from '../public-tokens-core'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: mocks.from,
  },
}))

import {
  createAppPublicToken,
  revokeAppPublicToken,
  rotateAppPublicToken,
  validatePublicAppRuntimeToken,
} from '../public-tokens'

function createBuilder(methods: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => Promise.resolve({ error: null })),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    ...methods,
  }
  return builder
}

describe('app public token service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.APP_SERVICE_PUBLIC_TOKEN_PEPPER
    delete process.env.APP_SERVICE_INTERNAL_SECRET
  })

  it('creates app-scoped public tokens and stores only the hash', async () => {
    let inserted: Record<string, unknown> | null = null
    const builder = createBuilder({
      insert: vi.fn((payload: Record<string, unknown>) => {
        inserted = payload
        return builder
      }),
      single: vi.fn(() => Promise.resolve({
        data: {
          id: 'token-1',
          capabilities: ['chat'],
          expires_at: null,
        },
        error: null,
      })),
    })
    mocks.from.mockReturnValue(builder)

    const result = await createAppPublicToken({
      appDeploymentId: 'app-1',
      label: 'Generated frontend',
      capabilities: ['chat'],
      createdBy: 'user-1',
    })

    expect(result.token).toMatch(/^lucid_pub_/)
    expect(result.token_preview).not.toContain(result.token)
    expect(inserted).toMatchObject({
      app_deployment_id: 'app-1',
      label: 'Generated frontend',
      capabilities: ['chat'],
      created_by: 'user-1',
    })
    expect(String(inserted?.token_hash)).toMatch(/^[a-f0-9]{64}$/)
    expect(String(inserted?.token_hash)).not.toContain(result.token)
  })

  it('revokes old tokens before rotating a replacement', async () => {
    const revokeBuilder = createBuilder()
    const createBuilderInstance = createBuilder({
      single: vi.fn(() => Promise.resolve({
        data: { id: 'token-2', capabilities: ['lead'], expires_at: '2026-05-01T00:00:00.000Z' },
        error: null,
      })),
    })
    mocks.from
      .mockReturnValueOnce(revokeBuilder)
      .mockReturnValueOnce(createBuilderInstance)

    const result = await rotateAppPublicToken({
      appDeploymentId: 'app-1',
      tokenId: 'token-1',
      capabilities: ['lead'],
      expiresAt: '2026-05-01T00:00:00.000Z',
    })

    expect(revokeBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      revoked_at: expect.any(String),
    }))
    expect(revokeBuilder.eq).toHaveBeenCalledWith('id', 'token-1')
    expect(result.id).toBe('token-2')
    expect(result.capabilities).toEqual(['lead'])
  })

  it('validates non-revoked app-scoped tokens and redacts stored hashes from the returned row', async () => {
    process.env.APP_SERVICE_PUBLIC_TOKEN_PEPPER = 'pepper'
    const token = 'lucid_pub_abcdefghijklmnopqrstuvwxyz'
    const tokenHash = hashPublicAppToken(token, 'pepper')
    const builder = createBuilder({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: {
          id: 'token-1',
          app_deployment_id: 'app-1',
          token_hash: tokenHash,
          label: 'Frontend',
          capabilities: ['chat'],
          expires_at: '2027-05-01T00:00:00.000Z',
          revoked_at: null,
          created_by: 'user-1',
          created_at: '2026-04-29T12:00:00.000Z',
        },
        error: null,
      })),
    })
    mocks.from.mockReturnValue(builder)

    const row = await validatePublicAppRuntimeToken({
      appDeploymentId: 'app-1',
      token,
      kind: 'chat',
    })

    expect(builder.eq).toHaveBeenCalledWith('token_hash', tokenHash)
    expect(row?.id).toBe('token-1')
    expect(row?.token_hash).toBe('[redacted]')
  })

  it('rejects revoked tokens and capability mismatches', async () => {
    const revokedBuilder = createBuilder({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: {
          id: 'token-1',
          app_deployment_id: 'app-1',
          token_hash: 'hash',
          capabilities: ['chat'],
          expires_at: null,
          revoked_at: '2026-04-29T12:00:00.000Z',
          created_at: '2026-04-29T12:00:00.000Z',
        },
        error: null,
      })),
    })
    mocks.from.mockReturnValueOnce(revokedBuilder)

    await expect(validatePublicAppRuntimeToken({
      appDeploymentId: 'app-1',
      token: 'lucid_pub_revoked',
      kind: 'chat',
    })).rejects.toThrow('Public runtime token is revoked or expired.')

    const scopedBuilder = createBuilder({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: {
          id: 'token-2',
          app_deployment_id: 'app-1',
          token_hash: 'hash',
          capabilities: ['lead'],
          expires_at: null,
          revoked_at: null,
          created_at: '2026-04-29T12:00:00.000Z',
        },
        error: null,
      })),
    })
    mocks.from.mockReturnValueOnce(scopedBuilder)

    await expect(validatePublicAppRuntimeToken({
      appDeploymentId: 'app-1',
      token: 'lucid_pub_lead_only',
      kind: 'chat',
    })).rejects.toThrow('Public runtime token does not allow this capability.')
  })

  it('returns null when no public runtime token is provided', async () => {
    await expect(validatePublicAppRuntimeToken({
      appDeploymentId: 'app-1',
      token: null,
      kind: 'config',
    })).resolves.toBeNull()

    expect(mocks.from).not.toHaveBeenCalled()
  })
})
