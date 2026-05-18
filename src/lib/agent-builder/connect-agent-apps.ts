"use client"

import type { UnifiedSkillItem } from "@contracts/unified-skill"
import type { BuilderPendingConnection } from "@/lib/ai/project-generation/builder-step-utils"
import type { GenerationDraft } from "@/lib/ai/project-generation/schemas"
import type { BuilderConnectionRequirement } from "@/components/agent-builder/flow"
import { getDraftCapabilities } from "@/lib/ai/project-generation/structure"

export function mapPendingConnectionsToBuilderRequirements(
  pendingConnections: BuilderPendingConnection[],
): BuilderConnectionRequirement[] {
  return pendingConnections.map((connection) => ({
    slug: connection.slug,
    providerId: connection.providerId,
    label: connection.providerName || connection.name,
  }))
}

export function buildSelectedBuilderAppBindings({
  draft,
  availableUnifiedSkills,
  selectedConnectionIdsByProvider,
}: {
  draft: GenerationDraft | null | undefined
  availableUnifiedSkills: UnifiedSkillItem[]
  selectedConnectionIdsByProvider: Record<string, string>
}): Record<string, string> {
  const bindings: Record<string, string> = {}
  if (!draft) return bindings
  const selectedPlugins = new Set(getDraftCapabilities(draft).plugins)

  for (const item of availableUnifiedSkills) {
    if (!item.auth_provider || !item.connection_row_id) continue
    if (item.item_type === "skill") continue
    if (!selectedPlugins.has(item.slug)) continue
    bindings[item.auth_provider] = selectedConnectionIdsByProvider[item.auth_provider]
      ?? item.selected_connection_row_id
      ?? item.connection_row_id
  }

  return bindings
}
