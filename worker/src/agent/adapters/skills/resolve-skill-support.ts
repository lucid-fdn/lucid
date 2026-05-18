import type {
  CatalogSkillRecord,
  EngineSkillMountContext,
  SkillExclusionDecision,
} from './types.js'

export interface ResolvedSkillSupport {
  engine: string
  support_level: 'native' | 'portable' | 'adapted' | 'experimental' | 'unsupported'
  runtime_flavors?: string[]
  channel_ownership?: string[]
  required_tools?: string[]
  required_servers?: string[]
  overlay?: Record<string, unknown>
}

export function resolveSkillSupport(
  catalog: Pick<CatalogSkillRecord, 'source_type' | 'engine_support'>,
  ctx: EngineSkillMountContext,
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

  if (catalog.source_type === 'internal' && ctx.engine === 'openclaw') {
    return {
      engine: 'openclaw',
      support_level: 'native',
      runtime_flavors: ['shared', 'c1_managed', 'c2a_autonomous'],
      channel_ownership: ['lucid_relay', 'runtime_native'],
    }
  }

  return null
}

export function explainSkillSupportExclusion(
  skill: Pick<CatalogSkillRecord, 'slug' | 'status' | 'source_type' | 'source_version' | 'engine_support'>,
  ctx: EngineSkillMountContext,
): SkillExclusionDecision | null {
  if (skill.status !== 'approved') {
    return {
      skillSlug: skill.slug,
      reason: 'not_approved',
      sourceType: skill.source_type ?? null,
      sourceVersion: skill.source_version ?? null,
    }
  }

  const variants = Array.isArray(skill.engine_support)
    ? (skill.engine_support as ResolvedSkillSupport[])
    : []

  if (variants.length > 0) {
    const sameEngine = variants.filter((candidate) => candidate.engine === ctx.engine)
    if (sameEngine.length === 0) {
      return {
        skillSlug: skill.slug,
        reason: 'engine_mismatch',
        sourceType: skill.source_type ?? null,
        sourceVersion: skill.source_version ?? null,
      }
    }

    const sameEngineRuntime = sameEngine.filter((candidate) => {
      if (ctx.runtimeFlavor && candidate.runtime_flavors?.length) {
        return candidate.runtime_flavors.includes(ctx.runtimeFlavor)
      }
      return true
    })
    if (sameEngineRuntime.length === 0) {
      return {
        skillSlug: skill.slug,
        reason: 'runtime_mismatch',
        sourceType: skill.source_type ?? null,
        sourceVersion: skill.source_version ?? null,
        engine: ctx.engine,
      }
    }

    const sameEngineChannel = sameEngineRuntime.filter((candidate) => {
      if (ctx.channelOwnership && candidate.channel_ownership?.length) {
        return candidate.channel_ownership.includes(ctx.channelOwnership)
      }
      return true
    })
    if (sameEngineChannel.length === 0) {
      return {
        skillSlug: skill.slug,
        reason: 'channel_mismatch',
        sourceType: skill.source_type ?? null,
        sourceVersion: skill.source_version ?? null,
        engine: ctx.engine,
      }
    }

    const unsupported = sameEngineChannel.find((candidate) => candidate.support_level === 'unsupported')
    return {
      skillSlug: skill.slug,
      reason: 'unsupported',
      sourceType: skill.source_type ?? null,
      sourceVersion: skill.source_version ?? null,
      engine: unsupported?.engine ?? ctx.engine,
      supportLevel: unsupported?.support_level ?? 'unsupported',
    }
  }

  if (skill.source_type === 'internal' && ctx.engine !== 'openclaw') {
    return {
      skillSlug: skill.slug,
      reason: 'legacy_openclaw_only',
      sourceType: skill.source_type ?? null,
      sourceVersion: skill.source_version ?? null,
    }
  }

  return {
    skillSlug: skill.slug,
    reason: 'unknown',
    sourceType: skill.source_type ?? null,
    sourceVersion: skill.source_version ?? null,
  }
}
