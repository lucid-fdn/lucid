import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeById, getRuntimeManagementCommands } from '@/lib/db/mission-control'
import { getL2BaseUrl } from '@/lib/deployment-mode'
import { ErrorService } from '@/lib/errors/error-service'
import { capabilitiesResponseSchema } from '@/lib/mission-control/schemas'
import type { CapabilitiesResponse } from '@/lib/mission-control/types'
import { getEngineDefinition } from '@/lib/engines/registry'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'
import type { DedicatedRuntime } from '@/lib/mission-control/types'

export const dynamic = 'force-dynamic'

/** Consistent timeout for all L2 proxy calls (15s) */
const L2_TIMEOUT_MS = 15_000

function runtimeCapabilityFields(runtime: DedicatedRuntime) {
  return {
    adapterIdentity: runtime.adapterIdentity ?? null,
    nativeCapabilities: runtime.nativeCapabilities ?? [],
    runtimeServices: runtime.runtimeServices ?? [],
    adapterProbe: runtime.adapterProbe ?? null,
    transcriptParser: runtime.transcriptParser ?? null,
    commandSpec: runtime.commandSpec ?? null,
    engineHomePolicy: runtime.engineHomePolicy ?? null,
    capabilityReportedAt: runtime.capabilityReportedAt ?? null,
  }
}

// GET /api/runtimes/[id]/capabilities?org_id=xxx
// Returns provider capabilities for a managed runtime.
// 200 → managed runtime with capabilities
// 200 (null capabilities) → unmanaged runtime (no passport)
// 502 → L2 temporarily unavailable
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
    const managementCommands = await getRuntimeManagementCommands(id, orgId, 20)
    const engineDefinition = getEngineDefinition(runtime.engine)

    // No passport → unmanaged runtime
    if (!runtime.l2PassportId) {
      return NextResponse.json({
        capabilities: null,
        deploymentMode: 'manual',
        provider: runtime.provider,
        engine: runtime.engine,
        runtimeProtocol: runtime.runtimeProtocol,
        ...runtimeCapabilityFields(runtime),
        managementCommands,
        engineCapabilities: engineDefinition.capabilities,
      })
    }

    const l2Base = getL2BaseUrl()
    if (!l2Base) {
      return NextResponse.json({
        capabilities: null,
        deploymentMode: 'managed',
        provider: runtime.provider,
        engine: runtime.engine,
        runtimeProtocol: runtime.runtimeProtocol,
        ...runtimeCapabilityFields(runtime),
        managementCommands,
        engineCapabilities: engineDefinition.capabilities,
        warning: 'L2 Gateway not configured',
      })
    }

    const l2Res = await fetch(
      `${l2Base}/v1/agents/${encodeURIComponent(runtime.l2PassportId)}/capabilities`,
      {
        headers: {
          ...getL2AdminAuthHeaders(),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(L2_TIMEOUT_MS),
      }
    )

    if (!l2Res.ok) {
      return NextResponse.json({
        capabilities: null,
        deploymentMode: 'managed',
        provider: runtime.provider,
        engine: runtime.engine,
        runtimeProtocol: runtime.runtimeProtocol,
        ...runtimeCapabilityFields(runtime),
        managementCommands,
        engineCapabilities: engineDefinition.capabilities,
        warning: 'Control plane temporarily unavailable',
      }, { status: 502 })
    }

    const data = await l2Res.json()

    // Validate L2 response shape
    const parsed = capabilitiesResponseSchema.safeParse({
      provider: data.provider || runtime.provider,
      engine: runtime.engine,
      runtimeProtocol: runtime.runtimeProtocol,
      deploymentMode: 'managed',
      capabilities: data.capabilities,
      ...runtimeCapabilityFields(runtime),
      managementCommands,
      engineCapabilities: engineDefinition.capabilities,
    })

    const response: CapabilitiesResponse = parsed.success
      ? {
          provider: parsed.data.provider as CapabilitiesResponse['provider'],
          engine: parsed.data.engine as CapabilitiesResponse['engine'],
          runtimeProtocol: parsed.data.runtimeProtocol,
          deploymentMode: parsed.data.deploymentMode,
          capabilities: parsed.data.capabilities,
          adapterIdentity: parsed.data.adapterIdentity,
          nativeCapabilities: parsed.data.nativeCapabilities,
          runtimeServices: parsed.data.runtimeServices,
          adapterProbe: parsed.data.adapterProbe,
          transcriptParser: parsed.data.transcriptParser,
          commandSpec: parsed.data.commandSpec,
          engineHomePolicy: parsed.data.engineHomePolicy,
          capabilityReportedAt: parsed.data.capabilityReportedAt,
          managementCommands: parsed.data.managementCommands,
          engineCapabilities: parsed.data.engineCapabilities,
        }
      : {
          provider: (data.provider || runtime.provider) as CapabilitiesResponse['provider'],
          engine: runtime.engine,
          runtimeProtocol: runtime.runtimeProtocol,
          deploymentMode: 'managed',
          capabilities: data.capabilities,
          ...runtimeCapabilityFields(runtime),
          managementCommands,
          engineCapabilities: engineDefinition.capabilities,
        }

    return NextResponse.json(response)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/capabilities GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
