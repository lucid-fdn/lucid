import 'server-only'

import { getWorkerUrl } from '@/lib/worker/config'

function buildWorkerHeaders(init?: RequestInit): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }

  if (process.env.WORKER_TRIGGER_SECRET) {
    headers.Authorization = `Bearer ${process.env.WORKER_TRIGGER_SECRET}`
  }

  return headers
}

export async function discordWorkerFetch(path: string, init?: RequestInit): Promise<unknown> {
  const workerUrl = getWorkerUrl()
  if (!workerUrl) {
    throw new Error('WORKER_URL not configured')
  }

  const response = await fetch(`${workerUrl}${path}`, {
    ...init,
    headers: buildWorkerHeaders(init),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Worker ${response.status}: ${body.slice(0, 200)}`)
  }

  return response.json()
}

export async function slackWorkerFetch(path: string, init?: RequestInit): Promise<unknown> {
  const workerUrl = getWorkerUrl()
  if (!workerUrl) {
    throw new Error('WORKER_URL not configured')
  }

  const response = await fetch(`${workerUrl}${path}`, {
    ...init,
    headers: buildWorkerHeaders(init),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Worker ${response.status}: ${body.slice(0, 200)}`)
  }

  return response.json()
}
