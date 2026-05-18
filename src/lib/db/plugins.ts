/**
 * Plugin Database Operations (Server-only)
 *
 * Catalog browsing, org installations, and assistant activations.
 */

import 'server-only'
import { prepareToolManifest } from '@lucid/plugin-policy'
import { supabase, ErrorService } from './client'
import type {
  PluginCatalogEntry,
  OrgPluginInstallation,
  AssistantPluginActivation,
  PluginToolDef,
} from '../../../contracts/plugin'

function getManifestMetadataConfig(
  config: Record<string, unknown> | undefined,
  manifest: ReturnType<typeof prepareToolManifest>,
): Record<string, unknown> {
  return {
    ...(config ?? {}),
    manifest_version: manifest.metadata.manifestVersion,
    manifest_hash: manifest.metadata.manifestHash,
    manifest_generated_at: manifest.metadata.generatedAt,
    manifest_compatibility: manifest.metadata.compatibility,
  }
}

const PLUGIN_CATALOG_SELECT =
  'id, slug, name, description, version, author, license, icon_url, category, tool_manifest, source, risk_level, verified, max_tools, is_published, created_at, updated_at, kind, transport, trust_level, execution_mode, auth_type, auth_provider, endpoint_url, fallback_mode, partner_id, partner_branding, min_plan' as const

// =============================================================================
// CATALOG
// =============================================================================

export async function getPluginCatalog(category?: string): Promise<PluginCatalogEntry[]> {
  try {
    let query = supabase
      .from('plugin_catalog')
      .select(PLUGIN_CATALOG_SELECT)
      .eq('is_published', true)
      .order('category')
      .order('name')

    if (category) {
      query = query.eq('category', category)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as PluginCatalogEntry[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'plugin_catalog' },
      tags: { layer: 'database', table: 'plugin_catalog' },
    })
    return []
  }
}

export async function getPluginCatalogByKind(kinds: string[]): Promise<PluginCatalogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('plugin_catalog')
      .select(PLUGIN_CATALOG_SELECT)
      .eq('is_published', true)
      .in('kind', kinds)
      .order('category')
      .order('name')

    if (error) throw error
    return (data ?? []) as PluginCatalogEntry[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'plugin_catalog' },
      tags: { layer: 'database', table: 'plugin_catalog' },
    })
    return []
  }
}

export async function getPluginBySlug(slug: string): Promise<PluginCatalogEntry | null> {
  try {
    const { data, error } = await supabase
      .from('plugin_catalog')
      .select(PLUGIN_CATALOG_SELECT)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (error) throw error
    return data as PluginCatalogEntry
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'plugin_catalog' },
      tags: { layer: 'database', table: 'plugin_catalog' },
    })
    return null
  }
}

export async function getPluginById(pluginId: string): Promise<PluginCatalogEntry | null> {
  try {
    const { data, error } = await supabase
      .from('plugin_catalog')
      .select(PLUGIN_CATALOG_SELECT)
      .eq('id', pluginId)
      .eq('is_published', true)
      .single()

    if (error) throw error
    return data as PluginCatalogEntry
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'plugin_catalog' },
      tags: { layer: 'database', table: 'plugin_catalog' },
    })
    return null
  }
}

// =============================================================================
// ORG INSTALLATIONS
// =============================================================================

export async function getOrgPlugins(orgId: string): Promise<(OrgPluginInstallation & { plugin: PluginCatalogEntry })[]> {
  try {
    const { data, error } = await supabase
      .from('org_plugin_installations')
      .select('*, plugin:plugin_catalog(*)')
      .eq('org_id', orgId)
      .order('installed_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as (OrgPluginInstallation & { plugin: PluginCatalogEntry })[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'org_plugin_installations' },
      tags: { layer: 'database', table: 'org_plugin_installations' },
    })
    return []
  }
}

