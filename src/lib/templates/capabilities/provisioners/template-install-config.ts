import type { LucidPackInstall } from '@contracts/lucid-pack'

export interface TemplateResourceInstallConfig {
  params: Record<string, string>
  nameOverride?: string
  selectedConnectionIdsByProvider?: Record<string, string | null | undefined>
}

export function readTemplateResourceInstallConfig(install: LucidPackInstall): TemplateResourceInstallConfig {
  const config = install.config ?? {}
  return {
    params: readStringRecord(config.template_params),
    nameOverride: typeof config.name_override === 'string' && config.name_override.trim()
      ? config.name_override.trim()
      : undefined,
    selectedConnectionIdsByProvider: readNullableStringRecord(config.selected_connection_ids_by_provider),
  }
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw
  }
  return out
}

function readNullableStringRecord(value: unknown): Record<string, string | null | undefined> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string | null | undefined> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || raw === null || raw === undefined) out[key] = raw
  }
  return Object.keys(out).length > 0 ? out : undefined
}
