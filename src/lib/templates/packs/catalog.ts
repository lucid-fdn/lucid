import type { LucidPackManifest } from '@contracts/lucid-pack'
import { WEB3_CAPABILITY_TEMPLATES } from '@/lib/templates/capabilities/catalog'
import { getPlatformTemplateSeeds } from '@/lib/templates/registry'
import { registrySeedToLucidPackManifest } from '@/lib/templates/pack-adapter'

export const PLATFORM_AGENT_TEAM_TEMPLATE_PACKS: LucidPackManifest[] = getPlatformTemplateSeeds()
  .map(registrySeedToLucidPackManifest)

export const PLATFORM_TEMPLATE_PACKS: LucidPackManifest[] = [
  ...PLATFORM_AGENT_TEAM_TEMPLATE_PACKS,
  ...WEB3_CAPABILITY_TEMPLATES,
]
