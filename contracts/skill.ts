/**
 * Skill System Contracts
 *
 * Pure TypeScript + Zod — no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 *
 * Simpler than plugins: no tool_manifest, no version tracking, no per-tool toggling.
 * Skills are whole units — either active or not.
 */

import { z } from 'zod'

export const SkillSupportLevelSchema = z.enum([
  'native',
  'portable',
  'adapted',
  'experimental',
  'unsupported',
])

export const SkillCapabilityTierSchema = z.enum([
  'metadata_only',
  'tool_backed',
  'runtime_extended',
])

export const SkillTrustTierSchema = z.enum([
  'lucid_first_party',
  'verified_partner',
  'community',
  'private_org',
])

export const SkillVariantSchema = z.object({
  engine: z.string(),
  support_level: SkillSupportLevelSchema,
  runtime_flavors: z.array(z.string()).optional(),
  channel_ownership: z.array(z.string()).optional(),
  required_tools: z.array(z.string()).optional(),
  required_servers: z.array(z.string()).optional(),
  overlay: z.record(z.string(), z.unknown()).optional(),
})
export type SkillVariant = z.infer<typeof SkillVariantSchema>

export const SkillArtifactManifestSchema = z.object({
  entry: z.string(),
  files: z.array(z.string()).optional(),
  checksum: z.string().optional(),
})

// =============================================================================
// SKILL CATALOG ENTRY (admin-managed, imported from OpenClaw SKILL.md files)
// =============================================================================

export const SkillCatalogEntrySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  raw_content: z.string(),
  sanitized_content: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  source: z.string(),
  source_path: z.string().nullable(),
  source_commit: z.string().nullable(),
  content_hash: z.string(),
  content_chars: z.number(),
  status: z.enum(['draft', 'approved', 'deprecated']),
  visibility: z.enum(['global', 'org_private']).optional(),
  owner_org_id: z.string().uuid().nullable().optional(),
  origin_mutation_candidate_id: z.string().uuid().nullable().optional(),
  import_warnings: z.array(z.record(z.string(), z.unknown())).nullable(),
  version: z.number().optional(),
  changelog: z.string().nullable().optional(),
  source_type: z.enum(['internal', 'mcpgate', 'imported']).optional(),
  source_skill_id: z.string().nullable().optional(),
  source_version: z.string().nullable().optional(),
  trust_tier: SkillTrustTierSchema.optional(),
  capability_tier: SkillCapabilityTierSchema.optional(),
  artifact_checksum: z.string().nullable().optional(),
  engine_support: z.array(SkillVariantSchema).nullable().optional(),
  artifact_manifest: SkillArtifactManifestSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type SkillCatalogEntry = z.infer<typeof SkillCatalogEntrySchema>

// =============================================================================
// ORG SKILL INSTALLATION
// =============================================================================

export const OrgSkillInstallationSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  installed_version: z.number().optional(),
  installed_content_hash: z.string().nullable().optional(),
  installed_source_version: z.string().nullable().optional(),
  installed_artifact_checksum: z.string().nullable().optional(),
  auto_update: z.boolean().optional(),
  installed_at: z.string(),
  installed_by: z.string().uuid().nullable(),
})

export type OrgSkillInstallation = z.infer<typeof OrgSkillInstallationSchema>

// =============================================================================
// ASSISTANT SKILL ACTIVATION
// =============================================================================

export const AssistantSkillActivationSchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  installation_id: z.string().uuid(),
  sort_order: z.number(),
  is_active: z.boolean(),
  activated_at: z.string(),
})

export type AssistantSkillActivation = z.infer<typeof AssistantSkillActivationSchema>

export const SkillInstallArtifactSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  skill_id: z.string().uuid(),
  installation_id: z.string().uuid().nullable(),
  source_variant_key: z.string(),
  local_path: z.string().nullable(),
  artifact_checksum: z.string().nullable(),
  warm_state: z.enum(['embedded', 'installed', 'remote_only']),
  installed_at: z.string(),
  updated_at: z.string(),
})

export type SkillInstallArtifact = z.infer<typeof SkillInstallArtifactSchema>
