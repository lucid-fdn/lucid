import 'server-only'
import { fetchWithTimeout, readPositiveIntEnv } from '@/lib/http/fetch-timeout'
import { getWorkerUrl } from '@/lib/worker/config'

const WORKER_TRIGGER_TIMEOUT_MS = 5_000

export async function triggerInboundWorker(logPrefix: string): Promise<void> {
  const workerUrl = getWorkerUrl()
  const workerSecret = process.env.WORKER_TRIGGER_SECRET

  if (!workerUrl) return

  try {
    const response = await fetchWithTimeout(`${workerUrl}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {}),
      },
      body: JSON.stringify({ event_type: 'inbound' }),
    }, readPositiveIntEnv('WORKER_TRIGGER_TIMEOUT_MS', WORKER_TRIGGER_TIMEOUT_MS))

    if (!response.ok) {
      console.warn(`${logPrefix} Worker trigger returned HTTP ${response.status}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`${logPrefix} Failed to trigger worker: ${message}`)
  }
}
