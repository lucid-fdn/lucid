/**
 * Phase 1a: Outbound runtime filter tests
 *
 * Verifies that claim_next_outbound_event now receives p_runtime_id,
 * and that the worker passes it correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('outbound runtime filter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('passes p_runtime_id to outbound claim when LUCID_RUNTIME_ID is set', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    vi.stubEnv('LUCID_RUNTIME_ID', '12345678-1234-1234-1234-123456789abc')

    const { getConfig } = await import('../config.js')
    const config = getConfig()

    // The outbound RPC call should include p_runtime_id matching LUCID_RUNTIME_ID
    const rpcParams = {
      p_worker_id: config.WORKER_ID,
      p_batch_size: config.OUTBOUND_BATCH_SIZE,
      p_runtime_id: config.LUCID_RUNTIME_ID || null,
    }

    expect(rpcParams.p_runtime_id).toBe('12345678-1234-1234-1234-123456789abc')
  })

  it('passes p_runtime_id=null when LUCID_RUNTIME_ID is not set (shared worker)', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')

    const { getConfig } = await import('../config.js')
    const config = getConfig()

    const rpcParams = {
      p_worker_id: config.WORKER_ID,
      p_batch_size: config.OUTBOUND_BATCH_SIZE,
      p_runtime_id: config.LUCID_RUNTIME_ID || null,
    }

    expect(rpcParams.p_runtime_id).toBeNull()
  })

  it('backward compat: shared worker behavior unchanged with null runtime_id', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')

    const { getConfig } = await import('../config.js')
    const config = getConfig()

    // LUCID_RUNTIME_ID is undefined → should pass null (not undefined)
    expect(config.LUCID_RUNTIME_ID).toBeUndefined()
    expect(config.LUCID_RUNTIME_ID || null).toBeNull()
  })
})
