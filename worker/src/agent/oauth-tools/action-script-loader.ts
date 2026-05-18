/**
 * Action Script Loader
 *
 * Loads and caches compiled Nango action scripts (.cjs files).
 * These are Nango's build output — each exports `{ default: { exec(nango, input) } }`.
 *
 * Uses createRequire() to load CJS modules from an ESM context.
 */

import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { getConfig } from '../../config.js'
import { resolveLocalActionName } from './action-aliases.js'

interface ActionScript {
  exec: (nango: unknown, input: unknown) => Promise<unknown>
}

const cache = new Map<string, ActionScript | null>()

/**
 * Build the filename for a Nango action script.
 * Convention: `{providerConfigKey}_actions_{actionName}.cjs`
 */
function candidateScriptDirs(): string[] {
  const configuredDir = resolve(getConfig().NANGO_ACTIONS_DIR)
  const bundledDir = resolve(import.meta.dirname, '../../../nango-actions')
  const appBundledDir = '/app/nango-actions'
  return [...new Set([configuredDir, bundledDir, appBundledDir])]
}

function buildScriptPaths(integrationId: string, actionName: string): string[] {
  const fileName = `${integrationId}_actions_${actionName}.cjs`
  return candidateScriptDirs().map((dir) => (dir === '/app/nango-actions' ? `${dir}/${fileName}` : join(dir, fileName)))
}

/**
 * Load a compiled action script. Returns the script object or null if not found.
 * Results are cached — use clearActionScriptCache() for hot-reload.
 */
export function loadActionScript(integrationId: string, actionName: string): ActionScript | null {
  const key = `${integrationId}:${actionName}`

  if (cache.has(key)) return cache.get(key)!

  const candidatePaths = buildScriptPaths(integrationId, actionName)
  const localActionName = resolveLocalActionName(integrationId, actionName)
  if (localActionName !== actionName) {
    candidatePaths.push(...buildScriptPaths(integrationId, localActionName))
  }

  const scriptPath = candidatePaths.find((path) => existsSync(path))

  if (!scriptPath) {
    console.warn(
      `[action-loader] Missing script for ${integrationId}:${actionName}; checked ${candidatePaths.join(', ')}`,
    )
    cache.set(key, null)
    return null
  }

  try {
    const require = createRequire(import.meta.url)
    const mod = require(scriptPath)
    const script: ActionScript = mod.default || mod
    if (typeof script.exec !== 'function') {
      console.warn(`[action-loader] Script ${scriptPath} missing exec() function`)
      cache.set(key, null)
      return null
    }
    cache.set(key, script)
    return script
  } catch (err) {
    console.error(`[action-loader] Failed to load ${scriptPath}:`, err)
    cache.set(key, null)
    return null
  }
}

/** Clear the script cache (for hot-reload in dev). */
export function clearActionScriptCache(): void {
  cache.clear()
}
