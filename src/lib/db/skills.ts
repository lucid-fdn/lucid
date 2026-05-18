/**
 * Skill Database Operations (Server-only)
 *
 * Catalog browsing, org installations, and assistant activations.
 * Mirrors the plugin DB layer pattern (plugins.ts).
 */

import 'server-only'
import { createHash } from 'node:crypto'
import { supabase, ErrorService } from './client'
import yaml from 'js-yaml'
import { withRetry } from '@/lib/errors/error-service'
import type {
  SkillCatalogEntry,
  OrgSkillInstallation,
  AssistantSkillActivation,
  SkillInstallArtifact,
} from '../../../contracts/skill'
import { enumerateSkillVariantKeys, type ResolvedSkillSupport } from '../../../contracts/skill-resolution'
import type { SkillPackage } from '@/lib/skills/package'
import {
  scanSkillForPromptInjection,
  sanitizeSkillContent,
  validateSkillFrontmatter,
} from '@/lib/skills/sanitize'

function isTransientFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('fetch failed')
    || message.includes('networkerror')
    || message.includes('timeout')
    || message.includes('aborted')
  )
}

async function withTransientSupabaseRetry<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return withRetry(async () => await fn(), {
    maxRetries: 2,
    delay: 250,
    backoff: 2,
    context: { subsystem: 'skills_optional_reads' },
  })
}

const SKILL_CATALOG_SELECT =
  'id, slug, name, description, raw_content, sanitized_content, frontmatter, source, source_path, source_commit, content_hash, content_chars, status, visibility, owner_org_id, origin_mutation_candidate_id, import_warnings, version, changelog, source_type, source_skill_id, source_version, trust_tier, capability_tier, artifact_checksum, engine_support, artifact_manifest, created_at, updated_at' as const

const SKILL_INSTALL_ARTIFACT_SELECT =
  'id, org_id, skill_id, installation_id, source_variant_key, local_path, artifact_checksum, warm_state, installed_at, updated_at' as const

// =============================================================================
// CATALOG (user-facing — approved only)
// =============================================================================

