import type { Config } from '../config.js'

export type AvatarGenerationWorkerHandle = {
  stop(): void
  status(): {
    enabled: boolean
    running: boolean
    lastProcessedAt: string | null
    lastErrorAt: string | null
    lastError: string | null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveControlPlaneUrl(config: Config): string | null {
  if (config.WORKER_CONTROL_PLANE_URL) return config.WORKER_CONTROL_PLANE_URL

  if (config.NODE_ENV !== 'production') {
    const port = process.env.CONTROL_PLANE_PORT || process.env.NEXT_PORT || '3000'
    return `http://localhost:${port}`
  }

  return config.LUCID_CONTROL_PLANE_URL ?? null
}

export function startAvatarGenerationWorker(config: Config): AvatarGenerationWorkerHandle | null {
  if (!config.AI_AVATAR_JOB_WORKER_ENABLED) {
    console.log('[avatar-generation] Worker disabled')
    return null
  }

  const controlPlaneUrl = resolveControlPlaneUrl(config)
  if (!controlPlaneUrl || !config.WORKER_TRIGGER_SECRET) {
    console.warn(
      '[avatar-generation] Worker not started: WORKER_CONTROL_PLANE_URL (or production LUCID_CONTROL_PLANE_URL) and WORKER_TRIGGER_SECRET are required',
    )
    return null
  }

  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastProcessedAt: string | null = null
  let lastErrorAt: string | null = null
  let lastError: string | null = null

  const endpoint = `${normalizeBaseUrl(controlPlaneUrl)}/api/internal/agent-avatar-jobs/process-next`

  async function processOne(slot: number): Promise<void> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.WORKER_TRIGGER_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        workerId: `${config.WORKER_ID}:avatar:${slot}`,
        limit: 1,
        staleAfterSeconds: config.AI_AVATAR_JOB_STALE_AFTER_SECONDS,
      }),
      signal: AbortSignal.timeout(config.AI_AVATAR_JOB_REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Avatar worker request failed (${response.status}): ${body.slice(0, 300)}`)
    }

    const payload = await response.json().catch(() => null) as {
      data?: { processed?: number }
    } | null
    if ((payload?.data?.processed ?? 0) > 0) {
      lastProcessedAt = new Date().toISOString()
    }
  }

  async function tick(): Promise<void> {
    if (stopped || running) return
    running = true
    try {
      await Promise.all(
        Array.from({ length: config.AI_AVATAR_JOB_CONCURRENCY }, (_, index) => processOne(index + 1)),
      )
      lastError = null
    } catch (error) {
      lastErrorAt = new Date().toISOString()
      lastError = error instanceof Error ? error.message : String(error)
      console.warn('[avatar-generation] Poll failed:', lastError)
      await sleep(Math.min(config.AI_AVATAR_JOB_POLL_INTERVAL_MS, 10_000))
    } finally {
      running = false
      if (!stopped) {
        timer = setTimeout(() => {
          void tick()
        }, config.AI_AVATAR_JOB_POLL_INTERVAL_MS)
      }
    }
  }

  console.log(
    `[avatar-generation] Worker started (concurrency=${config.AI_AVATAR_JOB_CONCURRENCY}, interval=${config.AI_AVATAR_JOB_POLL_INTERVAL_MS}ms)`,
  )
  void tick()

  return {
    stop() {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
    status() {
      return {
        enabled: config.AI_AVATAR_JOB_WORKER_ENABLED,
        running,
        lastProcessedAt,
        lastErrorAt,
        lastError,
      }
    },
  }
}
