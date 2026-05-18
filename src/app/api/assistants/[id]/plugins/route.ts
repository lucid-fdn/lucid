import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getAssistantPlugins,
  getOrgPlugins,
  getOrgPluginInstallation,
  activatePlugin,
  updatePluginTools,
  deletePluginActivation,
} from '@/lib/db'
import { requireAssistantPermission } from '@/lib/access-control/api'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import {
  formatAssistantToolCapMessage,
  getEnabledToolCount,
  HARD_MAX_TOOLS_PER_AGENT,
} from '@/lib/plugins/assistant-tool-cap'

export const dynamic = 'force-dynamic'

function extractErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    const anyError = error as Error & { details?: string; hint?: string; code?: string }
    return [anyError.message, anyError.details, anyError.hint, anyError.code]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' | ')
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    return ['message', 'details', 'hint', 'code', 'error_description']
      .map((key) => record[key])
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' | ')
  }

  return typeof error === 'string' ? error : ''
}

function formatPluginCapMessage(current: number, limit: number): string {
  if (current > limit) {
    return `This assistant currently has ${current} active plugins, but your current plan allows ${limit}. Deactivate plugins until you are below that limit before enabling another one.`
  }

  return `This assistant is already at its current plan limit (${current}/${limit} active plugins). Deactivate a plugin before enabling another one.`
}

function getActivationToolCount(
  activation: Awaited<ReturnType<typeof getAssistantPlugins>>[number],
): number {
  const manifestSnapshot = activation.installation?.manifest_snapshot
  const fallbackCount = Array.isArray(manifestSnapshot) ? manifestSnapshot.length : 0
  return getEnabledToolCount(activation.enabled_tools, fallbackCount)
}

function captureAssistantToolCapAlert(
  assistantId: string,
  orgId: string,
  currentToolCount: number,
) {
  ErrorService.captureMessage('Assistant hard tool cap reached', {
    severity: 'warning',
    context: {
      assistantId,
      orgId,
      currentToolCount,
      hardCap: HARD_MAX_TOOLS_PER_AGENT,
    },
    tags: {
      layer: 'api',
      route: 'assistant-plugins',
      alert: 'assistant_tool_cap',
    },
  })
}

