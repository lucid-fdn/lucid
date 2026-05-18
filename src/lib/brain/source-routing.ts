import 'server-only'

import { listKnowledgeSources, type KnowledgeSourceRecord } from '@/lib/db/knowledge'

export interface BrainSourceRoute {
  brainId: string
  sourceId: string | null
  sourceKey: string
  source: KnowledgeSourceRecord | null
  federated: boolean
}

export async function resolveBrainSource(input: {
  orgId: string
  sourceId?: string | null
  sourceKey?: string | null
  projectId?: string | null
  teamId?: string | null
}): Promise<BrainSourceRoute> {
  if (input.sourceId || input.sourceKey) {
    const [source] = await listKnowledgeSources({
      orgId: input.orgId,
      sourceId: input.sourceId ?? undefined,
      sourceKey: input.sourceKey ?? undefined,
      includeArchived: true,
      limit: 1,
    })
    return routeFromSource(input.orgId, source, input.sourceKey ?? null)
  }

  const scopedSources = await listKnowledgeSources({
    orgId: input.orgId,
    projectId: input.projectId ?? undefined,
    teamId: input.teamId ?? undefined,
    includeArchived: false,
    limit: 20,
  })
  const scopedDefault = scopedSources.find((source) => source.metadata?.isDefault === true) ?? scopedSources[0]
  if (scopedDefault) return routeFromSource(input.orgId, scopedDefault, null)

  const workspaceSources = await listKnowledgeSources({
    orgId: input.orgId,
    includeArchived: false,
    limit: 50,
  })
  const workspaceDefault = workspaceSources.find((source) =>
    source.sourceKey === 'workspace/default' ||
    source.sourceKey === 'default' ||
    source.metadata?.isDefault === true
  )
  return routeFromSource(input.orgId, workspaceDefault, 'workspace/default')
}

function routeFromSource(
  orgId: string,
  source: KnowledgeSourceRecord | undefined | null,
  fallbackSourceKey: string | null,
): BrainSourceRoute {
  return {
    brainId: orgId,
    sourceId: source?.id ?? null,
    sourceKey: source?.sourceKey ?? fallbackSourceKey ?? 'workspace/default',
    source: source ?? null,
    federated: source ? source.federationPolicy !== 'isolated' : true,
  }
}
