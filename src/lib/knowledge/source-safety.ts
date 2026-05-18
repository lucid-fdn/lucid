export interface KnowledgeSourceUrlSafetyDecision {
  safe: boolean
  reason: string
  normalizedUrl?: string
  blockedHost?: string
}

export class KnowledgeSourceSafetyError extends Error {
  readonly details: KnowledgeSourceUrlSafetyDecision

  constructor(details: KnowledgeSourceUrlSafetyDecision) {
    super(`Knowledge source URL rejected: ${details.reason}`)
    this.name = 'KnowledgeSourceSafetyError'
    this.details = details
  }
}

const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
])

export function evaluateKnowledgeSourceUrlSafety(rawUrl: string | null | undefined): KnowledgeSourceUrlSafetyDecision {
  if (!rawUrl?.trim()) return { safe: true, reason: 'no_url' }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { safe: false, reason: 'invalid_url' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: 'unsupported_protocol', normalizedUrl: parsed.toString() }
  }

  const host = normalizeHost(parsed.hostname)
  if (!host) return { safe: false, reason: 'missing_host', normalizedUrl: parsed.toString() }
  if (METADATA_HOSTS.has(host)) {
    return { safe: false, reason: 'metadata_host', normalizedUrl: parsed.toString(), blockedHost: host }
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { safe: false, reason: 'local_hostname', normalizedUrl: parsed.toString(), blockedHost: host }
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return { safe: false, reason: 'private_network_host', normalizedUrl: parsed.toString(), blockedHost: host }
  }

  return { safe: true, reason: 'public_url', normalizedUrl: parsed.toString() }
}

export function assertKnowledgeSourceUrlSafe(rawUrl: string | null | undefined): void {
  const decision = evaluateKnowledgeSourceUrlSafety(rawUrl)
  if (!decision.safe) throw new KnowledgeSourceSafetyError(decision)
}

function normalizeHost(hostname: string): string {
  return hostname.trim().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '').toLowerCase()
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts as [number, number, number, number]
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
}

function isPrivateIpv6(host: string): boolean {
  if (!host.includes(':')) return false
  const normalized = host.toLowerCase()
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fe80:')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
}
