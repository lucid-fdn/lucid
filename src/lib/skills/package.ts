import { z } from 'zod'
import {
  SkillArtifactManifestSchema,
  SkillCapabilityTierSchema,
  SkillTrustTierSchema,
  SkillVariantSchema,
} from '@contracts/skill'

export const SkillPackageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  summary: z.string().nullable().optional(),
  version: z.string(),
  trust_tier: SkillTrustTierSchema,
  capability_tier: SkillCapabilityTierSchema,
  skill_markdown: z.string(),
  variants: z.array(SkillVariantSchema),
  artifact_manifest: SkillArtifactManifestSchema.nullable().optional(),
})

export type SkillPackage = z.infer<typeof SkillPackageSchema>

export function resolveSkillVariant(
  pkg: Pick<SkillPackage, 'variants'>,
  params: { engine: string; runtimeFlavor?: string; channelOwnership?: string },
) {
  return pkg.variants.find((variant) => {
    if (variant.engine !== params.engine) return false
    if (params.runtimeFlavor && variant.runtime_flavors?.length) {
      if (!variant.runtime_flavors.includes(params.runtimeFlavor)) return false
    }
    if (params.channelOwnership && variant.channel_ownership?.length) {
      if (!variant.channel_ownership.includes(params.channelOwnership)) return false
    }
    return variant.support_level !== 'unsupported'
  }) ?? null
}

export function normalizeMcpgateSkillPassport(input: unknown): SkillPackage | null {
  if (!input || typeof input !== 'object') return null
  const passport = input as Record<string, unknown>
  const metadata = (passport.metadata && typeof passport.metadata === 'object')
    ? passport.metadata as Record<string, unknown>
    : {}

  const parsed = SkillPackageSchema.safeParse({
    id: String(passport.id ?? ''),
    slug: String(metadata.slug ?? passport.id ?? ''),
    name: String(passport.name ?? ''),
    description: typeof passport.description === 'string' ? passport.description : null,
    category: String(metadata.category ?? 'general'),
    tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    summary: typeof metadata.summary === 'string' ? metadata.summary : null,
    version: String(metadata.version ?? '1.0.0'),
    trust_tier: metadata.trust_tier,
    capability_tier: metadata.capability_tier,
    skill_markdown: String(metadata.skill_markdown ?? ''),
    variants: Array.isArray(metadata.variants) ? metadata.variants : [],
    artifact_manifest: metadata.artifact_manifest ?? null,
  })

  return parsed.success ? parsed.data : null
}
