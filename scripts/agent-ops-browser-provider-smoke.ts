#!/usr/bin/env tsx

type JsonRecord = Record<string, unknown>

const args = new Set(process.argv.slice(2))
const target = getArg('--target') ?? 'https://www.lucid.foundation'
const requireLive = args.has('--require-live')
const runSession = args.has('--run-session')
const expectedProvider = getArg('--expect-provider')
const expectedActionLayer = getArg('--expect-action-layer')
const timeoutMs = getPositiveNumberArg('--timeout-ms') ?? 20_000

const baseUrl = normalizeBaseUrl(process.env.BROWSER_QA_CONTROL_URL)
const token = process.env.BROWSER_QA_CONTROL_TOKEN
  ?? process.env.BROWSER_QA_GATEWAY_TOKEN
  ?? process.env.WORKER_TRIGGER_SECRET

main().catch((error) => {
  console.error('[browser-provider-smoke] failed', error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main(): Promise<void> {
  if (!baseUrl) {
    const message = 'BROWSER_QA_CONTROL_URL is required for Browser Operator provider smoke.'
    if (requireLive) fail(message)
    console.warn(`[browser-provider-smoke] skipped: ${message}`)
    return
  }

  const started = Date.now()
  const openedTabs: string[] = []

  try {
    const status = await jsonFetch<JsonRecord>('/')
    assertProviderStatus(status)
    console.info('[browser-provider-smoke] gateway status', {
      provider: status.provider,
      actionLayer: status.actionLayer,
      running: status.running,
      tabs: status.tabs,
    })

    if (runSession) {
      await jsonFetch('/start', { method: 'POST' })
      const open = await jsonFetch<JsonRecord>('/tabs/open', {
        method: 'POST',
        body: {
          url: target,
          orgId: process.env.KNOWLEDGE_LOAD_ORG_ID,
          runId: process.env.AGENT_OPS_BROWSER_SMOKE_RUN_ID,
          stepId: 'browser-provider-smoke',
        },
      })
      const targetId = getString(open.targetId)
      if (!targetId) throw new Error('Gateway did not return targetId from /tabs/open')
      openedTabs.push(targetId)

      const snapshot = await jsonFetch<JsonRecord>(`/snapshot?targetId=${encodeURIComponent(targetId)}&maxChars=4000`)
      if (!getString(snapshot.snapshot)) throw new Error('Gateway did not return a text snapshot')

      const screenshot = await jsonFetch<JsonRecord>('/screenshot', {
        method: 'POST',
        body: { targetId, fullPage: true, type: 'png' },
      })
      if (!getString(screenshot.uri)) throw new Error('Gateway did not return a screenshot artifact URI')

      const evidence = await Promise.all([
        jsonFetch<JsonRecord>(`/console?targetId=${encodeURIComponent(targetId)}`),
        jsonFetch<JsonRecord>(`/errors?targetId=${encodeURIComponent(targetId)}`),
        jsonFetch<JsonRecord>(`/requests?targetId=${encodeURIComponent(targetId)}`),
      ])

      console.info('[browser-provider-smoke] session ok', {
        target,
        targetId,
        finalUrl: open.url,
        screenshotUri: screenshot.uri,
        snapshotChars: getString(snapshot.snapshot)?.length ?? 0,
        evidenceKinds: evidence.length,
        durationMs: Date.now() - started,
      })
    }
  } finally {
    await Promise.all(openedTabs.map((targetId) =>
      jsonFetch(`/tabs/${encodeURIComponent(targetId)}`, { method: 'DELETE' }).catch(() => null),
    ))
  }
}

function assertProviderStatus(status: JsonRecord): void {
  if (expectedProvider && status.provider !== expectedProvider) {
    throw new Error(`Expected provider ${expectedProvider}, got ${String(status.provider)}`)
  }
  if (expectedActionLayer && status.actionLayer !== expectedActionLayer) {
    throw new Error(`Expected action layer ${expectedActionLayer}, got ${String(status.actionLayer)}`)
  }
}

async function jsonFetch<T = unknown>(path: string, input: {
  method?: string
  body?: JsonRecord
} = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(input.body ? { 'content-type': 'application/json' } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as T : null as T
  if (!response.ok) {
    throw new Error(`Browser gateway ${path} failed (${response.status}): ${truncate(text, 500)}`)
  }
  return payload
}

function getArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

function getPositiveNumberArg(name: string): number | null {
  const value = getArg(name)
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) return null
  return value.replace(/\/+$/, '')
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value
}

function fail(message: string): never {
  console.error(`[browser-provider-smoke] ${message}`)
  process.exit(1)
}
