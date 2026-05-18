import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpenClawCompatibleBrowserQaProvider } from '../providers/openclaw-compatible.js'

const originalFetch = globalThis.fetch

describe('OpenClawCompatibleBrowserQaProvider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('carries org/run scope on tab operations after opening a scoped session', async () => {
    const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : null
      requests.push({ url, method: init?.method ?? 'GET', body })

      if (url.endsWith('/')) return jsonResponse({ running: true })
      if (url.endsWith('/tabs/open')) return jsonResponse({ targetId: 'target-1', url: 'https://example.com' })
      if (url.endsWith('/navigate')) return jsonResponse({ ok: true, targetId: 'target-1', url: 'https://example.com' })
      if (url.includes('/snapshot')) return jsonResponse({ snapshot: 'ok' })
      if (url.endsWith('/screenshot')) return jsonResponse({ uri: 'artifact://shot' })
      if (url.includes('/console')) return jsonResponse({ messages: [] })
      if (url.includes('/errors')) return jsonResponse({ errors: [] })
      if (url.includes('/requests')) return jsonResponse({ requests: [] })
      if (url.endsWith('/act')) return jsonResponse({ ok: true, targetId: 'target-1' })
      if (url.includes('/tabs/target-1')) return jsonResponse({ ok: true })
      return jsonResponse({})
    }) as typeof fetch

    const provider = new OpenClawCompatibleBrowserQaProvider({
      kind: 'lucid-managed',
      baseUrl: 'https://browser.internal',
      token: 'token',
      timeoutMs: 10_000,
    })
    const input = {
      targetUrl: 'https://example.com',
      runId: 'run-1',
      stepId: 'step-1',
      workflowId: 'check-page',
      orgId: 'org-1',
    }

    const session = await provider.startSession(input)
    await provider.navigate({ ...input, sessionId: session.id, targetId: session.targetId })
    await provider.waitForReady({ ...input, sessionId: session.id, targetId: session.targetId })
    await provider.snapshot({ ...input, sessionId: session.id, targetId: session.targetId })
    await provider.screenshot({ ...input, sessionId: session.id, targetId: session.targetId })
    await provider.collectEvidence({ ...input, sessionId: session.id, targetId: session.targetId })
    await provider.closeSession({ ...input, sessionId: session.id, targetId: session.targetId })

    expect(requests.find((request) => request.url.endsWith('/tabs/open'))?.body).toMatchObject({
      orgId: 'org-1',
      runId: 'run-1',
    })
    expect(requests.find((request) => request.url.endsWith('/navigate'))?.body).toMatchObject({
      orgId: 'org-1',
      runId: 'run-1',
    })
    expect(requests.find((request) => request.url.endsWith('/screenshot'))?.body).toMatchObject({
      orgId: 'org-1',
      runId: 'run-1',
    })
    expect(requests.find((request) => request.url.includes('/snapshot'))?.url).toContain('orgId=org-1')
    expect(requests.find((request) => request.url.includes('/console'))?.url).toContain('runId=run-1')
    expect(requests.find((request) => request.url.includes('/tabs/target-1'))?.url).toContain('orgId=org-1')
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
