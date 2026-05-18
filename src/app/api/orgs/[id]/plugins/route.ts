import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getPluginCatalog,
  getOrgPlugins,
  getPluginById,
  installPlugin,
  uninstallPlugin,
  refreshPluginManifest,
} from '@/lib/db'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { getSubscription } from '@/lib/plans'
import { isInternalOrg } from '@/lib/auth/internal'
import { requireOrgPermission } from '@/lib/access-control/api'
import { meetsMinPlan, normalizeWorkspacePlanName, type WorkspacePlan } from '@/lib/access-control/types'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { resolveIntegrationHostManifest } from '@/lib/plugins/host-services'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orgs/[id]/plugins
 * List all catalog plugins + org's installation status.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(_req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const access = await requireOrgPermission(userId, orgId, 'manageSettings')
    if (!access.ok) return access.response

    const [catalog, installations] = await Promise.all([
      getPluginCatalog(),
      getOrgPlugins(orgId),
    ])

    const installedMap = new Map(installations.map(i => [i.plugin_id, i]))

    const plugins = catalog.map(p => ({
      ...p,
      installed: installedMap.has(p.id),
      installation: installedMap.get(p.id) || null,
    }))

    return NextResponse.json({ plugins })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/plugins', method: 'GET' },
      tags: { layer: 'api', route: 'org-plugins' },
    })
    return NextResponse.json({ error: 'Failed to load plugins' }, { status: 500 })
  }
}

/**
 * POST /api/orgs/[id]/plugins
 * Install a plugin for the org.
 * Body: { pluginId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const access = await requireOrgPermission(userId, orgId, 'manageSettings')
    if (!access.ok) return access.response

    const body = await req.json()
    const { pluginId } = body as { pluginId: string }

    if (!pluginId) {
      return NextResponse.json({ error: 'pluginId is required' }, { status: 400 })
    }

    const plugin = await getPluginById(pluginId)
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // Plan check — integrations (OAuth-connected services) bypass the plugins feature gate
    // so they're accessible on all plans. Only true plugins require the use_plugins entitlement.
    if (plugin.kind !== 'integration') {
      const pluginFeature = await evaluateEntitlement({ orgId, action: 'use_plugins' })
      const pluginFeatureGuard = guardEntitlement(pluginFeature)
      if (pluginFeatureGuard) return pluginFeatureGuard
    }

    // Per-plugin plan gating (min_plan column on plugin_catalog)
    const minPlan = (plugin.min_plan ?? 'starter') as WorkspacePlan
    if (minPlan !== 'starter' && !isInternalOrg(orgId)) {
      const sub = await getSubscription(orgId) // React cache() deduplicates with evaluateEntitlement above
      const orgPlan = normalizeWorkspacePlanName(sub?.plan_name)
      if (!meetsMinPlan(orgPlan, minPlan)) {
        return NextResponse.json(
          { error: `This plugin requires the ${minPlan} plan or higher` },
          { status: 403 },
        )
      }
    }

    // For Nango integrations, discover tools from Nango at install time.
    // Populates manifest_snapshot with actual action schemas so the agent
    // knows what tools are available. Fails visibly if discovery fails —
    // an integration with no tools is broken, not installed.
    let manifest = plugin.tool_manifest
    let installConfig: Record<string, unknown> | undefined

    if (plugin.transport === 'nango' && plugin.auth_provider) {
      const resolved = await resolveIntegrationHostManifest(plugin.auth_provider, plugin.tool_manifest)

      if (resolved.ok) {
        manifest = resolved.tools
        installConfig = resolved.config
      } else {
        ErrorService.captureMessage('Plugin install failed during manifest resolution', {
          severity: 'warning',
          context: {
            pluginId,
            pluginSlug: plugin.slug,
            pluginName: plugin.name,
            authProvider: plugin.auth_provider,
            discoveryError: resolved.error ?? null,
          },
          tags: {
            layer: 'api',
            route: 'org-plugins',
          },
        })
        // Fail visible — don't silently install with empty manifest
        return NextResponse.json(
          {
            error: `Could not discover tools for ${plugin.name}. ${resolved.error ?? 'No actions found.'}`,
            discovery_error: resolved.error,
          },
          { status: 502 },
        )
      }
    }

    const result = await installPlugin(
      orgId,
      pluginId,
      plugin.version,
      manifest,
      userId,
      installConfig,
    )

    if (!result) {
      return NextResponse.json({ error: 'Failed to install plugin. It may already be installed.' }, { status: 409 })
    }

    return NextResponse.json({ installation: result }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/plugins', method: 'POST' },
      tags: { layer: 'api', route: 'org-plugins' },
    })
    return NextResponse.json({ error: 'Failed to install plugin' }, { status: 500 })
  }
}

/**
 * DELETE /api/orgs/[id]/plugins
 * Uninstall a plugin from the org. Cascades to all assistant activations.
 * Body: { pluginId: string }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const access = await requireOrgPermission(userId, orgId, 'manageSettings')
    if (!access.ok) return access.response

    const body = await req.json()
    const { pluginId } = body as { pluginId: string }

    if (!pluginId) {
      return NextResponse.json({ error: 'pluginId is required' }, { status: 400 })
    }

    const success = await uninstallPlugin(orgId, pluginId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to uninstall plugin' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/plugins', method: 'DELETE' },
      tags: { layer: 'api', route: 'org-plugins' },
    })
    return NextResponse.json({ error: 'Failed to uninstall plugin' }, { status: 500 })
  }
}

/**
 * PATCH /api/orgs/[id]/plugins
 * Refresh manifest for an OAuth integration.
 * Body: { pluginId: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const access = await requireOrgPermission(userId, orgId, 'manageSettings')
    if (!access.ok) return access.response

    const body = await req.json()
    const { pluginId } = body as { pluginId: string }

    if (!pluginId) {
      return NextResponse.json({ error: 'pluginId is required' }, { status: 400 })
    }

    const plugin = await getPluginById(pluginId)
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (plugin.transport !== 'nango' || !plugin.auth_provider) {
      return NextResponse.json({ error: 'Only Nango integrations support manifest refresh' }, { status: 400 })
    }

    // Verify org has this plugin installed before allowing refresh
    const orgInstallations = await getOrgPlugins(orgId)
    const isInstalled = orgInstallations.some(i => i.plugin_id === pluginId)
    if (!isInstalled) {
      return NextResponse.json({ error: 'Plugin not installed for this org' }, { status: 404 })
    }

    const resolved = await resolveIntegrationHostManifest(plugin.auth_provider, plugin.tool_manifest)

    if (!resolved.ok) {
      return NextResponse.json(
        { error: `Discovery failed: ${resolved.error}`, discovery_error: resolved.error },
        { status: 502 },
      )
    }

    const success = await refreshPluginManifest(orgId, pluginId, resolved.tools, resolved.config)
    if (!success) {
      return NextResponse.json({ error: 'Failed to update manifest' }, { status: 500 })
    }

    return NextResponse.json({
      refreshed: true,
      action_count: resolved.config.manifest_action_count,
      discovered_at: resolved.config.manifest_discovered_at,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/plugins', method: 'PATCH' },
      tags: { layer: 'api', route: 'org-plugins' },
    })
    return NextResponse.json({ error: 'Failed to refresh plugin manifest' }, { status: 500 })
  }
}