/**
 * GET /api/assistants/[id]/plugins
 * List plugins activated for this assistant (with available tools).
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

    const { id: assistantId } = await params

    const access = await requireAssistantPermission(userId, assistantId, 'editProjects')
    if (!access.ok) return access.response
    const { assistant } = access

    const [activations, orgPlugins] = await Promise.all([
      getAssistantPlugins(assistantId),
      getOrgPlugins(assistant.org_id),
    ])

    return NextResponse.json({
      activations,
      orgPlugins,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/plugins', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-plugins' },
    })
    return NextResponse.json({ error: 'Failed to load plugins' }, { status: 500 })
  }
}

/**
 * POST /api/assistants/[id]/plugins
 * Activate a plugin for this assistant.
 * Body: { installationId: string, enabledTools?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let activePluginCountAtFailure = 0
  let pluginLimitAtFailure: number | null = null

  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params

    const access = await requireAssistantPermission(userId, assistantId, 'editProjects')
    if (!access.ok) return access.response
    const { assistant } = access

    const body = await req.json()
    const { installationId, enabledTools } = body as { installationId: string; enabledTools?: string[] }

    if (!installationId) {
      return NextResponse.json({ error: 'installationId is required' }, { status: 400 })
    }

    // Integrations (kind='integration') bypass the plugin entitlement gates —
    // OAuth-connected services are available on all plans including starter.
    // Only true plugins (kind='plugin') count against use_plugins / install_plugin /
    // install_plugin_tools limits.
    const installation = await getOrgPluginInstallation(installationId)
    if (!installation || installation.org_id !== assistant.org_id) {
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 })
    }
    const isIntegration = installation.plugin?.kind === 'integration'

    const currentActivations = await getAssistantPlugins(assistantId)
    const activePlugins = currentActivations.filter((activation) => {
      if (!activation.is_active) return false
      const installation = (activation as Record<string, unknown>).installation as Record<string, unknown> | undefined
      const plugin = installation?.plugin as Record<string, unknown> | undefined
      return plugin?.kind === 'plugin'
    })
    activePluginCountAtFailure = activePlugins.length

    if (!isIntegration) {
      // Feature gate: plugins must be enabled on the plan
      const pluginFeature = await evaluateEntitlement({ orgId: assistant.org_id, action: 'use_plugins' })
      const pluginFeatureGuard = guardEntitlement(pluginFeature)
      if (pluginFeatureGuard) return pluginFeatureGuard

      // Per-assistant plugin count limit
      const pluginLimit = await evaluateEntitlement({ orgId: assistant.org_id, action: 'install_plugin', currentUsage: activePlugins.length })
      if (!pluginLimit.allowed && pluginLimit.deny?.code === 'capacity_exceeded') {
        pluginLimitAtFailure = pluginLimit.deny.entitlement.max ?? null
        return NextResponse.json(
          { error: formatPluginCapMessage(activePlugins.length, pluginLimit.deny.entitlement.max ?? activePlugins.length) },
          { status: 409 },
        )
      }
      const pluginLimitGuard = guardEntitlement(pluginLimit)
      if (pluginLimitGuard) return pluginLimitGuard

      // Total tool count limit across all active plugins
      const currentToolCount = activePlugins.reduce((sum, a) => {
        const manifest = (a as Record<string, unknown>).installation as Record<string, unknown> | undefined
        const snapshot = (manifest?.manifest_snapshot as Array<unknown>) ?? []
        const tools = a.enabled_tools?.length ?? snapshot.length
        return sum + tools
      }, 0)
      const newToolCount = enabledTools?.length ?? 0
      const toolLimit = await evaluateEntitlement({ orgId: assistant.org_id, action: 'install_plugin_tools', currentUsage: newToolCount > 0 ? currentToolCount + newToolCount : currentToolCount })
      const toolLimitGuard = guardEntitlement(toolLimit)
      if (toolLimitGuard) return toolLimitGuard
    }

    const currentActiveActivations = currentActivations.filter((activation) => activation.is_active)
    const currentToolCountExcludingTarget = currentActiveActivations.reduce((sum, activation) => {
      if (activation.installation_id === installationId) return sum
      return sum + getActivationToolCount(activation)
    }, 0)
    const installationManifest = installation.manifest_snapshot ?? installation.plugin?.tool_manifest ?? []
    const newActivationToolCount = getEnabledToolCount(
      enabledTools,
      Array.isArray(installationManifest) ? installationManifest.length : 0,
    )
    const nextToolCount = currentToolCountExcludingTarget + newActivationToolCount
    if (nextToolCount > HARD_MAX_TOOLS_PER_AGENT) {
      captureAssistantToolCapAlert(assistantId, assistant.org_id, nextToolCount)
      return NextResponse.json(
        {
          error: formatAssistantToolCapMessage(nextToolCount),
          alert: {
            type: 'assistant_tool_cap',
            current: nextToolCount,
            limit: HARD_MAX_TOOLS_PER_AGENT,
          },
        },
        { status: 409 },
      )
    }

    const result = await activatePlugin(assistantId, installationId, enabledTools)
    return NextResponse.json({ activation: result }, { status: 201 })
  } catch (error) {
    const message = extractErrorText(error) || 'Failed to activate plugin'
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/plugins', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-plugins' },
    })
    if (/Maximum .* active plugins per assistant/i.test(message)) {
      if (pluginLimitAtFailure !== null) {
        return NextResponse.json(
          { error: formatPluginCapMessage(activePluginCountAtFailure, pluginLimitAtFailure) },
          { status: 409 },
        )
      }
      return NextResponse.json(
        {
          error: 'This assistant is already at the maximum number of active plugins allowed by its current plan. Deactivate a plugin before enabling another one.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/assistants/[id]/plugins
 * Update enabled tools for an activation.
 * Body: { activationId: string, enabledTools: string[] }
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

    const { id: assistantId } = await params

    const access = await requireAssistantPermission(userId, assistantId, 'editProjects')
    if (!access.ok) return access.response

    const body = await req.json()
    const { activationId, enabledTools } = body as { activationId: string; enabledTools: string[] }

    if (!activationId || !enabledTools) {
      return NextResponse.json({ error: 'activationId and enabledTools are required' }, { status: 400 })
    }

    const activations = await getAssistantPlugins(assistantId)
    const targetActivation = activations.find((activation) => activation.id === activationId)
    if (!targetActivation) {
      return NextResponse.json({ error: 'Activation not found' }, { status: 404 })
    }

    const nextToolCount = activations.reduce((sum, activation) => {
      if (!activation.is_active) return sum
      if (activation.id === activationId) {
        return sum + enabledTools.length
      }
      return sum + getActivationToolCount(activation)
    }, 0)
    if (nextToolCount > HARD_MAX_TOOLS_PER_AGENT) {
      captureAssistantToolCapAlert(assistantId, access.assistant.org_id, nextToolCount)
      return NextResponse.json(
        {
          error: formatAssistantToolCapMessage(nextToolCount),
          alert: {
            type: 'assistant_tool_cap',
            current: nextToolCount,
            limit: HARD_MAX_TOOLS_PER_AGENT,
          },
        },
        { status: 409 },
      )
    }

    // Ownership: scoped to this assistant to prevent cross-assistant access
    const success = await updatePluginTools(activationId, enabledTools, assistantId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to update plugin tools' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/plugins', method: 'PATCH' },
      tags: { layer: 'api', route: 'assistant-plugins' },
    })
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 })
  }
}

/**
 * DELETE /api/assistants/[id]/plugins
 * Deactivate (remove) a plugin for this assistant.
 * Body: { activationId: string }
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

    const { id: assistantId } = await params

    const access = await requireAssistantPermission(userId, assistantId, 'editProjects')
    if (!access.ok) return access.response

    const body = await req.json()
    const { activationId } = body as { activationId: string }

    if (!activationId) {
      return NextResponse.json({ error: 'activationId is required' }, { status: 400 })
    }

    // Ownership: scoped to this assistant to prevent cross-assistant access
    const success = await deletePluginActivation(activationId, assistantId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to deactivate plugin' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/plugins', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-plugins' },
    })
    return NextResponse.json({ error: 'Failed to deactivate plugin' }, { status: 500 })
  }
}
