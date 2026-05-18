import 'server-only'

function normalizeUrl(value?: string | null): string | null {
  const normalized = value
    ?.replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\r?\n/g, '')
    .trim()
    .replace(/\/+$/, '')
  return normalized ? normalized : null
}

export function getWorkerUrl(): string | null {
  return normalizeUrl(process.env.WORKER_URL)
}

export function getWorkerHealthUrl(): string | null {
  const explicit = normalizeUrl(process.env.WORKER_HEALTH_URL)
  if (explicit) return explicit

  const railwayDomain = normalizeUrl(process.env.RAILWAY_PUBLIC_DOMAIN)
  if (railwayDomain) {
    return `https://${railwayDomain}/health`
  }

  return null
}
