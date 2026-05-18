import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

export type RefreshSessionFn = () => Promise<boolean>

function withCSRF(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers)
  const csrf = getCSRFTokenFromCookie()
  if (csrf) {
    nextHeaders.set('x-csrf-token', csrf)
  }
  return nextHeaders
}

export function buildClientMutationHeaders(
  headers?: HeadersInit,
  options?: { includeIdempotencyKey?: boolean },
): Headers {
  const nextHeaders = withCSRF(headers)

  if (!nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json')
  }

  if (options?.includeIdempotencyKey && !nextHeaders.has('x-idempotency-key')) {
    nextHeaders.set('x-idempotency-key', crypto.randomUUID())
  }

  return nextHeaders
}

async function refreshCSRFToken(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

export async function fetchWithSessionRecovery(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  refreshSession: RefreshSessionFn,
): Promise<Response> {
  const run = (requestInit?: RequestInit) =>
    fetch(input, {
      ...requestInit,
      credentials: requestInit?.credentials ?? 'same-origin',
    })

  const firstResponse = await run(init)
  if (firstResponse.status === 403) {
    const refreshedCSRF = await refreshCSRFToken()
    if (refreshedCSRF) {
      return run({
        ...init,
        headers: withCSRF(init?.headers),
      })
    }
  }

  if (firstResponse.status !== 401) {
    return firstResponse
  }

  const refreshed = await refreshSession().catch(() => false)
  if (!refreshed) {
    return firstResponse
  }

  return run({
    ...init,
    headers: withCSRF(init?.headers),
  })
}