export async function getSkillCatalog(orgId?: string): Promise<SkillCatalogEntry[]> {
  try {
    const { data, error } = await withTransientSupabaseRetry(async () => {
      let query = supabase
        .from('skill_catalog')
        .select(SKILL_CATALOG_SELECT)
        .eq('status', 'approved')
        .order('name')

      if (orgId) {
        query = query.or(`visibility.eq.global,and(visibility.eq.org_private,owner_org_id.eq.${orgId})`)
      } else {
        query = query.eq('visibility', 'global')
      }

      return await query
    })

    if (error) throw error
    return (data ?? []) as SkillCatalogEntry[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: isTransientFetchFailure(error) ? 'warning' : 'error',
      context: { operation: 'SELECT', table: 'skill_catalog' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return []
  }
}

export async function getSkillBySlug(slug: string, orgId?: string): Promise<SkillCatalogEntry | null> {
  try {
    const { data, error } = await withTransientSupabaseRetry(async () => {
      let query = supabase
        .from('skill_catalog')
        .select(SKILL_CATALOG_SELECT)
        .eq('slug', slug)
        .eq('status', 'approved')

      if (orgId) {
        query = query.or(`visibility.eq.global,and(visibility.eq.org_private,owner_org_id.eq.${orgId})`)
      } else {
        query = query.eq('visibility', 'global')
      }

      return await query.single()
    })

    if (error) throw error
    return data as SkillCatalogEntry
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: isTransientFetchFailure(error) ? 'warning' : 'error',
      context: { operation: 'SELECT', table: 'skill_catalog' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return null
  }
}

export async function getSkillById(skillId: string, orgId?: string): Promise<SkillCatalogEntry | null> {
  try {
    const { data, error } = await withTransientSupabaseRetry(async () => {
      let query = supabase
        .from('skill_catalog')
        .select(SKILL_CATALOG_SELECT)
        .eq('id', skillId)
        .eq('status', 'approved')

      if (orgId) {
        query = query.or(`visibility.eq.global,and(visibility.eq.org_private,owner_org_id.eq.${orgId})`)
      } else {
        query = query.eq('visibility', 'global')
      }

      return await query.single()
    })

    if (error) throw error
    return data as SkillCatalogEntry
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: isTransientFetchFailure(error) ? 'warning' : 'error',
      context: { operation: 'SELECT', table: 'skill_catalog' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return null
  }
}

interface NativeSkillPromotionCandidate {
  id: string
  agent_id: string
  org_id: string
  engine: string
  mutation_kind: 'skill_create' | 'skill_update' | 'skill_delete'
  tool_args: Record<string, unknown>
}

interface PromoteNativeSkillCandidateInput {
  candidate: NativeSkillPromotionCandidate
  reviewerId: string
  promotionScope: 'assistant_durable' | 'org_durable'
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseSkillMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }

  try {
    const parsed = yaml.load(match[1])
    return {
      frontmatter: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {},
      body: match[2],
    }
  } catch {
    return { frontmatter: {}, body: raw }
  }
}

function extractRequiredTools(markdown: string): string[] {
  const tools = new Set<string>()
  for (const match of markdown.matchAll(/`([a-z][a-z0-9_]+)`/g)) {
    tools.add(match[1])
  }
  return Array.from(tools).sort()
}

function buildPrivateNativeSkillSlug(orgId: string, requestedSlug: string): string {
  const baseSlug = slugify(requestedSlug) || 'native-skill'
  return `org-${orgId.slice(0, 8)}-${baseSlug}`
}

async function getOrgPrivateSkillBySlug(orgId: string, slug: string): Promise<SkillCatalogEntry | null> {
  const { data, error } = await supabase
    .from('skill_catalog')
    .select(SKILL_CATALOG_SELECT)
    .eq('slug', slug)
    .eq('owner_org_id', orgId)
    .eq('visibility', 'org_private')
    .maybeSingle()

  if (error) throw error
  return (data as SkillCatalogEntry | null) ?? null
}

/**
 * Idempotent install — ensures a skill is installed for the org and returns
 * the installation ID. Safe to call on every template deploy.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING to avoid TOCTOU races: if two
 * concurrent deploys both try to install the same skill, exactly one insert
 * wins and both callers resolve to the same installation ID.
 */
export async function ensureSkillInstallation(
  orgId: string,
  skillId: string,
  userId: string,
): Promise<string | null> {
  // Attempt insert; ignore if the (org_id, skill_id) pair already exists.
  const { data: skill } = await supabase
    .from('skill_catalog')
    .select('version, content_hash, source_version, artifact_checksum')
    .eq('id', skillId)
    .single()

  const { data: inserted } = await supabase
    .from('org_skill_installations')
    .upsert(
      {
        org_id: orgId,
        skill_id: skillId,
        installed_by: userId,
        installed_version: skill?.version ?? 1,
        installed_content_hash: skill?.content_hash ?? null,
        installed_source_version: (skill as { source_version?: string | null } | null)?.source_version ?? null,
        installed_artifact_checksum: (skill as { artifact_checksum?: string | null } | null)?.artifact_checksum ?? null,
      },
      { onConflict: 'org_id,skill_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()

  if (inserted?.id) return inserted.id as string

  // Row already existed — fetch it.
  const { data: existing, error } = await supabase
    .from('org_skill_installations')
    .select('id')
    .eq('org_id', orgId)
    .eq('skill_id', skillId)
    .single()

  if (error) throw error
  return existing?.id ?? null
}

/**
 * Idempotent activation — ensures a skill installation is active for the
 * assistant and returns the activation ID. Safe to call on re-deploys:
 * re-activates a previously deactivated skill and preserves sort order.
 *
 * Uses upsert on (assistant_id, installation_id) — race-safe, no
 * read-then-insert TOCTOU window.
 */
export async function ensureSkillActivation(
  assistantId: string,
  installationId: string,
  sortOrder?: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('assistant_skill_activations')
    .upsert(
      {
        assistant_id: assistantId,
        installation_id: installationId,
        // Only include sort_order on a fresh insert. On conflict we only
        // flip is_active — preserving the user-configured order on re-deploys.
        ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
        is_active: true,
      },
      { onConflict: 'assistant_id,installation_id' },
    )
    .select('id')
    .single()

  if (error) throw error
  return data?.id ?? null
}

function buildNativeSkillVariants(engine: string, markdown: string): ResolvedSkillSupport[] {
  return [{
    engine,
    support_level: 'native',
    runtime_flavors: ['c1_managed', 'c2a_autonomous'],
    channel_ownership: ['lucid_relay', 'runtime_native'],
    required_tools: extractRequiredTools(markdown),
  }]
}

export async function promoteNativeSkillCandidate({
  candidate,
  reviewerId,
  promotionScope,
}: PromoteNativeSkillCandidateInput): Promise<{ skillId: string | null; installationId: string | null; activationId: string | null }> {
  const requestedSlug = typeof candidate.tool_args.slug === 'string' ? candidate.tool_args.slug.trim() : ''
  const scopedSlug = buildPrivateNativeSkillSlug(candidate.org_id, requestedSlug)

  if (!requestedSlug) {
    throw new Error('Native skill mutation candidate is missing a skill slug.')
  }

  if (candidate.mutation_kind === 'skill_delete') {
    const existing = await getOrgPrivateSkillBySlug(candidate.org_id, scopedSlug)
    if (!existing) {
      return { skillId: null, installationId: null, activationId: null }
    }

    const { error: deprecateError } = await supabase
      .from('skill_catalog')
      .update({
        status: 'deprecated',
        origin_mutation_candidate_id: candidate.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (deprecateError) throw deprecateError

    await uninstallSkill(candidate.org_id, existing.id)
    return { skillId: existing.id, installationId: null, activationId: null }
  }

  const rawContent = typeof candidate.tool_args.content === 'string' ? candidate.tool_args.content : ''
  if (!rawContent.trim()) {
    throw new Error('Native skill mutation candidate is missing skill content.')
  }

  const sanitized = sanitizeSkillContent(rawContent)
  const { frontmatter } = parseSkillMarkdown(sanitized)
  const normalizedFrontmatter: Record<string, unknown> = {
    ...frontmatter,
    slug: requestedSlug,
    name: typeof frontmatter.name === 'string' && frontmatter.name.trim() ? frontmatter.name.trim() : titleCaseSlug(slugify(requestedSlug) || 'native-skill'),
    description: typeof frontmatter.description === 'string' && frontmatter.description.trim()
      ? frontmatter.description.trim()
      : `Promoted ${candidate.engine} native skill`,
    category: typeof frontmatter.category === 'string' && frontmatter.category.trim() ? frontmatter.category.trim() : 'runtime',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : ['native', candidate.engine, 'promoted'],
    native_origin_slug: requestedSlug,
  }

  const validation = validateSkillFrontmatter(normalizedFrontmatter)
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid skill frontmatter')
  }

  const injectionWarnings = scanSkillForPromptInjection(sanitized)
  const importWarnings = [...validation.warnings, ...injectionWarnings]
  const contentHash = createHash('sha256').update(sanitized).digest('hex')
  const variants = buildNativeSkillVariants(candidate.engine, sanitized)
  const existing = await getOrgPrivateSkillBySlug(candidate.org_id, scopedSlug)

  const upsertRow = {
    slug: scopedSlug,
    name: String(normalizedFrontmatter.name),
    description: String(normalizedFrontmatter.description),
    raw_content: rawContent,
    sanitized_content: sanitized,
    frontmatter: normalizedFrontmatter,
    source: `${candidate.engine}_native`,
    source_type: 'imported',
    source_skill_id: `native:${candidate.org_id}:${requestedSlug}`,
    source_version: String((existing?.version ?? 0) + 1),
    content_hash: contentHash,
    content_chars: sanitized.length,
    status: 'approved',
    visibility: 'org_private',
    owner_org_id: candidate.org_id,
    origin_mutation_candidate_id: candidate.id,
    import_warnings: importWarnings.length > 0 ? importWarnings : null,
    trust_tier: 'private_org',
    capability_tier: 'runtime_extended',
    artifact_checksum: contentHash,
    engine_support: variants,
    artifact_manifest: null,
    version: (existing?.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }

  const { data: saved, error: saveError } = await supabase
    .from('skill_catalog')
    .upsert(upsertRow, { onConflict: 'slug' })
    .select('id, source_type, engine_support')
    .single()

  if (saveError) throw saveError

  const skillId = saved.id as string
  const installationId = await ensureSkillInstallation(candidate.org_id, skillId, reviewerId)
  if (!installationId) {
    throw new Error('Failed to install promoted native skill for the org.')
  }

  const variantKeys = enumerateSkillVariantKeys({
    source_type: (saved.source_type as SkillCatalogEntry['source_type']) ?? 'imported',
    engine_support: (saved.engine_support as SkillCatalogEntry['engine_support']) ?? null,
  })

  await Promise.all(variantKeys.map((variantKey) => upsertSkillInstallArtifact({
    orgId: candidate.org_id,
    skillId,
    installationId,
    sourceVariantKey: variantKey,
    localPath: null,
    artifactChecksum: contentHash,
    warmState: 'remote_only',
  })))

  const activationId = promotionScope === 'assistant_durable'
    ? await ensureSkillActivation(candidate.agent_id, installationId)
    : null

  return { skillId, installationId, activationId }
}

// =============================================================================
// CATALOG (admin — all statuses)
// =============================================================================

export async function getSkillCatalogAdmin(
  status?: 'draft' | 'approved' | 'deprecated',
  visibility?: 'global' | 'org_private',
): Promise<SkillCatalogEntry[]> {
  try {
    let query = supabase
      .from('skill_catalog')
      .select(SKILL_CATALOG_SELECT)
      .order('status')
      .order('name')

    if (status) {
      query = query.eq('status', status)
    }

    if (visibility) {
      query = query.eq('visibility', visibility)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as SkillCatalogEntry[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'skill_catalog', admin: true },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return []
  }
}

async function ensureUniqueGlobalSkillSlug(baseSlug: string, excludeSkillId?: string): Promise<string> {
  let attempt = 0
  let candidateSlug = baseSlug

  while (attempt < 20) {
    let query = supabase
      .from('skill_catalog')
      .select('id')
      .eq('slug', candidateSlug)
      .eq('visibility', 'global')

    if (excludeSkillId) query = query.filter('id', 'neq', excludeSkillId)

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data?.id) return candidateSlug

    attempt += 1
    candidateSlug = `${baseSlug}-${attempt + 1}`
  }

  throw new Error('Unable to allocate a unique global skill slug.')
}

async function getExistingPublishedDraftForPrivateSkill(
  privateSkill: SkillCatalogEntry,
): Promise<{ id: string } | null> {
  let query = supabase
    .from('skill_catalog')
    .select('id')
    .eq('visibility', 'global')
    .eq('status', 'draft')
 
  if (privateSkill.origin_mutation_candidate_id) {
    query = query.eq('origin_mutation_candidate_id', privateSkill.origin_mutation_candidate_id)
  } else {
    query = query.eq('source_skill_id', privateSkill.source_skill_id ?? privateSkill.id)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return (data as { id: string } | null) ?? null
}

export async function publishPrivateSkillToCatalog(params: {
  skillId: string
  slug?: string
  name?: string
  description?: string | null
}): Promise<{ id: string } | null> {
  try {
    const { data: source, error: sourceError } = await supabase
      .from('skill_catalog')
      .select(SKILL_CATALOG_SELECT)
      .eq('id', params.skillId)
      .eq('visibility', 'org_private')
      .single()

    if (sourceError) throw sourceError

    const privateSkill = source as SkillCatalogEntry
    const requestedSlug = params.slug?.trim() || slugify(privateSkill.slug.replace(/^org-[a-f0-9]{8}-/, ''))
    const nextName = params.name?.trim() || privateSkill.name
    const nextDescription = params.description ?? privateSkill.description
    const nextFrontmatter = {
      ...(privateSkill.frontmatter ?? {}),
      name: nextName,
      description: nextDescription,
      published_from_private_skill_id: privateSkill.id,
      published_from_org_id: privateSkill.owner_org_id ?? null,
    }
    const existingDraft = await getExistingPublishedDraftForPrivateSkill(privateSkill)
    const maxAttempts = 5

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const globalSlug = await ensureUniqueGlobalSkillSlug(requestedSlug, existingDraft?.id)
      const row = {
        slug: globalSlug,
        name: nextName,
        description: nextDescription,
        raw_content: privateSkill.raw_content,
        sanitized_content: privateSkill.sanitized_content,
        frontmatter: nextFrontmatter,
        source: privateSkill.source,
        source_path: privateSkill.source_path ?? null,
        source_commit: privateSkill.source_commit ?? null,
        content_hash: privateSkill.content_hash,
        content_chars: privateSkill.content_chars,
        status: 'draft' as const,
        visibility: 'global' as const,
        owner_org_id: null,
        origin_mutation_candidate_id: privateSkill.origin_mutation_candidate_id ?? null,
        import_warnings: privateSkill.import_warnings ?? null,
        version: privateSkill.version ?? 1,
        changelog: privateSkill.changelog ?? null,
        source_type: privateSkill.source_type ?? 'imported',
        source_skill_id: privateSkill.source_skill_id ?? privateSkill.id,
        source_version: privateSkill.source_version ?? null,
        trust_tier: privateSkill.trust_tier ?? 'community',
        capability_tier: privateSkill.capability_tier ?? 'runtime_extended',
        artifact_checksum: privateSkill.artifact_checksum ?? privateSkill.content_hash,
        engine_support: privateSkill.engine_support ?? null,
        artifact_manifest: privateSkill.artifact_manifest ?? null,
        updated_at: new Date().toISOString(),
      }

      const mutation = existingDraft
        ? supabase
            .from('skill_catalog')
            .update(row)
            .eq('id', existingDraft.id)
            .select('id')
            .single()
        : supabase
            .from('skill_catalog')
            .insert(row)
            .select('id')
            .single()

      const { data: saved, error: saveError } = await mutation

      if (!saveError) {
        return (saved as { id: string } | null) ?? null
      }

      if (saveError && saveError.code === '23505' && attempt < maxAttempts - 1) {
        continue
      }

      throw saveError
    }

    throw new Error('Failed to publish private skill to catalog after retrying slug allocation.')
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'skill_catalog', action: 'publish_private_skill_to_catalog' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return null
  }
}

export async function approveSkill(skillId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('skill_catalog')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', skillId)

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'skill_catalog', action: 'approve' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return false
  }
}

export async function rejectSkill(skillId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('skill_catalog')
      .update({ status: 'deprecated', updated_at: new Date().toISOString() })
      .eq('id', skillId)

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'skill_catalog', action: 'reject' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return false
  }
}

// =============================================================================
// ORG INSTALLATIONS
// =============================================================================

export async function getOrgSkills(orgId: string): Promise<(OrgSkillInstallation & { skill: SkillCatalogEntry })[]> {
  try {
    const { data, error } = await withTransientSupabaseRetry(async () =>
      await supabase
        .from('org_skill_installations')
        .select('*, skill:skill_catalog(*)')
        .eq('org_id', orgId)
        .order('installed_at', { ascending: false }),
    )

    if (error) throw error
    return (data ?? []) as (OrgSkillInstallation & { skill: SkillCatalogEntry })[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: isTransientFetchFailure(error) ? 'warning' : 'error',
      context: { operation: 'SELECT', table: 'org_skill_installations' },
      tags: { layer: 'database', table: 'org_skill_installations' },
    })
    return []
  }
}

export async function installSkill(
  orgId: string,
  skillId: string,
  userId: string,
): Promise<{ id: string } | null> {
  try {
    // Fetch current catalog version to snapshot at install time
    const { data: skill } = await supabase
      .from('skill_catalog')
      .select('version, content_hash, source_version, artifact_checksum')
      .eq('id', skillId)
      .single()

    const { data, error } = await supabase
      .from('org_skill_installations')
      .insert({
        org_id: orgId,
        skill_id: skillId,
        installed_by: userId,
        installed_version: skill?.version ?? 1,
        installed_content_hash: skill?.content_hash ?? null,
        installed_source_version: (skill as { source_version?: string | null } | null)?.source_version ?? null,
        installed_artifact_checksum: (skill as { artifact_checksum?: string | null } | null)?.artifact_checksum ?? null,
      })
      .select('id')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'org_skill_installations' },
      tags: { layer: 'database', table: 'org_skill_installations' },
    })
    return null
  }
}

export async function upsertMirroredSkills(
  skills: SkillPackage[],
  sourcePath = 'mcpgate',
): Promise<number> {
  if (skills.length === 0) return 0

  try {
    const rows = skills.flatMap((skill) => {
      const sanitized = sanitizeSkillContent(skill.skill_markdown)
      const frontmatter = {
        name: skill.name,
        description: skill.description ?? '',
        category: skill.category,
        tags: skill.tags,
      }
      const validation = validateSkillFrontmatter(frontmatter)
      const injectionWarnings = scanSkillForPromptInjection(sanitized)
      const warnings = [...validation.warnings, ...injectionWarnings]
      if (!validation.valid) return []

      const approvedByDefault = skill.trust_tier === 'lucid_first_party' || skill.trust_tier === 'verified_partner'

      return [{
        slug: skill.slug,
        name: skill.name,
        description: skill.description ?? null,
        raw_content: skill.skill_markdown,
        sanitized_content: sanitized,
        frontmatter,
        source: sourcePath,
        source_type: 'mcpgate',
        source_skill_id: skill.id,
        source_version: skill.version,
        content_hash: skill.artifact_manifest?.checksum ?? `${skill.id}:${skill.version}`,
        content_chars: sanitized.length,
        status: approvedByDefault ? 'approved' : 'draft',
        import_warnings: warnings.length > 0 ? warnings : null,
        trust_tier: skill.trust_tier,
        capability_tier: skill.capability_tier,
        artifact_checksum: skill.artifact_manifest?.checksum ?? null,
        engine_support: skill.variants,
        artifact_manifest: skill.artifact_manifest ?? null,
        updated_at: new Date().toISOString(),
      }]
    })

    if (rows.length === 0) return 0

    const { error } = await supabase
      .from('skill_catalog')
      .upsert(rows, { onConflict: 'slug' })

    if (error) throw error

    const mirroredIds = new Set(skills.map((skill) => skill.id))
    const { data: existingMcpgate, error: existingError } = await supabase
      .from('skill_catalog')
      .select('id, source_skill_id')
      .eq('source_type', 'mcpgate')

    if (existingError) throw existingError

    const staleIds = (existingMcpgate ?? [])
      .filter((row) => typeof row.source_skill_id === 'string' && !mirroredIds.has(row.source_skill_id))
      .map((row) => row.id as string)

    if (staleIds.length > 0) {
      const { error: staleError } = await supabase
        .from('skill_catalog')
        .update({ status: 'deprecated', updated_at: new Date().toISOString() })
        .in('id', staleIds)

      if (staleError) throw staleError
    }

    return rows.length
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPSERT', table: 'skill_catalog', action: 'mirror_mcpgate_skills' },
      tags: { layer: 'database', table: 'skill_catalog' },
    })
    return 0
  }
}

