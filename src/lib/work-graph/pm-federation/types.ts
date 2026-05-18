import type { PmIssuePatch, PmProvider, PmProviderDbValue } from '@contracts/pm-adapter'
import type {
  WorkGraphConflictState,
  WorkGraphFieldAuthority,
  WorkGraphPmFederationConfig,
  WorkGraphProviderFieldMap,
  WorkGraphProviderMode,
} from '@contracts/work-graph'

export type WorkGraphPmProvider = Extract<PmProviderDbValue, PmProvider>

export type WorkGraphFederatedField = keyof WorkGraphProviderFieldMap

export interface WorkGraphPmProviderStatus {
  provider: PmProviderDbValue
  enabled: boolean
  isPrimary: boolean
  supported: boolean
  mode: WorkGraphProviderMode
  conflictState: WorkGraphConflictState
  fieldAuthority: WorkGraphProviderFieldMap
  providerProjectRef: string | null
  providerBoardRef: string | null
  providerTeamRef: string | null
  notes: string[]
  updatedAt: string
}

export interface WorkGraphPmInboundDecision {
  applyPatch: boolean
  conflictState: WorkGraphConflictState
  mode: WorkGraphProviderMode
  fields: Array<{
    field: WorkGraphFederatedField
    authority: WorkGraphFieldAuthority
    apply: boolean
    reason: string
  }>
  needsReview: boolean
  reason: string
}

export interface WorkGraphPmInboundDecisionInput {
  config: WorkGraphPmFederationConfig
  patch?: PmIssuePatch | null
  eventType: string
}
