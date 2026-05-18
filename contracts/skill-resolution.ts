import type { SkillCatalogEntry } from './skill'

export interface SkillResolutionContext {
  engine: string
  runtimeFlavor?: string | null
  channelOwnership?: string | null
}

export interface ResolvedSkillSupport {
  engine: string
  support_level: 'native' | 'portable' | 'adapted' | 'experimental' | 'unsupported'
  runtime_flavors?: string[]
  channel_ownership?: string[]
  required_tools?: string[]
  required_servers?: string[]
  overlay?: Record<string, unknown>
}

export function buildSkillVariantKey(ctx: SkillResolutionContext): string {
  return [
    ctx.engine,
    ctx.runtimeFlavor ?? 'any',
    ctx.channelOwnership ?? 'any',
  ].join(':')
}

export function enumerateSkillVariantKeys(
  catalog: Pick<SkillCatalogEntry, 'source_type' | 'engine_support'>,
): string[] {
  const variants = Array.isArray(catalog.engine_support)
    ? (catalog.engine_support as ResolvedSkillSupport[])
    : []

  if (variants.length === 0 && catalog.source_type === 'internal') {
    const keys: string[] = []
    for (const runtimeFlavor of ['shared', 'c1_managed', 'c2a_autonomous']) {
      for (const channelOwnership of ['lucid_relay', 'runtime_native']) {
        keys.push(buildSkillVariantKey({ engine: 'openclaw', runtimeFlavor, channelOwnership }))
      }
    }
    return keys
  }

  const keys = new Set<string>()
  for (const variant of variants) {
    if (variant.support_level === 'unsupported') continue
    const runtimeFlavors = variant.runtime_flavors?.length ? variant.runtime_flavors : ['shared', 'c1_managed', 'c2a_autonomous']
    const channelOwnership = variant.channel_ownership?.length ? variant.channel_ownership : ['lucid_relay', 'runtime_native']
    for (const runtimeFlavor of runtimeFlavors) {
      for (const ownership of channelOwnership) {
        keys.add(buildSkillVariantKey({
          engine: variant.engine,
          runtimeFlavor,
          channelOwnership: ownership,
        }))
      }
    }
  }

  return Array.from(keys).sort()
}

export function resolveSkillSupport(
  catalog: Pick<SkillCatalogEntry, 'source_type' | 'engine_support'>,
  ctx: SkillResolutionContext,
): ResolvedSkillSupport | null {
  const variants = Array.isArray(catalog.engine_support)
    ? (catalog.engine_support as ResolvedSkillSupport[])
    : []

  const explicit = variants.find((candidate) => {
    if (candidate.engine !== ctx.engine) return false
    if (ctx.runtimeFlavor && candidate.runtime_flavors?.length) {
      if (!candidate.runtime_flavors.includes(ctx.runtimeFlavor)) return false
    }
    if (ctx.channelOwnership && candidate.channel_ownership?.length) {
      if (!candidate.channel_ownership.includes(ctx.channelOwnership)) return false
    }
    return candidate.support_level !== 'unsupported'
  })

  if (explicit) return explicit

  if (variants.length > 0) return null

  if (catalog.source_type === 'internal') {
    if (ctx.engine === 'openclaw') {
      return {
        engine: 'openclaw',
        support_level: 'native',
        runtime_flavors: ['shared', 'c1_managed', 'c2a_autonomous'],
        channel_ownership: ['lucid_relay', 'runtime_native'],
      }
    }
    return null
  }

  return null
}
