import 'server-only'
import { getWorkerUrl } from '@/lib/worker/config'

/**
 * Thin proxy to worker Polymarket endpoints.
 * Auth: Bearer WORKER_TRIGGER_SECRET (same as /stream, /trigger).
 */
export async function polymarketWorkerFetch(path: string, init?: RequestInit): Promise<unknown> {
  const workerUrl = getWorkerUrl()
  if (!workerUrl) throw new Error('WORKER_URL not configured')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (process.env.WORKER_TRIGGER_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.WORKER_TRIGGER_SECRET}`
  }

  const res = await fetch(`${workerUrl}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Worker ${res.status}: ${body.substring(0, 200)}`)
  }
  return res.json()
}
