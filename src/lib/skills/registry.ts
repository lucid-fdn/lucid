import 'server-only'

import type { SkillCatalogEntry, OrgSkillInstallation } from '../../../contracts/skill'

import { getSkillCatalog, getOrgSkills } from '@/lib/db/skills'
import { listInternalSkillPackages } from '@/lib/skills/internal-packages'
import type { SkillPackage } from '@/lib/skills/package'

export interface UnifiedSkillRegistry {
  internalPackages: SkillPackage[]
  catalogSkills: SkillCatalogEntry[]
  orgInstalledSkills: OrgSkillInstallation[]
  installedSkillIds: Set<string>
}

export async function getUnifiedSkillRegistry(orgId?: string): Promise<UnifiedSkillRegistry> {
  const [catalogSkills, orgInstalledSkills, internalPackages] = await Promise.all([
    getSkillCatalog(orgId),
    orgId ? getOrgSkills(orgId) : Promise.resolve([]),
    listInternalSkillPackages(),
  ])

  return {
    internalPackages,
    catalogSkills,
    orgInstalledSkills,
    installedSkillIds: new Set(orgInstalledSkills.map((installation) => installation.skill_id)),
  }
}

