"use client"

import type { ProjectBlueprint } from "@contracts/project-blueprint"

import { getCSRFTokenFromCookie } from "@/lib/auth/csrf-client"

export interface CreateAgentFromBuilderDraftInput {
  workspaceId: string
  blueprint: ProjectBlueprint
  targetProjectId?: string | null
  targetProjectSlug?: string | null
  appBindings?: Record<string, string>
  beforeDeploy?: () => void | Promise<void>
  onConnecting?: () => void | Promise<void>
  onCreating?: (raw: unknown) => void | Promise<void>
}

export interface CreateAgentFromBuilderDraftResult {
  projectSlug: string
  agentId: string | null
  crewId: string | null
  assistantIds: string[]
  raw: unknown
}

interface DeployBlueprintResponse {
  projectSlug?: string
  project_slug?: string
  primary?: {
    kind?: string
    assistantId?: string | null
    crewId?: string | null
    assistantIds?: string[]
  }
  assistants?: string[]
  crews?: string[]
}

export async function createAgentFromBuilderDraft({
  workspaceId,
  blueprint,
  targetProjectId = null,
  targetProjectSlug = null,
  appBindings = {},
  beforeDeploy,
  onConnecting,
  onCreating,
}: CreateAgentFromBuilderDraftInput): Promise<CreateAgentFromBuilderDraftResult> {
  const csrf = getCSRFTokenFromCookie()
  await beforeDeploy?.()
  await onConnecting?.()
  const response = await fetch(`/api/orgs/${workspaceId}/blueprints/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({
      blueprint,
      create_project: !targetProjectId,
      ...(targetProjectId ? { project_id: targetProjectId } : {}),
      app_bindings: appBindings,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || "Failed to create project")
  }

  const result = await response.json() as DeployBlueprintResponse
  await onCreating?.(result)
  const projectSlug = result.projectSlug ?? result.project_slug ?? targetProjectSlug
  if (!projectSlug) throw new Error("Project deployment did not return a project slug")

  const assistantIds = Array.isArray(result.primary?.assistantIds) && result.primary.assistantIds.length > 0
    ? result.primary.assistantIds
    : result.assistants ?? []
  const agentId = result.primary?.kind === "agent"
    ? result.primary.assistantId
    : null
  const crewId = result.primary?.kind === "team"
    ? result.primary.crewId
    : result.crews?.[0]

  return {
    projectSlug,
    agentId: agentId ?? null,
    crewId: crewId ?? null,
    assistantIds,
    raw: result,
  }
}
