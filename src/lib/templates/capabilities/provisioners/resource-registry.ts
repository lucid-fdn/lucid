import type { LucidPackManagedResource, LucidPackManifest } from '@contracts/lucid-pack'

export function getManifestResource(
  manifest: LucidPackManifest,
  resourceKey: string,
): LucidPackManifest['resources'][number] | null {
  return manifest.resources.find((resource) => resource.key === resourceKey) ?? null
}

export function buildRegisteredCapabilityResourceId(input: {
  installId: string
  resourceKey: string
}): string {
  return `capability:${input.installId}:${input.resourceKey}`
}

export function buildProvisioningMetadata(input: {
  status: string
  message: string
  resourceId?: string | null
  provider?: string
  spec?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    provisioning: {
      status: input.status,
      message: input.message,
      provider: input.provider ?? 'lucid',
      resource_id: input.resourceId ?? null,
      updated_at: new Date().toISOString(),
    },
    ...(input.spec ? { provisioned_spec: input.spec } : {}),
  }
}

export function shouldSkipProvisioning(resource: LucidPackManagedResource): string | null {
  if (resource.status === 'archived') return 'Archived resources are not provisioned.'
  if (resource.status === 'forked') return 'Forked resources are locally owned and skipped by pack provisioners.'
  return null
}