export async function getSkillInstallArtifacts(
  orgId: string,
): Promise<SkillInstallArtifact[]> {
  try {
    const { data, error } = await withTransientSupabaseRetry(async () =>
      await supabase
        .from('skill_install_artifacts')
        .select(SKILL_INSTALL_ARTIFACT_SELECT)
        .eq('org_id', orgId),
    )

    if (error) throw error
    return (data ?? []) as SkillInstallArtifact[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: isTransientFetchFailure(error) ? 'warning' : 'error',
      context: { operation: 'SELECT', table: 'skill_install_artifacts' },
      tags: { layer: 'database', table: 'skill_install_artifacts' },
    })
    return []
  }
}

export async function upsertSkillInstallArtifact(params: {
  orgId: string
  skillId: string
  installationId?: string | null
  sourceVariantKey: string
  localPath?: string | null
  artifactChecksum?: string | null
  warmState: 'embedded' | 'installed' | 'remote_only'
}): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('skill_install_artifacts')
      .upsert({
        org_id: params.orgId,
        skill_id: params.skillId,
        installation_id: params.installationId ?? null,
        source_variant_key: params.sourceVariantKey,
        local_path: params.localPath ?? null,
        artifact_checksum: params.artifactChecksum ?? null,
        warm_state: params.warmState,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,skill_id,source_variant_key' })

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPSERT', table: 'skill_install_artifacts' },
      tags: { layer: 'database', table: 'skill_install_artifacts' },
    })
    return false
  }
}

