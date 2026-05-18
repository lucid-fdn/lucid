import 'server-only'

import type { AgentOpsRuntimeSelector } from '@/lib/agent-ops/ports'
import type {
  AgentOpsEngineId,
  AgentOpsRuntimeProfileId,
} from '@/lib/agent-ops/capability-source'
import type { TeamOpsRuntimeCandidate } from '@/lib/agent-ops/team-ops'
import type { AgentEngine } from '@/lib/engines/types'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import { getRuntimes } from './mission-control'

export const supabaseAgentOpsRuntimeSelector: AgentOpsRuntimeSelector = {
  async listCandidates(input) {
    const dedicatedRuntimes = await getRuntimes(input.orgId)
    const candidates: TeamOpsRuntimeCandidate[] = [
      {
        profileId: 'shared',
        engine: 'lucid',
        label: 'Lucid shared runtime',
      },
    ]

    for (const runtime of dedicatedRuntimes) {
      const profileId = mapRuntimeFlavorToProfile(runtime.runtimeFlavor)
      if (!profileId) continue
      candidates.push({
        id: runtime.id,
        label: runtime.displayName,
        profileId,
        engine: mapEngineToAgentOpsEngine(runtime.engine),
        unavailable: runtime.status !== 'connected' || !isRuntimeEligibleForAgentOpsDispatch(runtime),
      })
    }

    return candidates
  },
}

function isRuntimeEligibleForAgentOpsDispatch(runtime: DedicatedRuntime): boolean {
  if (isProtocolSmokeRuntime(runtime)) return false
  return true
}

function isProtocolSmokeRuntime(runtime: DedicatedRuntime): boolean {
  const metadata = runtime.engineMetadata ?? {}
  if (metadata.smoke === true) return true
  if (metadata.permanent === true && metadata.source === 'railway-byo-runtime-smoke') return true

  const adapterIdentity = runtime.adapterIdentity
  if (adapterIdentity?.adapterType === 'railway_byo_smoke') return true
  if (adapterIdentity?.metadata && readBoolean(adapterIdentity.metadata.smoke)) return true

  return runtime.runtimeServices?.some((service) =>
    service.metadata && readBoolean(service.metadata.smoke)
  ) ?? false
}

function mapRuntimeFlavorToProfile(value: string | null | undefined): AgentOpsRuntimeProfileId | null {
  if (value === 'c1_managed' || value === 'c2a_autonomous') return value
  return null
}

function mapEngineToAgentOpsEngine(engine: AgentEngine | string | null | undefined): AgentOpsEngineId {
  if (engine === 'openclaw' || engine === 'hermes') return engine
  return 'future'
}

function readBoolean(value: unknown): boolean {
  return value === true
}
