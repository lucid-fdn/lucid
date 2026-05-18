import type { SafeSkillSnapshot, ActiveSkillRow } from '../../skills/types.js'
import type { WorkerAgentEngine } from '../../engines/types.js'

export interface EngineSkillMountContext {
  engine: WorkerAgentEngine
  runtimeFlavor?: string | null
  channelOwnership?: string | null
}

export interface CatalogSkillRecord {
  slug: string
  name: string
  description: string | null
  sanitized_content: string
  frontmatter: Record<string, unknown> | null
  content_chars: number | null
  source_type?: 'internal' | 'mcpgate' | 'imported' | null
  source_version?: string | null
  engine_support?: unknown
  status?: string
}

export interface SkillSelectionDecision {
  skillSlug: string
  source: 'builtin' | 'catalog'
  reason: 'builtin' | 'engine_support'
  engine?: string
  supportLevel?: 'native' | 'portable' | 'adapted' | 'experimental' | 'unsupported'
  sourceType?: 'internal' | 'mcpgate' | 'imported' | null
  sourceVersion?: string | null
}

export interface SkillSelectionSummary {
  selectedCount: number
  decisions: SkillSelectionDecision[]
}

export interface SkillExclusionDecision {
  skillSlug: string
  reason:
    | 'not_approved'
    | 'engine_mismatch'
    | 'runtime_mismatch'
    | 'channel_mismatch'
    | 'unsupported'
    | 'legacy_openclaw_only'
    | 'unknown'
  sourceType?: 'internal' | 'mcpgate' | 'imported' | null
  sourceVersion?: string | null
  engine?: string
  supportLevel?: 'native' | 'portable' | 'adapted' | 'experimental' | 'unsupported'
}

export interface SkillExclusionSummary {
  excludedCount: number
  decisions: SkillExclusionDecision[]
}

export interface EngineMountedSkills {
  rows: ActiveSkillRow[]
  promptSection: string
  snapshot: SafeSkillSnapshot
  selectionSummary: SkillSelectionSummary
  exclusionSummary: SkillExclusionSummary
}

export interface EngineSkillAdapter {
  engine: WorkerAgentEngine
  selectCatalogSkill(
    skill: CatalogSkillRecord,
    ctx: EngineSkillMountContext,
    sortOrder: number,
  ): ActiveSkillRow | null
  mountSkills(rows: ActiveSkillRow[]): EngineMountedSkills
}
