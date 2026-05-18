import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { PlaywrightBrowserGatewayService } from '../playwright-service.js'
import type { BrowserQaQuotaGuard, BrowserQaUsageEvent, BrowserQaUsageRecorder } from '../usage-accounting.js'

const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve())
  })))
})

function makeService(overrides: Partial<ConstructorParameters<typeof PlaywrightBrowserGatewayService>[0]> = {}) {
  return new PlaywrightBrowserGatewayService({
    allowPrivateNetwork: false,
    artifactDir: path.join(os.tmpdir(), `lucid-browser-qa-test-${Date.now()}-${Math.random()}`),
    headless: true,
    maxConcurrency: 1,
    maxScreenshotBytes: 1024 * 1024,
    sessionTtlSeconds: 60,
    ...overrides,
  })
}

function makeUsageRecorder(): BrowserQaUsageRecorder & { events: BrowserQaUsageEvent[] } {
  const events: BrowserQaUsageEvent[] = []
  return {
    events,
    async record(event: BrowserQaUsageEvent) {
      events.push(event)
    },
  }
}

function makeRejectingQuotaGuard(errorMessage: string): BrowserQaQuotaGuard {
  return {
    async assertCanOpenSession() {
      throw new Error(errorMessage)
    },
    async assertCanCaptureScreenshot() {
      throw new Error(errorMessage)
    },
  }
}

function makeScreenshotRejectingQuotaGuard(errorMessage: string): BrowserQaQuotaGuard {
  return {
    async assertCanOpenSession() {
      // Opening a tab is allowed; only screenshot capture is quota-gated here.
    },
    async assertCanCaptureScreenshot() {
      throw new Error(errorMessage)
    },
  }
}

