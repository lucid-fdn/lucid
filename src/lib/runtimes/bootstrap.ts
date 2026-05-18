import type { RuntimeMigrationConfig } from './migration'
import type { RuntimeBlueprint } from '@contracts/project-blueprint'

export interface RuntimeBootstrapConfig {
  migration?: RuntimeMigrationConfig | null
  advanced?: {
    network?: RuntimeBlueprint['network']
    limits?: RuntimeBlueprint['limits']
    maintenance?: RuntimeBlueprint['maintenance']
    model?: RuntimeBlueprint['model']
  } | null
}

export function normalizeRuntimeBootstrapConfig(
  value: RuntimeBootstrapConfig | null | undefined,
): RuntimeBootstrapConfig | null {
  if (!value) return null
  const normalized: RuntimeBootstrapConfig = {}
  if (value.migration) normalized.migration = value.migration
  if (value.advanced && Object.keys(value.advanced).length > 0) normalized.advanced = value.advanced
  return Object.keys(normalized).length > 0 ? normalized : null
}

