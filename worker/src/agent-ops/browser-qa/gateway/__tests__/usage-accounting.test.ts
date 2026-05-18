import { describe, expect, it, vi } from 'vitest'

import { SupabaseBrowserQaQuotaGuard, SupabaseBrowserQaUsageRecorder } from '../usage-accounting.js'

describe('SupabaseBrowserQaUsageRecorder', () => {
  it('skips persistence until org and run ids are durable UUIDs', async () => {
    const insert = vi.fn()
    const supabase = {
      from: vi.fn(() => ({ insert })),
    }
    const recorder = new SupabaseBrowserQaUsageRecorder(supabase as never)

    await recorder.record({
      orgId: 'org-smoke',
      runId: 'run-smoke',
      sessionKey: 'session-1',
      provider: 'playwright',
      eventType: 'session_started',
    })

    expect(supabase.from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('persists normalized provider-agnostic usage rows', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn(() => ({ insert })),
    }
    const recorder = new SupabaseBrowserQaUsageRecorder(supabase as never)

    await recorder.record({
      orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
      stepId: 'browser-step',
      sessionKey: 'session-1',
      targetId: 'target-1',
      provider: 'playwright',
      eventType: 'screenshot',
      targetUrl: 'https://example.com',
      durationMs: 12.4,
      bytes: 2048,
      requestCount: 3,
      consoleErrorCount: 1,
      pageErrorCount: 0,
      metadata: { artifactUri: '/artifacts/shot.png' },
    })

    expect(supabase.from).toHaveBeenCalledWith('agent_ops_browser_qa_usage_events')
    expect(insert).toHaveBeenCalledWith({
      org_id: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      ops_run_id: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
      session_key: 'session-1',
      target_id: 'target-1',
      step_id: 'browser-step',
      provider: 'playwright',
      event_type: 'screenshot',
      target_url: 'https://example.com',
      duration_ms: 12,
      bytes: 2048,
      request_count: 3,
      console_error_count: 1,
      page_error_count: 0,
      metadata: { artifactUri: '/artifacts/shot.png' },
    })
  })
})

describe('SupabaseBrowserQaQuotaGuard', () => {
  function makeQuotaSupabase(
    count: number,
    error: unknown = null,
    planData: unknown = null,
    planError: unknown = null,
  ) {
    const eq = vi.fn()
    const usageQuery = {
      select: vi.fn(() => usageQuery),
      eq,
    }
    eq.mockReturnValueOnce(usageQuery)
      .mockReturnValueOnce(usageQuery)
      .mockResolvedValueOnce({ count, error })
    const planQuery = {
      select: vi.fn(() => planQuery),
      eq: vi.fn(() => planQuery),
      in: vi.fn(() => planQuery),
      order: vi.fn(() => planQuery),
      limit: vi.fn(() => planQuery),
      maybeSingle: vi.fn().mockResolvedValue({ data: planData, error: planError }),
    }
    return {
      supabase: {
        from: vi.fn((table: string) => table === 'subscriptions' ? planQuery : usageQuery),
      },
      query: usageQuery,
      planQuery,
    }
  }

  it('allows local smoke runs without durable UUIDs', async () => {
    const { supabase } = makeQuotaSupabase(999)
    const guard = new SupabaseBrowserQaQuotaGuard(supabase as never, {
      maxSessionsPerRun: 1,
      maxScreenshotsPerRun: 1,
    })

    await expect(guard.assertCanOpenSession({
      orgId: 'org-smoke',
      runId: 'run-smoke',
    })).resolves.toBeUndefined()

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rejects browser sessions when the per-run session quota is exhausted', async () => {
    const { supabase } = makeQuotaSupabase(2)
    const guard = new SupabaseBrowserQaQuotaGuard(supabase as never, {
      maxSessionsPerRun: 2,
      maxScreenshotsPerRun: 10,
    })

    await expect(guard.assertCanOpenSession({
      orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
    })).rejects.toThrow(/session quota exceeded/i)
  })

  it('rejects screenshots when the per-run screenshot quota is exhausted', async () => {
    const { supabase, query } = makeQuotaSupabase(3)
    const guard = new SupabaseBrowserQaQuotaGuard(supabase as never, {
      maxSessionsPerRun: 10,
      maxScreenshotsPerRun: 3,
    })

    await expect(guard.assertCanCaptureScreenshot({
      orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
    })).rejects.toThrow(/screenshot quota exceeded/i)

    expect(query.eq).toHaveBeenLastCalledWith('event_type', 'screenshot')
  })

  it('uses plan-tier Browser QA limits when available', async () => {
    const { supabase, query } = makeQuotaSupabase(11, null, {
      plans: {
        limits: {
          browser_qa_sessions_per_run: 12,
          browser_qa_screenshots_per_run: 40,
        },
      },
    })
    const guard = new SupabaseBrowserQaQuotaGuard(supabase as never, {
      maxSessionsPerRun: 2,
      maxScreenshotsPerRun: 3,
    })

    await expect(guard.assertCanOpenSession({
      orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
    })).resolves.toBeUndefined()

    expect(query.eq).toHaveBeenLastCalledWith('event_type', 'session_started')
  })

  it('treats unlimited plan-tier Browser QA limits as disabled quota checks', async () => {
    const { supabase, query } = makeQuotaSupabase(999, null, {
      plans: {
        limits: {
          browser_qa_sessions_per_run: -1,
          browser_qa_screenshots_per_run: -1,
        },
      },
    })
    const guard = new SupabaseBrowserQaQuotaGuard(supabase as never, {
      maxSessionsPerRun: 2,
      maxScreenshotsPerRun: 3,
    })

    await expect(guard.assertCanOpenSession({
      orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
    })).resolves.toBeUndefined()

    expect(query.eq).not.toHaveBeenCalledWith('event_type', 'session_started')
  })
})
