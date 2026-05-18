import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveAuthContext,
  createRuntime,
  listRuntimes,
  getRuntime,
  pollUntilConnected,
  buildEnvFileContent,
  isOk,
  isErr,
} from '../cli/api.js'

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ 'content-type': 'application/json' }),
  })
}

function errorResponse(status: number, body = '') {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
    headers: new Headers(),
  })
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('isOk / isErr', () => {
  it('identifies success results', () => {
    expect(isOk({ ok: true, orgId: 'org-1' })).toBe(true)
    expect(isErr({ ok: true, orgId: 'org-1' })).toBe(false)
  })

  it('identifies error results', () => {
    expect(isErr({ ok: false, error: 'fail' })).toBe(true)
    expect(isOk({ ok: false, error: 'fail' } as any)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveAuthContext
// ---------------------------------------------------------------------------

describe('resolveAuthContext', () => {
  it('resolves org from organizations endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ id: 'org-123' }]))
    const result = await resolveAuthContext('token-abc', 'https://lucid.test')
    if (isErr(result)) throw new Error('Expected ok')
    expect(result.orgId).toBe('org-123')
    expect(result.controlPlaneUrl).toBe('https://lucid.test')
  })

  it('falls back to JWT parsing when endpoint fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'))
    // Create a JWT with org_id in payload
    const payload = Buffer.from(JSON.stringify({ org_id: 'jwt-org' })).toString('base64url')
    const token = `header.${payload}.signature`
    const result = await resolveAuthContext(token, 'https://lucid.test')
    if (isErr(result)) throw new Error('Expected ok')
    expect(result.orgId).toBe('jwt-org')
  })

  it('returns error when no org can be resolved', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]))
    const result = await resolveAuthContext('not-a-jwt', 'https://lucid.test')
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('Could not resolve organization')
    }
  })
})

// ---------------------------------------------------------------------------
// createRuntime
// ---------------------------------------------------------------------------

describe('createRuntime', () => {
  it('creates a runtime successfully', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtime: { id: 'rt-new' },
        apiKey: 'key-123',
      }),
    )

    const result = await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'test-runtime',
      engine: 'openclaw',
      channelMode: 'relay',
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtimeId).toBe('rt-new')
    expect(result.apiKey).toBe('key-123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://lucid.test/api/runtimes?org_id=org-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          displayName: 'test-runtime',
          provider: 'manual',
          runtimeTier: 'byo',
          engine: 'openclaw',
          runtimeFlavor: 'c2a_autonomous',
          channelOwnership: 'lucid_relay',
          channelMode: 'relay',
        }),
      }),
    )
  })

  it('creates a Hermes relay runtime successfully', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtime: { id: 'rt-hermes' },
        apiKey: 'key-hermes',
      }),
    )

    const result = await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'hermes-runtime',
      engine: 'hermes',
      channelMode: 'relay',
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtimeId).toBe('rt-hermes')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://lucid.test/api/runtimes?org_id=org-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          displayName: 'hermes-runtime',
          provider: 'manual',
          runtimeTier: 'byo',
          engine: 'hermes',
          runtimeFlavor: 'c2a_autonomous',
          channelOwnership: 'lucid_relay',
          channelMode: 'relay',
        }),
      }),
    )
  })

  it('rejects Hermes native runtime creation', async () => {
    const result = await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'hermes-runtime',
      engine: 'hermes',
      channelMode: 'native',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('not supported')
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('adds Hermes OpenClaw migration payload when requested', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtime: { id: 'rt-hermes' },
        apiKey: 'key-hermes',
      }),
    )

    const result = await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'hermes-runtime',
      engine: 'hermes',
      channelMode: 'relay',
      hermesMigration: {
        enabled: true,
        preset: 'user-data',
        dryRun: true,
        overwrite: false,
        sourcePath: '/tmp/.openclaw',
        workspaceTarget: '/workspace',
        skillConflict: 'rename',
      },
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtimeId).toBe('rt-hermes')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://lucid.test/api/runtimes?org_id=org-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          displayName: 'hermes-runtime',
          provider: 'manual',
          runtimeTier: 'byo',
          engine: 'hermes',
          runtimeFlavor: 'c2a_autonomous',
          channelOwnership: 'lucid_relay',
          channelMode: 'relay',
          runtimeBootstrapConfig: {
            migration: {
              source: 'openclaw',
              hermesOpenClaw: {
                preset: 'user-data',
                dryRun: true,
                overwrite: false,
                sourcePath: '/tmp/.openclaw',
                workspaceTarget: '/workspace',
                skillConflict: 'rename',
              },
            },
          },
        }),
      }),
    )
  })

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, 'Forbidden'))

    const result = await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'test',
      engine: 'openclaw',
      channelMode: 'relay',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('403')
    }
  })

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await createRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      displayName: 'test',
      engine: 'openclaw',
      channelMode: 'relay',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('Network error')
    }
  })
})