export async function getOrgPluginInstallation(
  installationId: string,
): Promise<(OrgPluginInstallation & { plugin: PluginCatalogEntry }) | null> {
  try {
    const { data, error } = await supabase
      .from('org_plugin_installations')
      .select('*, plugin:plugin_catalog(*)')
      .eq('id', installationId)
      .single()

    if (error) throw error
    return data as OrgPluginInstallation & { plugin: PluginCatalogEntry }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'org_plugin_installations', action: 'by_id' },
      tags: { layer: 'database', table: 'org_plugin_installations' },
    })
    return null
  }
}

export async function installPlugin(
  orgId: string,
  pluginId: string,
  version: string,
  manifest: PluginToolDef[],
  userId: string,
  config?: Record<string, unknown>,
): Promise<{ id: string } | null> {
  try {
    const preparedManifest = prepareToolManifest(manifest, { dropInvalidTools: true })
    if (preparedManifest.metadata.hasErrors) {
      throw new Error(`Refusing to install invalid manifest for plugin ${pluginId}`)
    }

    const { data, error } = await supabase
      .from('org_plugin_installations')
      .insert({
        org_id: orgId,
        plugin_id: pluginId,
        installed_version: version,
        manifest_snapshot: preparedManifest.tools,
        installed_by: userId,
        config: getManifestMetadataConfig(config, preparedManifest),
      })
      .select('id')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'org_plugin_installations' },
      tags: { layer: 'database', table: 'org_plugin_installations' },
    })
    return null
  }
}

export async function refreshPluginManifest(
  orgId: string,
  pluginId: string,
  manifest: PluginToolDef[],
  config?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const preparedManifest = prepareToolManifest(manifest, { dropInvalidTools: true })
    if (preparedManifest.metadata.hasErrors) {
      throw new Error(`Refusing to refresh invalid manifest for plugin ${pluginId}`)
    }

    const { data: existing } = await supabase
      .from('org_plugin_installations')
      .select('config')
      .eq('org_id', orgId)
      .eq('plugin_id', pluginId)
      .single()

    const merged = getManifestMetadataConfig(
      {
        ...(existing?.config as Record<string, unknown> ?? {}),
        ...(config ?? {}),
      },
      preparedManifest,
    )
    const { error } = await supabase
      .from('org_plugin_installations')
      .update({ manifest_snapshot: preparedManifest.tools, config: merged })
      .eq('org_id', orgId)
      .eq('plugin_id', pluginId)

    if (error) throw error

    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'org_plugin_installations', action: 'refresh_manifest' },
      tags: { layer: 'database', table: 'org_plugin_installations' },
    })
    return false
  }
}

/**
 * Idempotent install — resolves a plugin slug, ensures an org installation
 * exists, and returns the installation ID. Safe to call on every template
 * deploy: re-deploying the same template twice will not create duplicates.
 *
 * On conflict (org already has this plugin installed) the manifest snapshot
 * is refreshed to the current catalog version.
 */
export async function ensurePluginInstallation(
  orgId: string,
  pluginSlug: string,
  userId: string,
): Promise<string | null> {
  try {
    const plugin = await getPluginBySlug(pluginSlug)
    if (!plugin) {
      return null
    }

    const preparedManifest = prepareToolManifest(plugin.tool_manifest, { dropInvalidTools: true })
    if (preparedManifest.metadata.hasErrors) {
      throw new Error(`Plugin ${pluginSlug} has an invalid catalog manifest`)
    }

    // Try to insert first (ignoreDuplicates: true preserves the original
    // installed_by provenance on re-deploys and avoids unnecessary writes).
    const { data: inserted } = await supabase
      .from('org_plugin_installations')
      .upsert(
        {
          org_id: orgId,
          plugin_id: plugin.id,
          installed_version: plugin.version,
          manifest_snapshot: preparedManifest.tools,
          config: {
            manifest_version: preparedManifest.metadata.manifestVersion,
            manifest_hash: preparedManifest.metadata.manifestHash,
            manifest_generated_at: preparedManifest.metadata.generatedAt,
            manifest_compatibility: preparedManifest.metadata.compatibility,
          },
          installed_by: userId,
        },
        { onConflict: 'org_id,plugin_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()

    if (inserted?.id) return inserted.id as string

    // Row already existed — refresh the manifest snapshot so the installation
    // stays current, but preserve installed_by (original installer provenance).
    const { data: existing } = await supabase
      .from('org_plugin_installations')
      .select('config')
      .eq('org_id', orgId)
      .eq('plugin_id', plugin.id)
      .single()
    const { data, error } = await supabase
      .from('org_plugin_installations')
      .update({
        installed_version: plugin.version,
        manifest_snapshot: preparedManifest.tools,
        config: getManifestMetadataConfig(existing?.config as Record<string, unknown> ?? {}, preparedManifest),
      })
      .eq('org_id', orgId)
      .eq('plugin_id', plugin.id)
      .select('id')
      .single()

    if (error) throw error
    return data?.id ?? null
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'ENSURE', table: 'org_plugin_installations', pluginSlug },
      tags: { layer: 'database', table: 'org_plugin_installations' },
    })
    return null
  }
}

