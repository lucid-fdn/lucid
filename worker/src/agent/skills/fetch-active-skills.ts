import type { SupabaseClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/node'
import type { ActiveSkillRow } from './types.js'
import { getBuiltinSkills } from './builtin-skills.js'
import type { IntegrationPluginRef } from './integration-loader.js'
import {
  getEngineSkillAdapter,
  type CatalogSkillRecord,
  type EngineMountedSkills,
  type SkillExclusionSummary,
} from '../adapters/skills/index.js'
import { explainSkillSupportExclusion } from '../adapters/skills/resolve-skill-support.js'

// In-memory cache: skills are static text that rarely changes.
// Avoids a DB round-trip on every agent request (~200ms saved).
//
// Cache key includes the sorted list of installed integration slugs so that
// install/uninstall is reflected within the next call (no stale builtins).
const CACHE_TTL_MS = 60_000 // 60s
const skillCache = new Map<string, { rows: ActiveSkillRow[]; expiresAt: number }>()

interface ActiveSkillFetchResult {
  rows: ActiveSkillRow[]
  exclusionSummary: SkillExclusionSummary
}

interface AssistantSkillConfig {
  wallet_enabled?: boolean
  trading_enabled?: boolean
  disable_builtin_skills?: boolean
  engine?: string | null
  runtime_flavor?: string | null
  channel_ownership?: string | null
  plugins?: ReadonlyArray<IntegrationPluginRef>
}

function buildCacheKey(assistantId: string, config?: AssistantSkillConfig): string {
  const integrationKey = (config?.plugins ?? [])
    .filter((p) => p.kind === 'integration')
    .map((p) => p.slug)
    .sort()
    .join(',')
  // wallet/trading flags also affect builtin selection — include them
  const wallet = config?.wallet_enabled ? '1' : '0'
  const trading = config?.trading_enabled ? '1' : '0'
  const engine = config?.engine ?? 'openclaw'
  const runtimeFlavor = config?.runtime_flavor ?? 'shared'
  const channelOwnership = config?.channel_ownership ?? 'lucid_relay'
  return `${assistantId}|${wallet}${trading}|${engine}|${runtimeFlavor}|${channelOwnership}|${integrationKey}`
}

/**
 * Fetch skills for an assistant from two sources:
 *
 *   A. Built-in skills — shipped with the product, conditionally included (from code)
 *   B. Catalog skills — user-managed via 3-tier DB (catalog → org install → assistant activate)
 *
 * Results cached in-memory for 60s per (assistant, builtin-config) tuple.
 * On failure: returns built-in skills only.
 */
export async function fetchActiveSkills(
  supabase: SupabaseClient,
  assistantId: string,
  assistantConfig?: AssistantSkillConfig,
): Promise<ActiveSkillRow[]> {
  const result = await fetchActiveSkillsWithDiagnostics(supabase, assistantId, assistantConfig)
  return result.rows
}

async function fetchActiveSkillsWithDiagnostics(
  supabase: SupabaseClient,
  assistantId: string,
  assistantConfig?: AssistantSkillConfig,
): Promise<ActiveSkillFetchResult> {
  const builtin = getBuiltinSkills(assistantConfig)

  // Check cache
  const cacheKey = buildCacheKey(assistantId, assistantConfig)
  const cached = skillCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      rows: cached.rows,
      exclusionSummary: {
        excludedCount: 0,
        decisions: [],
      },
    }
  }

  try {
    const { data, error } = await supabase
      .from('assistant_skill_activations')
      .select(`
        sort_order,
        is_active,
        installation:org_skill_installations!inner(
          id,
          skill:skill_catalog!inner(
            slug,
            name,
            description,
            sanitized_content,
            frontmatter,
            content_chars,
            source_type,
            source_version,
            engine_support,
            status
          )
        )
      `)
      .eq('assistant_id', assistantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.warn(
        `[fetchActiveSkills] DB error for assistant ${assistantId}: ${error.message}`,
      )
      Sentry.captureMessage(`fetchActiveSkills DB error: ${error.message}`, {
        level: 'warning',
        tags: { component: 'skill-fetch', assistantId },
      })
      return {
        rows: builtin,
        exclusionSummary: {
          excludedCount: 0,
          decisions: [],
        },
      }
    }

    const adapter = getEngineSkillAdapter((assistantConfig?.engine as 'openclaw' | 'hermes' | undefined) ?? 'openclaw')
    const resolution = {
      engine: ((assistantConfig?.engine as 'openclaw' | 'hermes' | undefined) ?? 'openclaw'),
      runtimeFlavor: assistantConfig?.runtime_flavor ?? 'shared',
      channelOwnership: assistantConfig?.channel_ownership ?? 'lucid_relay',
    }

    const exclusionDecisions: SkillExclusionSummary['decisions'] = []
    const catalogSkills = ((data ?? []) as Array<{
      sort_order: number
      installation?: { skill?: CatalogSkillRecord | null } | null
    }>).flatMap((row) => {
      const skill = row.installation?.skill
      if (!skill) return []
      const resolved = adapter.selectCatalogSkill(skill, resolution, row.sort_order)
      if (!resolved) {
        const exclusion = explainSkillSupportExclusion(skill, resolution)
        if (exclusion) exclusionDecisions.push(exclusion)
      }
      return resolved ? [resolved] : []
    })

    // Merge: catalog skills first (user-managed), then built-in (dedup by slug)
    const seen = new Set(catalogSkills.map(r => r.skill_slug))
    const merged = [...catalogSkills]
    for (const row of builtin) {
      if (!seen.has(row.skill_slug)) {
        merged.push(row)
      }
    }

    skillCache.set(cacheKey, { rows: merged, expiresAt: Date.now() + CACHE_TTL_MS })
    return {
      rows: merged,
      exclusionSummary: {
        excludedCount: exclusionDecisions.length,
        decisions: exclusionDecisions,
      },
    }
  } catch (err) {
    console.warn(
      `[fetchActiveSkills] Unexpected error for assistant ${assistantId}:`,
      err instanceof Error ? err.message : err,
    )
    Sentry.captureException(err, {
      tags: { component: 'skill-fetch', assistantId },
    })
    return {
      rows: builtin,
      exclusionSummary: {
        excludedCount: 0,
        decisions: [],
      },
    }
  }
}

export async function fetchMountedSkills(
  supabase: SupabaseClient,
  assistantId: string,
  assistantConfig?: AssistantSkillConfig,
): Promise<EngineMountedSkills> {
  const { rows, exclusionSummary } = await fetchActiveSkillsWithDiagnostics(supabase, assistantId, assistantConfig)
  const adapter = getEngineSkillAdapter((assistantConfig?.engine as 'openclaw' | 'hermes' | undefined) ?? 'openclaw')
  const mounted = adapter.mountSkills(rows)
  return {
    ...mounted,
    exclusionSummary,
  }
}
