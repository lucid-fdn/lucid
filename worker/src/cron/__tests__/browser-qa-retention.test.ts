import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cleanupBrowserQaRetention } from '../browser-qa-retention.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cleanupBrowserQaRetention', () => {
  it('expires sessions, removes artifact objects, and deletes old usage rows', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-retention-'))
    const artifactKey = 'org/run/step/shot.png'
    const artifactPath = path.join(artifactDir, ...artifactKey.split('/'))
    await fs.mkdir(path.dirname(artifactPath), { recursive: true })
    await fs.writeFile(artifactPath, 'artifact')

    const from = vi.fn()
      .mockReturnValueOnce(makeSelectChain({
        data: [{
          id: 'session-id',
          org_id: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
          ops_run_id: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
          session_key: 'target-id',
        }],
        error: null,
      }))
      .mockReturnValueOnce(makeSelectChain({
        data: [{ id: 'usage-artifact', metadata: { artifactKey } }],
        error: null,
      }))
      .mockReturnValueOnce(makeUpdateChain({ error: null }))
      .mockReturnValueOnce(makeSelectChain({
        data: [{ id: 'old-artifact', metadata: { artifactKey } }],
        error: null,
      }))
      .mockReturnValueOnce(makeDeleteChain({
        data: [{ id: 'old-usage' }],
        error: null,
      }))

    const supabase = { from } as never

    try {
      await cleanupBrowserQaRetention(supabase, {
        BROWSER_QA_ARTIFACT_STORE: 'local',
        BROWSER_QA_ARTIFACT_DIR: artifactDir,
        BROWSER_QA_ARTIFACT_BUCKET: 'agent-ops-browser-qa',
        BROWSER_QA_PUBLIC_BASE_URL: undefined,
        BROWSER_QA_ARTIFACT_RETENTION_DAYS: 7,
      } as never)

      await expect(fs.stat(artifactPath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(from).toHaveBeenCalledWith('agent_ops_browser_qa_sessions')
      expect(from).toHaveBeenCalledWith('agent_ops_browser_qa_usage_events')
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('expired 1 sessions'))
    } finally {
      await fs.rm(artifactDir, { recursive: true, force: true })
    }
  })

  it('logs and continues when expired session query fails', async () => {
    const from = vi.fn()
      .mockReturnValueOnce(makeSelectChain({
        data: null,
        error: { message: 'query failed' },
      }))
      .mockReturnValueOnce(makeSelectChain({ data: [], error: null }))
      .mockReturnValueOnce(makeDeleteChain({ data: [], error: null }))

    await cleanupBrowserQaRetention({ from } as never, {
      BROWSER_QA_ARTIFACT_STORE: 'local',
      BROWSER_QA_ARTIFACT_DIR: os.tmpdir(),
      BROWSER_QA_ARTIFACT_BUCKET: 'agent-ops-browser-qa',
      BROWSER_QA_PUBLIC_BASE_URL: undefined,
      BROWSER_QA_ARTIFACT_RETENTION_DAYS: 7,
    } as never)

    expect(console.error).toHaveBeenCalledWith(
      '[cron:browser-qa-retention] expired session query error:',
      'query failed',
    )
  })
})

function makeSelectChain(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(result),
  }
  return chain
}

function makeUpdateChain(result: unknown) {
  return {
    update: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue(result),
    })),
  }
}

function makeDeleteChain(result: unknown) {
  return {
    delete: vi.fn(() => ({
      lt: vi.fn(() => ({
        limit: vi.fn(() => ({
          select: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  }
}