export async function uninstallSkill(orgId: string, skillId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('org_skill_installations')
      .delete()
      .eq('org_id', orgId)
      .eq('skill_id', skillId)

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'DELETE', table: 'org_skill_installations' },
      tags: { layer: 'database', table: 'org_skill_installations' },
    })
    return false
  }
}

// =============================================================================
// ASSISTANT ACTIVATIONS
// =============================================================================

export async function getAssistantSkills(
  assistantId: string,
): Promise<(AssistantSkillActivation & { installation: OrgSkillInstallation & { skill: SkillCatalogEntry } })[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_skill_activations')
      .select('*, installation:org_skill_installations(*, skill:skill_catalog(*))')
      .eq('assistant_id', assistantId)
      .order('sort_order')

    if (error) throw error
    return (data ?? []) as (AssistantSkillActivation & { installation: OrgSkillInstallation & { skill: SkillCatalogEntry } })[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'assistant_skill_activations' },
      tags: { layer: 'database', table: 'assistant_skill_activations' },
    })
    return []
  }
}

export async function activateSkill(
  assistantId: string,
  installationId: string,
  sortOrder?: number,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('assistant_skill_activations')
      .insert({
        assistant_id: assistantId,
        installation_id: installationId,
        sort_order: sortOrder ?? 0,
        is_active: true,
      })
      .select('id')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'assistant_skill_activations' },
      tags: { layer: 'database', table: 'assistant_skill_activations' },
    })
    return null
  }
}

