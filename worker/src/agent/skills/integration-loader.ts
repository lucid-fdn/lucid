/**
 * Integration skill loader.
 *
 * Reads SKILL.md files from worker/src/agent/skills/integrations/<provider>/
 * at module init time (synchronous, ~microseconds). Result is cached for the
 * lifetime of the process as an immutable Map<provider, IntegrationSkill>.
 *
 * At runtime, callers select only the entries that correspond to integrations
 * the assistant actually has installed — keeping the agent's system prompt
 * lean (no provider guidance the agent can't act on).
 *
 * Adding a new integration:
 *   1. mkdir integrations/<provider>/
 *   2. Write integrations/<provider>/SKILL.md
 *   3. If the plugin slug differs from the folder name (or one plugin bundles
 *      multiple folders, e.g. google), update PLUGIN_FOLDER_OVERRIDES below.
 *   Done — the loader picks it up automatically on next deploy.
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INTEGRATIONS_DIR = join(__dirname, 'integrations')

/** Single integration's prompt guidance, loaded once at startup. */
export interface IntegrationSkill {
  /** Folder name — also the canonical Nango provider key in the default case. */
  provider: string
  /** Sanitized markdown content (already trimmed). */
  content: string
  /** Byte length of `content` — used for budget tracking. */
  bytes: number
}

/** Minimal shape of an installed plugin used to resolve which folders to load. */
export interface IntegrationPluginRef {
  slug: string
  kind: 'plugin' | 'integration'
  authProvider?: string | null
}

/**
 * Plugins whose installable slug does not match (or does not 1:1 match) a
 * single integration folder. Most providers are 1:1 — only list exceptions.
 *
 * Source of truth lives next to the loader so adding a new integration is a
 * one-file change.
 */
const PLUGIN_FOLDER_OVERRIDES: Record<string, readonly string[]> = {
  // Google plugin bundles every Google product under one OAuth — load all of them
  google: ['gmail', 'google-calendar', 'google-drive', 'google-sheets', 'google-workspace'],
  // X (Twitter) plugin folder is `x-twitter`
  twitter: ['x-twitter'],
  'twitter-v2': ['x-twitter'],
  // Amazon SES plugin
  amazon: ['amazon-ses'],
}

function loadIntegrationMap(): ReadonlyMap<string, IntegrationSkill> {
  const map = new Map<string, IntegrationSkill>()
  if (!existsSync(INTEGRATIONS_DIR)) {
    return map
  }
  try {
    const entries = readdirSync(INTEGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const skillPath = join(INTEGRATIONS_DIR, entry.name, 'SKILL.md')
      if (!existsSync(skillPath)) continue
      const content = readFileSync(skillPath, 'utf8').trim()
      if (!content) continue
      map.set(entry.name, {
        provider: entry.name,
        content,
        bytes: Buffer.byteLength(content, 'utf8'),
      })
    }
  } catch (err) {
    // Non-fatal — integration skills are prompt guidance, not execution.
    // Missing or unreadable bundles should not produce noisy boot warnings.
    if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
      process.stderr.write(`[integration-loader] Failed to load integration skills: ${err}\n`)
    }
  }
  return map
}

/** Frozen map of all known integration skills. Loaded once at module init. */
export const INTEGRATION_SKILLS: ReadonlyMap<string, IntegrationSkill> = loadIntegrationMap()

/**
 * Resolve a single plugin to the integration folder(s) it should load skill
 * guidance from. Most plugins map 1:1 to a folder named after their provider
 * key — handful of overrides above for the rest.
 *
 * Resolution order:
 *   1. PLUGIN_FOLDER_OVERRIDES[slug]
 *   2. PLUGIN_FOLDER_OVERRIDES[authProvider]
 *   3. authProvider (1:1, if folder exists)
 *   4. slug stripped of legacy `nango-` prefix (1:1, if folder exists)
 *   5. raw slug (1:1, if folder exists)
 *
 * Returns an empty array when nothing matches — never throws.
 */
export function resolveIntegrationFolders(plugin: IntegrationPluginRef): string[] {
  const candidates: string[] = []
  const provider = plugin.authProvider ?? null
  const cleanSlug = plugin.slug.replace(/^nango-/, '')

  if (PLUGIN_FOLDER_OVERRIDES[plugin.slug]) {
    candidates.push(...PLUGIN_FOLDER_OVERRIDES[plugin.slug])
  } else if (provider && PLUGIN_FOLDER_OVERRIDES[provider]) {
    candidates.push(...PLUGIN_FOLDER_OVERRIDES[provider])
  } else {
    if (provider) candidates.push(provider)
    if (cleanSlug !== provider) candidates.push(cleanSlug)
    if (plugin.slug !== cleanSlug) candidates.push(plugin.slug)
  }

  // Filter to folders that actually exist on disk and dedupe while keeping order.
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of candidates) {
    if (seen.has(c)) continue
    seen.add(c)
    if (INTEGRATION_SKILLS.has(c)) out.push(c)
  }
  return out
}

/**
 * Select integration skills for the set of installed plugins.
 *
 * Filters to `kind === 'integration'`, dedupes folders across plugins,
 * and returns them sorted alphabetically (stable order = stable provider
 * cache prefix in the system prompt).
 */
export function selectIntegrationSkills(
  plugins: ReadonlyArray<IntegrationPluginRef>,
): IntegrationSkill[] {
  const folders = new Set<string>()
  for (const p of plugins) {
    if (p.kind !== 'integration') continue
    for (const f of resolveIntegrationFolders(p)) folders.add(f)
  }
  const skills: IntegrationSkill[] = []
  for (const folder of [...folders].sort()) {
    const skill = INTEGRATION_SKILLS.get(folder)
    if (skill) skills.push(skill)
  }
  return skills
}

/**
 * Concatenated markdown content of integration skills for the installed
 * plugins. Returns an empty string when no integrations are installed
 * (caller should drop the skill row entirely in that case).
 */
export function buildInstalledIntegrationContent(
  plugins: ReadonlyArray<IntegrationPluginRef>,
): string {
  const selected = selectIntegrationSkills(plugins)
  if (selected.length === 0) return ''
  return selected.map((s) => s.content).join('\n\n')
}

/**
 * All integration content concatenated, regardless of installed plugins.
 *
 * Used by content/coverage tests that verify every per-provider SKILL.md
 * file is present and well-formed. NOT used at runtime — agents only see
 * the filtered subset returned by `buildInstalledIntegrationContent`.
 */
export function getAllIntegrationContent(): string {
  return [...INTEGRATION_SKILLS.values()]
    .sort((a, b) => a.provider.localeCompare(b.provider))
    .map((s) => s.content)
    .join('\n\n')
}
