import {
  PublicActionCommerceConfigSchema,
  PublicAppCommerceSchema,
  type PublicActionCommerceConfig,
  type PublicAppCommerce,
} from '@contracts/app-runtime'

const PUBLIC_ACTION_RESOURCE_ID_PREFIX = 'app'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function actionKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 80
    ? value
    : null
}

function workflowsFromManifest(manifest: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(manifest.workflows)
    ? manifest.workflows.filter(isRecord)
    : []
}

function paidActionsFromManifest(manifest: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(manifest.commerce)) return {}
  return isRecord(manifest.commerce.paid_actions) ? manifest.commerce.paid_actions : {}
}

export function normalizePublicActionCommerceConfig(value: unknown): PublicActionCommerceConfig | null {
  const parsed = PublicActionCommerceConfigSchema.safeParse(value)
  if (!parsed.success) return null
  if (parsed.data.mode === 'off') return null
  return parsed.data
}

export function publicActionWorkflowFromManifest(
  manifest: Record<string, unknown>,
  action: string,
): Record<string, unknown> | null {
  return workflowsFromManifest(manifest).find((workflow) => (
    workflow.trigger === 'public_action' && workflow.public_action_key === action
  )) ?? null
}

export function publicActionCommerceConfigForAction(
  manifest: Record<string, unknown>,
  action: string,
): PublicActionCommerceConfig | null {
  const workflow = publicActionWorkflowFromManifest(manifest, action)
  const workflowConfig = workflow ? normalizePublicActionCommerceConfig(workflow.commerce) : null
  if (workflowConfig) return workflowConfig

  const topLevel = paidActionsFromManifest(manifest)[action]
  return normalizePublicActionCommerceConfig(topLevel)
}

export function publicCommerceConfigForManifest(manifest: Record<string, unknown>): PublicAppCommerce {
  const paidActions: Record<string, PublicActionCommerceConfig> = {}

  for (const [key, value] of Object.entries(paidActionsFromManifest(manifest))) {
    const safeKey = actionKey(key)
    const config = normalizePublicActionCommerceConfig(value)
    if (safeKey && config) paidActions[safeKey] = config
  }

  for (const workflow of workflowsFromManifest(manifest)) {
    const key = actionKey(workflow.public_action_key)
    if (!key || workflow.trigger !== 'public_action') continue
    const config = normalizePublicActionCommerceConfig(workflow.commerce)
    if (config) paidActions[key] = config
  }

  return PublicAppCommerceSchema.parse({ paid_actions: paidActions })
}

export function isPublicActionCommerceEnforced(config: PublicActionCommerceConfig | null): boolean {
  return config?.mode === 'enforce' && Boolean(config.amount)
}

export function publicActionCommerceResourceType(config: PublicActionCommerceConfig): string {
  return config.resource_type ?? 'generated_app_action'
}

export function publicActionCommerceResourceId(
  appDeploymentId: string,
  action: string,
  config: PublicActionCommerceConfig,
): string {
  return config.resource_id ?? `${PUBLIC_ACTION_RESOURCE_ID_PREFIX}:${appDeploymentId}:action:${action}`
}