export async function uninstallPlugin(orgId: string, pluginId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('org_plugin_installations')
      .delete()
      .eq('org_id', orgId)
      .eq('plugin_id', pluginId)

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'DELETE', table: 'org_plugin_installations' },
      tags: { layer: 'database', table: 'org_plugin_installations' },
    })
    return false
  }
}

// =============================================================================
// ASSISTANT ACTIVATIONS
// =============================================================================

export async function getAssistantPlugins(
  assistantId: string,
): Promise<(AssistantPluginActivation & { installation: OrgPluginInstallation & { plugin: PluginCatalogEntry } })[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_plugin_activations')
      .select('*, installation:org_plugin_installations(*, plugin:plugin_catalog(*))')
      .eq('assistant_id', assistantId)
      .order('activated_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as (AssistantPluginActivation & { installation: OrgPluginInstallation & { plugin: PluginCatalogEntry } })[]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'SELECT', table: 'assistant_plugin_activations' },
      tags: { layer: 'database', table: 'assistant_plugin_activations' },
    })
    return []
  }
}

export async function activatePlugin(
  assistantId: string,
  installationId: string,
  enabledTools?: string[],
): Promise<{ id: string }> {
  try {
    // Upsert so re-enabling an existing (possibly inactive) activation
    // row works — plain insert hits the UNIQUE(assistant_id, installation_id)
    // constraint and surfaces as a 409 to the caller.
    const { data, error } = await supabase
      .from('assistant_plugin_activations')
      .upsert(
        {
          assistant_id: assistantId,
          installation_id: installationId,
          enabled_tools: enabledTools ?? null,
          is_active: true,
        },
        { onConflict: 'assistant_id,installation_id' },
      )
      .select('id')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'INSERT', table: 'assistant_plugin_activations' },
      tags: { layer: 'database', table: 'assistant_plugin_activations' },
    })
    throw error
  }
}

export async function deactivatePlugin(
  assistantId: string,
  installationId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('assistant_plugin_activations')
      .update({ is_active: false })
      .eq('assistant_id', assistantId)
      .eq('installation_id', installationId)

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'assistant_plugin_activations' },
      tags: { layer: 'database', table: 'assistant_plugin_activations' },
    })
    return false
  }
}

export async function updatePluginTools(
  activationId: string,
  enabledTools: string[],
  assistantId?: string,
): Promise<boolean> {
  try {
    let query = supabase
      .from('assistant_plugin_activations')
      .update({ enabled_tools: enabledTools })
      .eq('id', activationId)
    if (assistantId) query = query.eq('assistant_id', assistantId)
    const { error } = await query

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'UPDATE', table: 'assistant_plugin_activations' },
      tags: { layer: 'database', table: 'assistant_plugin_activations' },
    })
    return false
  }
}

export async function deletePluginActivation(activationId: string, assistantId?: string): Promise<boolean> {
  try {
    let query = supabase
      .from('assistant_plugin_activations')
      .delete()
      .eq('id', activationId)
    if (assistantId) query = query.eq('assistant_id', assistantId)
    const { error } = await query

    if (error) throw error
    return true
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'DELETE', table: 'assistant_plugin_activations' },
      tags: { layer: 'database', table: 'assistant_plugin_activations' },
    })
    return false
  }
}