export async function deactivateSkill(
  assistantId: string,
  activationId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('assistant_skill_activations')
      .delete()
      .eq('id', activationId)
      .eq('assistant_id', assistantId)

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'DELETE', table: 'assistant_skill_activations' },
      tags: { layer: 'database', table: 'assistant_skill_activations' },
    })
    return false
  }
}

// =============================================================================
// UPDATE DETECTION & PROPAGATION
// =============================================================================

export interface SkillUpdateAvailable {
  installation_id: string
  skill_slug: string
  skill_name: string
  installed_version: number
  catalog_version: number
  changelog: string | null
}

export async function checkSkillUpdates(orgId: string): Promise<SkillUpdateAvailable[]> {
  try {
    const { data, error } = await supabase.rpc('check_skill_updates', { p_org_id: orgId })
    if (error) throw error
    return (data ?? []) as SkillUpdateAvailable[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'RPC', function: 'check_skill_updates' },
      tags: { layer: 'database', table: 'org_skill_installations' },
    })
    return []
  }
}

export async function applySkillUpdate(installationId: string, orgId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('apply_skill_update', {
      p_installation_id: installationId,
      p_org_id: orgId,
    })
    if (error) throw error
    return data === true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'RPC', function: 'apply_skill_update' },
      tags: { layer: 'database', table: 'org_skill_installations' },
    })
    return false
  }
}

export async function applyAllSkillUpdates(orgId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('apply_all_skill_updates', { p_org_id: orgId })
    if (error) throw error
    return (data as number) ?? 0
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'RPC', function: 'apply_all_skill_updates' },
      tags: { layer: 'database', table: 'org_skill_installations' },
    })
    return 0
  }
}

// =============================================================================
// ASSISTANT ACTIVATIONS (continued)
// =============================================================================

export async function updateSkillOrder(
  activationId: string,
  sortOrder: number,
  assistantId?: string,
): Promise<boolean> {
  try {
    let query = supabase
      .from('assistant_skill_activations')
      .update({ sort_order: sortOrder })
      .eq('id', activationId)
    if (assistantId) query = query.eq('assistant_id', assistantId)
    const { error } = await query

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'assistant_skill_activations' },
      tags: { layer: 'database', table: 'assistant_skill_activations' },
    })
    return false
  }
}
