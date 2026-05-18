import {
  AppBlueprintUpgradePlanSchema,
  type AppBlueprint,
  type AppBlueprintUpgradePlan,
  type AppDeployment,
  type AppServiceSpec,
} from '@contracts/app-service'

export interface BlueprintUpgradeTarget {
  id: string | null
  slug: string
  version: string
  source: AppBlueprint['source']
  status: AppBlueprint['status']
  spec: AppServiceSpec
}

function sortedDifference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right)
  return [...new Set(left)].filter((item) => !rightSet.has(item)).sort()
}

function capabilitiesFromSpec(spec: AppServiceSpec): string[] {
  const capabilities = new Set<string>(['status', 'feedback'])
  if (spec.agents.some((agent) => agent.public_chat_enabled) || spec.team?.public_chat_enabled) {
    capabilities.add('chat')
  }
  if (spec.frontend.pages.some((page) => page.blocks.some((block) => block.enabled && ['lead_form', 'intake_form'].includes(block.type)))) {
    capabilities.add('lead')
  }
  if (spec.workflows.some((workflow) => workflow.trigger === 'public_action')) {
    capabilities.add('public_actions')
  }
  if (Object.keys(spec.commerce?.paid_actions ?? {}).length > 0) {
    capabilities.add('paid_actions')
  }
  return [...capabilities].sort()
}

function capabilitiesFromManifest(manifest: Record<string, unknown>): string[] {
  const value = manifest.capabilities
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').sort() : []
}

function stringList(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort()
}

function currentBlueprintSlug(app: AppDeployment): string | null {
  const metadata = app.frontend_manifest.blueprint
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const slug = (metadata as Record<string, unknown>).slug
    if (typeof slug === 'string' && slug.trim()) return slug
  }
  const platformSlug = app.frontend_manifest.platformBlueprintSlug
  if (typeof platformSlug === 'string' && platformSlug.trim()) return platformSlug
  return null
}

function currentBlueprintVersion(app: AppDeployment): string | null {
  const metadata = app.frontend_manifest.blueprint
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const version = (metadata as Record<string, unknown>).version
    if (typeof version === 'string' && version.trim()) return version
  }
  const platformVersion = app.frontend_manifest.platformBlueprintVersion
  if (typeof platformVersion === 'string' && platformVersion.trim()) return platformVersion
  return null
}

export function buildAppBlueprintUpgradePlan(input: {
  app: AppDeployment
  target: BlueprintUpgradeTarget
}): AppBlueprintUpgradePlan {
  const currentCapabilities = capabilitiesFromManifest(input.app.frontend_manifest)
  const targetCapabilities = capabilitiesFromSpec(input.target.spec)
  const currentWorkflowKeys = stringList(
    Array.isArray(input.app.frontend_manifest.workflows)
      ? input.app.frontend_manifest.workflows.map((workflow) => (
        workflow && typeof workflow === 'object' && !Array.isArray(workflow)
          ? String((workflow as Record<string, unknown>).key ?? '')
          : null
      ))
      : [],
  )
  const targetWorkflowKeys = stringList(input.target.spec.workflows.map((workflow) => workflow.key))
  const currentIntegrationProviders = stringList(
    Array.isArray(input.app.frontend_manifest.integrations)
      ? input.app.frontend_manifest.integrations.map((integration) => (
        integration && typeof integration === 'object' && !Array.isArray(integration)
          ? String((integration as Record<string, unknown>).provider ?? '')
          : null
      ))
      : [],
  )
  const targetIntegrationProviders = stringList(input.target.spec.integrations.map((integration) => integration.provider))

  const current = {
    blueprint_id: input.app.blueprint_id ?? null,
    slug: currentBlueprintSlug(input.app),
    version: currentBlueprintVersion(input.app),
  }
  const target = {
    blueprint_id: input.target.id,
    slug: input.target.slug,
    version: input.target.version,
    source: input.target.source,
  }
  const steps = [
    {
      key: 'refresh_manifest',
      label: 'Refresh generated app manifest from target blueprint.',
      severity: 'info' as const,
      automatic: true,
    },
    {
      key: 'review_integrations',
      label: 'Review integration and secret setup after upgrade.',
      severity: targetIntegrationProviders.length > 0 ? 'warning' as const : 'info' as const,
      automatic: false,
    },
    {
      key: 'run_eval_pack',
      label: 'Run target blueprint eval pack before publishing the upgrade.',
      severity: input.target.spec.eval_pack.length > 0 ? 'warning' as const : 'info' as const,
      automatic: false,
    },
  ]
  const blockers = input.target.status === 'deprecated'
    ? [{
        key: 'target_deprecated',
        label: 'Target blueprint is deprecated.',
        severity: 'blocking' as const,
        automatic: false,
      }]
    : []
  const warnings = steps.filter((step) => step.severity === 'warning')
  const sameTarget = current.blueprint_id === target.blueprint_id
    && current.slug === target.slug
    && current.version === target.version

  return AppBlueprintUpgradePlanSchema.parse({
    schema_version: '1.0',
    app_deployment_id: input.app.id,
    status: blockers.length > 0 ? 'blocked' : sameTarget ? 'not_applicable' : 'available',
    current,
    target,
    steps,
    blockers,
    warnings,
    spec_changes: {
      capabilities_added: sortedDifference(targetCapabilities, currentCapabilities),
      capabilities_removed: sortedDifference(currentCapabilities, targetCapabilities),
      integrations_added: sortedDifference(targetIntegrationProviders, currentIntegrationProviders),
      integrations_removed: sortedDifference(currentIntegrationProviders, targetIntegrationProviders),
      workflows_added: sortedDifference(targetWorkflowKeys, currentWorkflowKeys),
      workflows_removed: sortedDifference(currentWorkflowKeys, targetWorkflowKeys),
    },
  })
}
