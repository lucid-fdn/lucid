import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeAttachedAgents, getRuntimeById, revokeRuntime, updateRuntimeConfiguration } from '@/lib/db/mission-control'
import { destroyRuntimeViaL2 } from '../_deploy'
import { ErrorService } from '@/lib/errors/error-service'
import { updateRuntimeConfigurationSchema } from '@/lib/mission-control/schemas'
import {
  canUseNativeRuntimeChannels,
  canUseRuntimeCustomLimits,
  canUseRuntimeFullAutoUpdates,
  canUseRuntimeMaintenance,
  canUseRuntimeNetworkControls,
} from '@/lib/mission-control/plan-check'
import type { AgentEngine } from '@/lib/engines/types'
import { sanitizeRuntimeForClient } from '@/lib/mission-control/runtime-client-sanitize'

export const dynamic = 'force-dynamic'

// GET /api/runtimes/[id]?org_id=xxx
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    const agents = await getRuntimeAttachedAgents(id, orgId)

    return NextResponse.json({ runtime: sanitizeRuntimeForClient(runtime), agents })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id] GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE /api/runtimes/[id]?org_id=xxx — Revoke a runtime
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Fetch runtime before revoking to get l2_deployment_id for infra teardown
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    const result = await revokeRuntime(id, orgId)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Tear down actual infrastructure (Railway/Akash/etc.) — non-fatal.
    // On success, clears l2_deployment_id. On failure, reconciler retries.
    // Prefer passport-based terminate route when available.
    if (runtime.l2DeploymentId || runtime.l2PassportId) {
      void destroyRuntimeViaL2(runtime.l2DeploymentId ?? '', id, runtime.l2PassportId).catch((error) => {
        ErrorService.captureException(error as Error, {
          severity: 'warning',
          context: { endpoint: '/api/runtimes/[id] DELETE', runtimeId: id },
          tags: { layer: 'api', route: 'runtimes', operation: 'providerTeardown' },
        })
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id] DELETE' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH /api/runtimes/[id]?org_id=xxx — Update runtime-level engine/ownership/maintenance config
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const parsed = updateRuntimeConfigurationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (parsed.data.channelOwnership === 'runtime_native' && !(await canUseNativeRuntimeChannels(orgId))) {
      return NextResponse.json({ error: 'Runtime native channels require a Business plan or higher' }, { status: 403 })
    }
    if (parsed.data.autoUpdatePolicy && !(await canUseRuntimeMaintenance(orgId))) {
      return NextResponse.json({ error: 'Runtime maintenance controls require a Pro plan or higher' }, { status: 403 })
    }
    if (parsed.data.autoUpdatePolicy === 'full_auto' && !(await canUseRuntimeFullAutoUpdates(orgId))) {
      return NextResponse.json({ error: 'Full auto-updates require a Business plan or higher' }, { status: 403 })
    }
    const advancedConfig = parsed.data.runtimeBootstrapConfig?.advanced
    if (advancedConfig?.network && !(await canUseRuntimeNetworkControls(orgId))) {
      return NextResponse.json({ error: 'Runtime network controls require a Business plan or higher' }, { status: 403 })
    }
    if (advancedConfig?.limits && !(await canUseRuntimeCustomLimits(orgId))) {
      return NextResponse.json({ error: 'Runtime custom limits require a Pro plan or higher' }, { status: 403 })
    }

    const { id } = await params
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    const result = await updateRuntimeConfiguration({
      runtimeId: id,
      orgId,
      engine: parsed.data.engine as AgentEngine | undefined,
      runtimeFlavor: parsed.data.runtimeFlavor,
      channelOwnership: parsed.data.channelOwnership,
      autoUpdatePolicy: parsed.data.autoUpdatePolicy,
      maintenanceChannel: parsed.data.maintenanceChannel,
      runtimeBootstrapConfig: parsed.data.runtimeBootstrapConfig ?? undefined,
    })
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to update runtime' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id] PATCH' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