async function flushAsyncUsageRecording(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('PlaywrightBrowserGatewayService safety guards', () => {
  it('reports the configured gateway provider and action layer without exposing them to shared workers', async () => {
    const service = makeService({
      provider: {
        providerKind: 'browserless',
        actionLayer: 'stagehand',
        cdpWsUrl: 'wss://browserless.example.com/chromium',
        cdpToken: 'browserless-token',
        actionLayerControlUrl: 'https://stagehand.example.com/act',
        actionLayerApiKey: 'stagehand-token',
      },
    })

    expect(await service.status()).toMatchObject({
      running: false,
      tabs: 0,
      provider: 'browserless',
      actionLayer: 'stagehand',
    })
  })

  it('fails closed when a remote gateway provider has no CDP endpoint', async () => {
    const service = makeService({
      provider: {
        providerKind: 'remote-cdp',
        actionLayer: 'none',
      },
    })

    await expect(service.start()).rejects.toThrow(/requires a CDP websocket URL/i)
  })

  it('rejects non-http targets before launching a browser', async () => {
    const service = makeService()

    await expect(service.openTab({ url: 'data:text/html,<h1>nope</h1>' }))
      .rejects.toThrow(/http or https/i)
  })

  it('rejects localhost targets by default', async () => {
    const service = makeService()

    await expect(service.openTab({ url: 'http://localhost:3000' }))
      .rejects.toThrow(/private or local network/i)
  })

  it('rejects private IPv4 targets by default', async () => {
    const service = makeService()

    await expect(service.openTab({ url: 'http://192.168.1.10' }))
      .rejects.toThrow(/private or local network/i)
  })

  it('allows private targets only when explicitly configured', async () => {
    const service = makeService({ allowPrivateNetwork: true })
    const start = Date.now()

    const promise = service.openTab({ url: 'http://127.0.0.1:9' })
    await expect(promise).rejects.not.toThrow(/private or local network/i)
    await service.closeAll()
    expect(Date.now() - start).toBeLessThan(30_000)
  }, 30_000)

  it('persists screenshots as artifact files instead of inline data URIs', async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-artifacts-'))
    const service = makeService({
      allowPrivateNetwork: true,
      artifactDir,
      publicBaseUrl: 'https://browser-gateway.test',
    })

    try {
      const tab = await service.openTab({
        orgId: 'org/test',
        runId: 'run/test',
        stepId: 'step/test',
      })

      const screenshot = await service.screenshot({ targetId: tab.targetId })

      expect(screenshot.uri).toMatch(/^https:\/\/browser-gateway\.test\/artifacts\//)
      expect(screenshot.uri).not.toContain('data:image')
      expect(screenshot.path).toContain(artifactDir)
      expect(await fs.stat(screenshot.path!)).toMatchObject({
        size: screenshot.byteLength,
      })
    } finally {
      await service.closeAll()
      await fs.rm(artifactDir, { recursive: true, force: true })
    }
  }, 30_000)

  it('emits provider-agnostic usage events without blocking browser actions', async () => {
    const usageRecorder = makeUsageRecorder()
    const service = makeService({
      allowPrivateNetwork: true,
      usageRecorder,
    })

    try {
      const tab = await service.openTab({
        orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
        runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
        stepId: 'browser-step',
      })
      await service.snapshot({ targetId: tab.targetId })
      await service.closeTab(tab.targetId)
      await flushAsyncUsageRecording()

      expect(usageRecorder.events.map((event) => event.eventType)).toEqual([
        'session_started',
        'snapshot',
        'session_closed',
      ])
      expect(usageRecorder.events[0]).toMatchObject({
        provider: 'playwright',
        orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
        runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
        stepId: 'browser-step',
        sessionKey: tab.targetId,
      })
      expect(usageRecorder.events.at(-1)?.metadata).toMatchObject({
        snapshotCount: 1,
      })
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('checks durable quotas before launching a browser tab', async () => {
    const service = makeService({
      allowPrivateNetwork: true,
      quotaGuard: makeRejectingQuotaGuard('Browser QA session quota exceeded for this run (max 1)'),
    })

    await expect(service.openTab({
      orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
      runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
    })).rejects.toThrow(/session quota exceeded/i)

    expect(await service.status()).toMatchObject({ running: false, tabs: 0 })
  })

  it('checks durable screenshot quotas before capturing screenshots', async () => {
    const service = makeService({
      allowPrivateNetwork: true,
      quotaGuard: makeScreenshotRejectingQuotaGuard(
        'Browser QA screenshot quota exceeded for this run (max 1)',
      ),
    })

    try {
      const tab = await service.openTab({
        orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
        runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
      })

      await expect(service.screenshot({ targetId: tab.targetId }))
        .rejects.toThrow(/screenshot quota exceeded/i)
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('routes Stagehand actions through the gateway action layer and redacts provider payloads', async () => {
    const actionLayer = await startActionLayerServer()
    const service = makeService({
      allowPrivateNetwork: true,
      provider: {
        providerKind: 'playwright',
        actionLayer: 'stagehand',
        actionLayerControlUrl: actionLayer.url,
        actionLayerApiKey: 'stagehand-token',
      },
    })

    try {
      const tab = await service.openTab()
      const result = await service.act({
        targetId: tab.targetId,
        kind: 'extract',
        instruction: 'Extract the visible headline.',
        approvalState: 'approved',
      })

      expect(actionLayer.requests).toEqual([
        expect.objectContaining({
          authorization: 'Bearer stagehand-token',
          body: expect.objectContaining({
            instruction: 'Extract the visible headline.',
            targetId: tab.targetId,
            url: 'about:blank',
          }),
        }),
      ])
      expect(result).toMatchObject({
        ok: true,
        result: {
          provider: 'stagehand',
          mode: 'gateway-control',
          payload: {
            answer: 'ok',
            api_key: '[redacted]',
          },
        },
      })
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('executes low-risk Playwright actions without logging typed values', async () => {
    const usageRecorder = makeUsageRecorder()
    const service = makeService({
      allowPrivateNetwork: true,
      usageRecorder,
    })

    try {
      const tab = await service.openTab()
      await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: `document.body.innerHTML = '<input id="name" /><select id="plan"><option value="free">Free</option><option value="pro">Pro</option></select><label><input id="terms" type="checkbox" /> Terms</label><button id="save" onmouseenter="document.body.dataset.hovered = \\'yes\\'" onclick="document.body.dataset.saved = document.querySelector(\\'#name\\').value + \\':\\' + document.querySelector(\\'#plan\\').value + \\':\\' + document.querySelector(\\'#terms\\').checked">Save</button><div id="ready">Ready</div>'`,
        approvalState: 'approved',
      })
      await service.act({ targetId: tab.targetId, kind: 'wait_for_selector', selector: '#ready' })
      await service.act({ targetId: tab.targetId, kind: 'type', selector: '#name', value: 'Ada Lovelace' })
      await service.act({ targetId: tab.targetId, kind: 'press', selector: '#name', value: 'End' })
      await service.act({ targetId: tab.targetId, kind: 'select', selector: '#plan', value: 'pro' })
      await service.act({ targetId: tab.targetId, kind: 'check', selector: '#terms' })
      await service.act({ targetId: tab.targetId, kind: 'uncheck', selector: '#terms' })
      await service.act({ targetId: tab.targetId, kind: 'check', selector: '#terms' })
      await service.act({ targetId: tab.targetId, kind: 'scroll', value: '100' })
      await service.act({ targetId: tab.targetId, kind: 'hover', selector: '#save' })
      await service.act({ targetId: tab.targetId, kind: 'click', selector: '#save' })
      const result = await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: '({ saved: document.body.dataset.saved, hovered: document.body.dataset.hovered })',
        approvalState: 'approved',
      })

      expect(result).toMatchObject({ result: { saved: 'Ada Lovelace:pro:true', hovered: 'yes' } })
      await flushAsyncUsageRecording()
      const typeEvent = usageRecorder.events.find((event) => event.metadata.kind === 'type')
      const pressEvent = usageRecorder.events.find((event) => event.metadata.kind === 'press')
      expect(typeEvent?.metadata).toMatchObject({
        selector: '#name',
        valueLength: 'Ada Lovelace'.length,
      })
      expect(JSON.stringify(typeEvent?.metadata)).not.toContain('Ada Lovelace')
      expect(pressEvent?.metadata).toMatchObject({
        selector: '#name',
        keyLength: 'End'.length,
      })
      expect(JSON.stringify(pressEvent?.metadata)).not.toContain('End')
      expect(usageRecorder.events.map((event) => event.metadata.kind)).toEqual(expect.arrayContaining([
        'wait_for_selector',
        'press',
        'hover',
        'check',
        'uncheck',
      ]))
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('treats action-layer extract as medium risk and requires approval', async () => {
    const actionLayer = await startActionLayerServer()
    const service = makeService({
      allowPrivateNetwork: true,
      provider: {
        providerKind: 'playwright',
        actionLayer: 'stagehand',
        actionLayerControlUrl: actionLayer.url,
      },
    })

    try {
      const tab = await service.openTab()
      await expect(service.act({
        targetId: tab.targetId,
        kind: 'extract',
        instruction: 'Extract the visible headline.',
      })).rejects.toThrow(/requires approval/i)
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('treats evaluate as high-risk and requires approval', async () => {
    const service = makeService({ allowPrivateNetwork: true })

    try {
      const tab = await service.openTab()
      await expect(service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: 'document.body.dataset.changed = "yes"',
      })).rejects.toThrow(/requires approval/i)

      await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: 'document.body.dataset.changed = "yes"',
        approvalState: 'approved',
      })
      const result = await service.snapshot({ targetId: tab.targetId })
      expect(result.url).toBe('about:blank')
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('blocks high-risk submit until approval is present', async () => {
    const service = makeService({ allowPrivateNetwork: true })

    try {
      const tab = await service.openTab()
      await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: `document.body.innerHTML = '<button id="submit" onclick="document.body.dataset.submitted = \\'yes\\'">Submit</button>'`,
        approvalState: 'approved',
      })

      await expect(service.act({
        targetId: tab.targetId,
        kind: 'submit',
        selector: '#submit',
      })).rejects.toThrow(/requires approval/i)

      await service.act({
        targetId: tab.targetId,
        kind: 'submit',
        selector: '#submit',
        approvalState: 'approved',
      })
      const result = await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: 'document.body.dataset.submitted',
        approvalState: 'approved',
      })
      expect(result).toMatchObject({ result: 'yes' })
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('blocks typing into sensitive auth/payment selectors', async () => {
    const service = makeService({ allowPrivateNetwork: true })

    try {
      const tab = await service.openTab()
      await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: `document.body.innerHTML = '<input id="password" />'`,
        approvalState: 'approved',
      })

      await expect(service.act({
        targetId: tab.targetId,
        kind: 'type',
        selector: '#password',
        value: 'secret',
      })).rejects.toThrow(/secure human takeover/i)
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('blocks typing into sensitive fields based on DOM attributes and labels', async () => {
    const service = makeService({ allowPrivateNetwork: true })

    try {
      const tab = await service.openTab()
      await service.act({
        targetId: tab.targetId,
        kind: 'evaluate',
        fn: `document.body.innerHTML = '<label for="field-1">Card number</label><input id="field-1" class="field" autocomplete="cc-number" />'`,
        approvalState: 'approved',
      })

      await expect(service.act({
        targetId: tab.targetId,
        kind: 'type',
        selector: '.field',
        value: '4242424242424242',
      })).rejects.toThrow(/secure human takeover/i)
      await expect(service.act({
        targetId: tab.targetId,
        kind: 'press',
        selector: '.field',
        value: 'Enter',
      })).rejects.toThrow(/secure human takeover/i)
    } finally {
      await service.closeAll()
    }
  }, 30_000)

  it('fails closed when authenticated account provider refs do not match the gateway', async () => {
    const service = makeService({
      allowPrivateNetwork: true,
      provider: {
        providerKind: 'playwright',
        actionLayer: 'none',
      },
    })

    await expect(service.openTab({
      browserAccountId: 'acct-1',
      accountProvider: 'steel',
      providerProfileRef: 'steel-profile-1',
    })).rejects.toThrow(/pinned to steel/i)
    await service.closeAll()
  })

  it('rejects scoped tab access when org/run claims do not match', async () => {
    const service = makeService({ allowPrivateNetwork: true })

    try {
      const tab = await service.openTab({
        orgId: 'org-1',
        runId: 'run-1',
      })

      expect(() => service.assertTabScope({
        targetId: tab.targetId,
        orgId: 'org-1',
        runId: 'run-1',
      })).not.toThrow()
      expect(() => service.assertTabScope({
        targetId: tab.targetId,
        orgId: 'org-2',
        runId: 'run-1',
      })).toThrow(/org scope mismatch/i)
      expect(() => service.assertTabScope({
        targetId: tab.targetId,
        orgId: 'org-1',
        runId: 'run-2',
      })).toThrow(/run scope mismatch/i)
    } finally {
      await service.closeAll()
    }
  })
})

async function startActionLayerServer(): Promise<{
  url: string
  requests: Array<{ authorization?: string; body: Record<string, unknown> }>
}> {
  const requests: Array<{ authorization?: string; body: Record<string, unknown> }> = []
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    requests.push({
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
    })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ answer: 'ok', api_key: 'secret' }))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to bind action-layer test server')
  return {
    url: `http://127.0.0.1:${address.port}/act`,
    requests,
  }
}
