import 'server-only'

import type { SkillPackage } from './package'
import { listMcpgateSkills, upsertMcpgateSkill } from './mcpgate'
import { listInternalSkillPackages } from './internal-packages'

export async function publishInternalSkillsToMcpgate(): Promise<{
  discovered: number
  published: number
  skipped: number
}> {
  const [internalSkills, existingSkills] = await Promise.all([
    listInternalSkillPackages(),
    listMcpgateSkills(),
  ])

  const existingBySlug = new Map(existingSkills.map((skill) => [skill.slug, skill]))
  let published = 0
  let skipped = 0

  for (const skill of internalSkills) {
    const existing = existingBySlug.get(skill.slug)
    if (
      existing &&
      existing.version === skill.version &&
      existing.artifact_manifest?.checksum &&
      existing.artifact_manifest.checksum === skill.artifact_manifest?.checksum
    ) {
      skipped++
      continue
    }

    await upsertMcpgateSkill(skill, existing ?? null)
    published++
  }

  return {
    discovered: internalSkills.length,
    published,
    skipped,
  }
}
