export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

export function readPositiveIntEnv(name: string, fallback: number): number {
  const configured = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(configured) && configured > 0 ? configured : fallback
}

export function composeAbortSignal(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!signal) return timeoutSignal
  if (signal.aborted) return signal

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeoutSignal])
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  timeoutSignal.addEventListener('abort', abort, { once: true })
  return controller.signal
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: composeAbortSignal(init.signal, timeoutMs),
  })
}