// ---------------------------------------------------------------------------
// listRuntimes
// ---------------------------------------------------------------------------

describe('listRuntimes', () => {
  it('returns runtimes array', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          { id: 'rt-1', status: 'connected', provider: 'manual' },
          { id: 'rt-2', status: 'pending', provider: 'manual' },
        ],
      }),
    )

    const result = await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtimes).toHaveLength(2)
  })

  it('handles array response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ id: 'rt-1', status: 'pending', provider: 'manual' }]),
    )

    const result = await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtimes).toHaveLength(1)
  })

  it('returns error on failure', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500))
    const result = await listRuntimes({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
    })
    expect(isErr(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getRuntime
// ---------------------------------------------------------------------------

describe('getRuntime', () => {
  it('finds runtime by ID', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        runtimes: [
          { id: 'rt-1', status: 'connected', provider: 'manual' },
          { id: 'rt-2', status: 'pending', provider: 'manual' },
        ],
      }),
    )

    const result = await getRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-2',
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtime.status).toBe('pending')
  })

  it('returns error when not found', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ runtimes: [] }))

    const result = await getRuntime({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-missing',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toContain('not found')
    }
  })
})

// ---------------------------------------------------------------------------
// pollUntilConnected
// ---------------------------------------------------------------------------

describe('pollUntilConnected', () => {
  it('returns immediately when already connected', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        runtimes: [{ id: 'rt-1', status: 'connected', provider: 'manual' }],
      }),
    )

    const result = await pollUntilConnected({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-1',
    })

    if (isErr(result)) throw new Error('Expected ok')
    expect(result.runtime.status).toBe('connected')
  })

  it('stops on abort signal', async () => {
    const controller = new AbortController()
    controller.abort()

    mockFetch.mockResolvedValue(
      jsonResponse({
        runtimes: [{ id: 'rt-1', status: 'pending', provider: 'manual' }],
      }),
    )

    const result = await pollUntilConnected({
      controlPlaneUrl: 'https://lucid.test',
      token: 'tok',
      orgId: 'org-1',
      runtimeId: 'rt-1',
      signal: controller.signal,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBe('Cancelled')
    }
  })
})

// ---------------------------------------------------------------------------
// buildEnvFileContent
// ---------------------------------------------------------------------------

describe('buildEnvFileContent', () => {
  it('generates valid dotenv content', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-abc',
      apiKey: 'key-xyz',
      controlPlaneUrl: 'https://lucid.test',
      displayName: 'my-runtime',
      engine: 'openclaw',
      mode: 'full',
    })

    expect(content).toContain('LUCID_RUNTIME_ID=rt-abc')
    expect(content).toContain('LUCID_RUNTIME_KEY=key-xyz')
    expect(content).toContain('LUCID_CONTROL_PLANE_URL=https://lucid.test')
    expect(content).toContain('# Mode: full')
    expect(content).toContain('# Runtime: my-runtime')
  })

  it('defaults mode to full', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt',
      apiKey: 'key',
      controlPlaneUrl: 'https://lucid.test',
      displayName: 'test',
      engine: 'openclaw',
    })
    expect(content).toContain('# Mode: full')
  })

  it('adds Hermes runtime hints', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-hermes',
      apiKey: 'key-hermes',
      controlPlaneUrl: 'https://lucid.test',
      displayName: 'hermes-runtime',
      engine: 'hermes',
      mode: 'observe',
    })

    expect(content).toContain('# Engine: hermes')
    expect(content).toContain('LUCID_ENGINE=hermes')
    expect(content).toContain('LUCID_BRIDGE_MODE=observe')
    expect(content).toContain('HERMES_COMMAND=hermes')
    expect(content).toContain('HERMES_ARGS_JSON=["chat"]')
  })

  it('adds Hermes OpenClaw migration env vars when requested', () => {
    const content = buildEnvFileContent({
      runtimeId: 'rt-hermes',
      apiKey: 'key-hermes',
      controlPlaneUrl: 'https://lucid.test',
      displayName: 'hermes-runtime',
      engine: 'hermes',
      mode: 'observe',
      hermesMigration: {
        enabled: true,
        preset: 'full',
        dryRun: true,
        overwrite: true,
        sourcePath: '/tmp/.openclaw',
        workspaceTarget: '/workspace',
        skillConflict: 'overwrite',
      },
    })

    expect(content).toContain('HERMES_MIGRATE_OPENCLAW=true')
    expect(content).toContain('HERMES_MIGRATE_PRESET=full')
    expect(content).toContain('HERMES_MIGRATE_DRY_RUN=true')
    expect(content).toContain('HERMES_MIGRATE_OVERWRITE=true')
    expect(content).toContain('HERMES_MIGRATE_SOURCE=/tmp/.openclaw')
    expect(content).toContain('HERMES_MIGRATE_WORKSPACE_TARGET=/workspace')
    expect(content).toContain('HERMES_MIGRATE_SKILL_CONFLICT=overwrite')
  })
})
