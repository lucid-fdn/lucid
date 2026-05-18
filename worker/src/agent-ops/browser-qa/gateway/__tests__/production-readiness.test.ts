import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'

import { registerBrowserQaGatewayRoutes } from '../routes.js'

const servers: http.Server[] = []
const artifactDirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve())
  })))
  await Promise.all(artifactDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('Browser QA gateway production readiness smoke', () => {
  it('serves the full authenticated HTTP smoke path with real Chromium and artifact fetch', async () => {
    const artifactDir = await makeArtifactDir()
    const { baseUrl, closeGateway } = await startGateway({
      artifactDir,
      maxConcurrency: 2,
      token: 'smoke-token',
    })

    try {
      await expect(jsonFetch(`${baseUrl}/`, { token: 'wrong-token' }))
        .rejects.toThrow(/401/)

      const status = await jsonFetch(`${baseUrl}/`, { token: 'smoke-token' }) as {
        provider: string
        actionLayer: string
      }
      expect(status).toMatchObject({
        provider: 'playwright',
        actionLayer: 'none',
      })

      const providerHealth = await jsonFetch(`${baseUrl}/provider-health`, {
        token: 'smoke-token',
      }) as { ok: boolean; provider: string; cdpConfigured: boolean }
      expect(providerHealth).toMatchObject({
        ok: true,
        provider: 'playwright',
        cdpConfigured: true,
      })

      const smokeContext = {
        orgId: '8a8b4a08-3b7e-4c42-a75a-16c8e1cc9b8b',
        runId: '0cf03ae1-86df-476f-8d5e-af43a6dd3276',
        stepId: 'browser-step',
      }

      const open = await jsonFetch(`${baseUrl}/sessions`, {
        token: 'smoke-token',
        method: 'POST',
        body: smokeContext,
      }) as { targetId: string }

      expect(open.targetId).toMatch(/[0-9a-f-]{36}/)

      const session = await jsonFetch(`${baseUrl}/sessions/${open.targetId}`, {
        token: 'smoke-token',
        headers: smokeContext,
      }) as { sessionKey: string; provider: string; stats: Record<string, unknown> }
      expect(session).toMatchObject({
        sessionKey: open.targetId,
        provider: 'playwright',
      })

      const snapshot = await jsonFetch(`${baseUrl}/snapshot?targetId=${open.targetId}`, {
        token: 'smoke-token',
        headers: smokeContext,
      }) as { ok: true; snapshot: string }
      expect(snapshot.ok).toBe(true)
      expect(snapshot.snapshot).toContain('URL: about:blank')

      const screenshot = await jsonFetch(`${baseUrl}/screenshot`, {
        token: 'smoke-token',
        method: 'POST',
        body: { targetId: open.targetId, ...smokeContext },
      }) as { uri: string; byteLength: number; contentType: string }

      expect(screenshot.uri).toMatch(/^\/artifacts\//)
      expect(screenshot.byteLength).toBeGreaterThan(1000)
      expect(screenshot.contentType).toBe('image/png')

      const artifact = await fetch(`${baseUrl}${screenshot.uri}`, {
        headers: { authorization: 'Bearer smoke-token' },
      })
      expect(artifact.status).toBe(200)
      expect(artifact.headers.get('content-type')).toContain('image/png')
      expect((await artifact.arrayBuffer()).byteLength).toBe(screenshot.byteLength)

      const replay = await jsonFetch(`${baseUrl}/sessions/${open.targetId}/replay`, {
        token: 'smoke-token',
        headers: smokeContext,
      }) as { events: Array<{ type: string; metadata: Record<string, unknown> }> }
      expect(replay.events.map((event) => event.type)).toContain('tab_opened')
      expect(JSON.stringify(replay.events)).not.toContain('smoke-token')

      const close = await jsonFetch(`${baseUrl}/tabs/${open.targetId}`, {
        token: 'smoke-token',
        method: 'DELETE',
        headers: smokeContext,
      }) as { ok: boolean }
      expect(close.ok).toBe(true)
    } finally {
      await closeGateway()
    }
  }, 45_000)

  it('enforces concurrency under local gateway stress without leaking tabs', async () => {
    const artifactDir = await makeArtifactDir()
    const { baseUrl, closeGateway } = await startGateway({
      artifactDir,
      maxConcurrency: 2,
      token: 'stress-token',
    })

    try {
      const responses = await Promise.allSettled(Array.from({ length: 8 }, () => jsonFetch(`${baseUrl}/tabs/open`, {
        token: 'stress-token',
        method: 'POST',
      })))

      const opened = responses
        .filter((result): result is PromiseFulfilledResult<{ targetId: string }> => result.status === 'fulfilled')
        .map((result) => result.value)
      const rejected = responses.filter((result) => result.status === 'rejected')

      expect(opened.length).toBeLessThanOrEqual(2)
      expect(rejected.length).toBeGreaterThanOrEqual(6)

      const statusDuringStress = await jsonFetch(`${baseUrl}/`, {
        token: 'stress-token',
      }) as { tabs: number }
      expect(statusDuringStress.tabs).toBe(opened.length)

      await Promise.all(opened.map((tab) => jsonFetch(`${baseUrl}/tabs/${tab.targetId}`, {
        token: 'stress-token',
        method: 'DELETE',
      })))

      const finalStatus = await jsonFetch(`${baseUrl}/`, {
        token: 'stress-token',
      }) as { tabs: number }
      expect(finalStatus.tabs).toBe(0)
    } finally {
      await closeGateway()
    }
  }, 45_000)
})

async function makeArtifactDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-browser-qa-live-smoke-'))
  artifactDirs.push(dir)
  return dir
}

async function startGateway(input: {
  artifactDir: string
  maxConcurrency: number
  token: string
}): Promise<{ baseUrl: string; closeGateway: () => Promise<void> }> {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  const gateway = registerBrowserQaGatewayRoutes(app, {
    BROWSER_QA_ALLOW_PRIVATE_NETWORK: true,
    BROWSER_QA_ARTIFACT_BUCKET: 'agent-ops-browser-qa',
    BROWSER_QA_ARTIFACT_DIR: input.artifactDir,
    BROWSER_QA_ARTIFACT_RETENTION_DAYS: 7,
    BROWSER_QA_ARTIFACT_STORE: 'local',
    BROWSER_QA_CONTROL_TOKEN: undefined,
    BROWSER_QA_GATEWAY_TOKEN: input.token,
    BROWSER_QA_HEADLESS: true,
    BROWSER_QA_MAX_CONCURRENCY: input.maxConcurrency,
    BROWSER_QA_MAX_SCREENSHOT_BYTES: 5 * 1024 * 1024,
    BROWSER_QA_MAX_SCREENSHOTS_PER_RUN: 20,
    BROWSER_QA_MAX_SESSIONS_PER_RUN: 20,
    BROWSER_QA_PUBLIC_BASE_URL: undefined,
    BROWSER_QA_SESSION_TTL_SECONDS: 60,
    WORKER_TRIGGER_SECRET: undefined,
  } as never)

  const server = http.createServer(app)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to bind gateway smoke server')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    closeGateway: async () => {
      await gateway.close()
    },
  }
}

async function jsonFetch(url: string, input: {
  token: string
  method?: string
  body?: Record<string, unknown>
  headers?: {
    orgId?: string
    runId?: string
    stepId?: string
  }
}): Promise<unknown> {
  const response = await fetch(url, {
    method: input.method ?? 'GET',
    headers: {
      authorization: `Bearer ${input.token}`,
      ...(input.headers?.orgId ? { 'x-lucid-org-id': input.headers.orgId } : {}),
      ...(input.headers?.runId ? { 'x-lucid-run-id': input.headers.runId } : {}),
      ...(input.headers?.stepId ? { 'x-lucid-step-id': input.headers.stepId } : {}),
      ...(input.body ? { 'content-type': 'application/json' } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as unknown : null
  if (!response.ok) {
    throw new Error(`${response.status}: ${text}`)
  }
  return payload
}
