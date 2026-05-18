export type SerializedAgentAvatarAsset = {
  id: string
  url: string
  provider?: string | null
  model?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

export type SerializedAgentAvatarJob<TAsset extends SerializedAgentAvatarAsset = SerializedAgentAvatarAsset> = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  data?: TAsset | null
  errorCode?: string | null
  errorMessage?: string | null
  progressStage?: string | null
  progressPercent?: number | null
  partialAssets?: Array<{ index: number; url: string; storagePath?: string; createdAt: string }> | null
}

type WaitForAgentAvatarJobOptions = {
  timeoutMs?: number
  pollIntervalMs?: number
  statusRequestTimeoutMs?: number
  onUpdate?: (job: SerializedAgentAvatarJob) => void
}

function latestPartialUrl(job: SerializedAgentAvatarJob): string | null {
  const partials = job.partialAssets ?? []
  return partials.length > 0 ? partials[partials.length - 1]?.url ?? null : null
}

function assertTerminalJob<TAsset extends SerializedAgentAvatarAsset>(job: SerializedAgentAvatarJob<TAsset>): TAsset | null {
  if (job.status === 'succeeded') return job.data ?? null
  if (job.status === 'failed' || job.status === 'canceled') {
    throw new Error(job.errorMessage || 'Avatar generation failed')
  }
  return null
}

function isRetryableJobStatusFailure(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function isRetryableJobStatusError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /abort|timeout|network|fetch failed|failed to fetch|load avatar generation job/i.test(message)
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}

async function pollAvatarJob<TAsset extends SerializedAgentAvatarAsset>(
  jobId: string,
  options: Required<Pick<WaitForAgentAvatarJobOptions, 'timeoutMs' | 'pollIntervalMs' | 'statusRequestTimeoutMs'>> & WaitForAgentAvatarJobOptions,
  startedAt: number,
): Promise<TAsset> {
  while (Date.now() - startedAt < options.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs))
    try {
      const response = await fetch(`/api/ai/avatar-jobs/${jobId}`, {
        method: 'GET',
        credentials: 'same-origin',
        signal: createTimeoutSignal(options.statusRequestTimeoutMs),
      })
      const payload = await response.json().catch(() => null) as { data?: SerializedAgentAvatarJob<TAsset>; error?: string } | null
      if (!response.ok || !payload?.data) {
        if (isRetryableJobStatusFailure(response.status)) {
          continue
        }
        throw new Error(payload?.error || `Avatar job status failed (${response.status})`)
      }
      options.onUpdate?.(payload.data)
      const asset = assertTerminalJob(payload.data)
      if (asset) return asset
    } catch (error) {
      if (isRetryableJobStatusError(error)) {
        continue
      }
      throw error
    }
  }

  throw new Error('Avatar generation timed out. Please check again in a moment.')
}

export function getLatestAvatarPartialUrl(job: SerializedAgentAvatarJob): string | null {
  return latestPartialUrl(job)
}

export async function waitForAgentAvatarJob<TAsset extends SerializedAgentAvatarAsset = SerializedAgentAvatarAsset>(
  jobId: string,
  options: WaitForAgentAvatarJobOptions = {},
): Promise<TAsset> {
  const normalized = {
    timeoutMs: options.timeoutMs ?? 5 * 60 * 1000,
    pollIntervalMs: options.pollIntervalMs ?? 3000,
    statusRequestTimeoutMs: options.statusRequestTimeoutMs ?? 20_000,
    onUpdate: options.onUpdate,
  }
  const startedAt = Date.now()

  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    return pollAvatarJob<TAsset>(jobId, normalized, startedAt)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let fallbackStarted = false
    const eventSource = new window.EventSource(`/api/ai/avatar-jobs/${jobId}?stream=1`)
    let timeout: number | undefined

    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      eventSource.close()
      if (timeout) window.clearTimeout(timeout)
      callback()
    }

    const startFallback = () => {
      if (settled || fallbackStarted) return
      fallbackStarted = true
      eventSource.close()
      pollAvatarJob<TAsset>(jobId, normalized, startedAt)
        .then((asset) => settle(() => resolve(asset)))
        .catch((error) => settle(() => reject(error)))
    }

    timeout = window.setTimeout(() => {
      settle(() => reject(new Error('Avatar generation timed out. Please check again in a moment.')))
    }, normalized.timeoutMs)

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as unknown
        const data = payload && typeof payload === 'object' && 'data' in payload
          ? (payload as { data?: unknown }).data
          : null
        const job = data && typeof data === 'object' && 'status' in data
          ? data as SerializedAgentAvatarJob<TAsset>
          : payload as SerializedAgentAvatarJob<TAsset>
        normalized.onUpdate?.(job)
        const asset = assertTerminalJob(job)
        if (asset) settle(() => resolve(asset))
      } catch (error) {
        settle(() => reject(error))
      }
    }

    eventSource.onerror = () => {
      startFallback()
    }
  })
}
