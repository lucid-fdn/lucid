import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getCanvasTopology } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withReadFallback } from '@/lib/api/read-fallback'

export const dynamic = 'force-dynamic'

// ─── Legacy types (kept for backwards compat, still returned alongside normalized) ───

export interface TopologyNode {
  id: string
  type: 'agent' | 'channel'
  label: string
  data: {
    status?: string
    model?: string
    is_active?: boolean
    health_score?: number | null
    cost_today_usd?: number | null
    errors_last_hour?: number
    channel_type?: string
  }
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  label: string
  data: {
    is_active: boolean
  }
}

// ─── Normalized types ───

interface RuntimeEntity {
  id: string
  displayName: string
  provider: string
  status: string
  runtimeTier: string | null
  cpuPercent: number | null
  ramPercent: number | null
  lastSeenAt: string | null
}

interface AgentEntity {
  id: string
  name: string
  status: string
  model: string
  runtimeId: string | null
  healthScore: number | null
  costTodayUsd: number | null
  tokensTodayInput: number | null
  tokensTodayOutput: number | null
  errorsLastHour: number
}

interface ChannelEntity {
  id: string
  type: string
  name: string
  isActive: boolean
}

interface EdgeEntity {
  source: string
  target: string
  isActive: boolean
}

// GET /api/mission-control/canvas/topology?org_id=xxx
export async function GET(request: NextRequest) {
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

    // Fetch all topology data via DB layer
    const emptyTopology = { agents: [], healthScores: new Map(), costToday: new Map(), runtimes: [] }
    const topology = await withReadFallback(
      getCanvasTopology(orgId).then((data) => data ?? emptyTopology),
      emptyTopology,
      { endpoint: '/api/mission-control/canvas/topology', orgId },
    )

    // ─── Build normalized entities ───

    const runtimes: RuntimeEntity[] = topology.runtimes.map((r) => ({
      id: r.id,
      displayName: r.display_name || `Runtime ${r.id.slice(0, 8)}`,
      provider: r.provider || 'manual',
      status: r.status || 'unknown',
      runtimeTier: r.runtime_tier ?? null,
      cpuPercent: r.cpu_percent ?? null,
      ramPercent: r.ram_percent ?? null,
      lastSeenAt: r.last_seen_at ?? null,
    }))

    const agents: AgentEntity[] = []
    const channels: ChannelEntity[] = []
    const edges: EdgeEntity[] = []
    const channelNodeSet = new Set<string>()

    // Also build legacy format for backwards compat
    const nodes: TopologyNode[] = []
    const legacyEdges: TopologyEdge[] = []

    for (const agent of topology.agents) {
      const costData = topology.costToday.get(agent.id)
      const agentEntity: AgentEntity = {
        id: agent.id,
        name: agent.name,
        status: agent.mc_status || 'active',
        model: agent.lucid_model,
        runtimeId: agent.runtime_id ?? null,
        healthScore: topology.healthScores.get(agent.id) ?? null,
        costTodayUsd: costData?.costUsd ?? null,
        tokensTodayInput: costData?.tokensInput ?? null,
        tokensTodayOutput: costData?.tokensOutput ?? null,
        errorsLastHour: 0,
      }
      agents.push(agentEntity)

      // Legacy node
      nodes.push({
        id: agent.id,
        type: 'agent',
        label: agent.name,
        data: {
          status: agent.mc_status || 'active',
          model: agent.lucid_model,
          health_score: topology.healthScores.get(agent.id) ?? null,
          cost_today_usd: costData?.costUsd ?? null,
          errors_last_hour: 0,
        },
      })

      for (const ch of agent.channels) {
        const channelNodeId = `ch-${ch.channel_type}`
        // Deduplicate channel nodes by type
        if (!channelNodeSet.has(channelNodeId)) {
          channelNodeSet.add(channelNodeId)
          channels.push({
            id: channelNodeId,
            type: ch.channel_type,
            name: ch.channel_type,
            isActive: ch.is_active,
          })
          nodes.push({
            id: channelNodeId,
            type: 'channel',
            label: ch.channel_type,
            data: {
              is_active: ch.is_active,
              channel_type: ch.channel_type,
            },
          })
        }

        edges.push({
          source: agent.id,
          target: channelNodeId,
          isActive: ch.is_active,
        })
        legacyEdges.push({
          id: `e-${agent.id}-${ch.id}`,
          source: agent.id,
          target: channelNodeId,
          label: ch.channel_type,
          data: { is_active: ch.is_active },
        })
      }
    }

    return NextResponse.json({
      // Normalized entities (new)
      runtimes,
      agents,
      channels,
      connections: edges,
      // Legacy format (backwards compat)
      nodes,
      edges: legacyEdges,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/canvas/topology' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
