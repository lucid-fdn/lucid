import {
  WorkGraphPmFederationConfigSchema,
  WorkGraphProviderFieldMapSchema,
  type WorkGraphFieldAuthority,
  type WorkGraphPmFederationConfig,
  type WorkGraphProviderFieldMap,
  type WorkGraphProviderMode,
} from '@contracts/work-graph'
import type { OrgPmProviderConfig, PmProviderDbValue } from '@contracts/pm-adapter'

export const DEFAULT_WORK_GRAPH_PM_FIELD_AUTHORITY: WorkGraphProviderFieldMap =
  WorkGraphProviderFieldMapSchema.parse({})

export function resolveWorkGraphPmFederationConfig(
  providerConfig: OrgPmProviderConfig | null | undefined,
): WorkGraphPmFederationConfig {
  const raw = providerConfig?.config?.work_graph
  if (raw && typeof raw === 'object') {
    return WorkGraphPmFederationConfigSchema.parse(raw)
  }

  return WorkGraphPmFederationConfigSchema.parse({
    mode: providerConfig?.enabled ? 'mirror_only' : 'lucid_authoritative',
    field_authority: DEFAULT_WORK_GRAPH_PM_FIELD_AUTHORITY,
    conflict_state: 'clean',
  })
}

export function serializeWorkGraphPmFederationConfigPatch(input: {
  mode?: WorkGraphProviderMode
  fieldAuthority?: Partial<Record<keyof WorkGraphProviderFieldMap, WorkGraphFieldAuthority>>
  conflictState?: WorkGraphPmFederationConfig['conflict_state']
  providerProjectRef?: string | null
  providerBoardRef?: string | null
  providerTeamRef?: string | null
  metadata?: Record<string, unknown>
}): { work_graph: WorkGraphPmFederationConfig } {
  return {
    work_graph: WorkGraphPmFederationConfigSchema.parse({
      mode: input.mode,
      field_authority: {
        ...DEFAULT_WORK_GRAPH_PM_FIELD_AUTHORITY,
        ...(input.fieldAuthority ?? {}),
      },
      conflict_state: input.conflictState,
      provider_project_ref: input.providerProjectRef,
      provider_board_ref: input.providerBoardRef,
      provider_team_ref: input.providerTeamRef,
      metadata: input.metadata ?? {},
    }),
  }
}

export function isWorkGraphPmProviderSupported(provider: PmProviderDbValue): boolean {
  return provider === 'linear' || provider === 'asana' || provider === 'trello' || provider === 'monday'
}

export function unsupportedProviderNotes(provider: PmProviderDbValue): string[] {
  if (isWorkGraphPmProviderSupported(provider)) return []
  if (provider === 'jira') {
    return ['Jira is reserved in the DB/config layer but is not available until a real PM adapter, webhook handler, tests, and live smoke exist.']
  }
  return ['Provider is not supported by the Work Graph PM federation contract.']
}
