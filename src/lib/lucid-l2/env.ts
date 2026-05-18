function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || null
  }
  return trimmed
}

export function getL2ApiUrl(): string | null {
  return normalizeEnvValue(process.env.LUCID_L2_API_URL)
}

export function getL2GatewayBaseUrl(): string | null {
  return getL2ApiUrl()?.replace(/\/api\/?$/, '') ?? null
}

export function getL2AdminApiKeyFromEnv(): string | null {
  return normalizeEnvValue(process.env.LUCID_L2_ADMIN_KEY)
}

export function getPassportOwnerFallback(): string | null {
  return normalizeEnvValue(process.env.LUCID_PLATFORM_WALLET)
}

export function describePassportOwnerEnvNames(): string {
  return 'LUCID_PLATFORM_WALLET'
}
