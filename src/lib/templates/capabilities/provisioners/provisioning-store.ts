import 'server-only'

import type { LucidPackManagedResource } from '@contracts/lucid-pack'
import { ErrorService, supabase } from '@/lib/db/client'

export async function updateLucidPackManagedResourceProvisioning(input: {
  orgId: string
  installId: string
  resourceKey: string
  resourceId?: string | null
  metadata: Record<string, unknown>
}): Promise<void> {
  const existing = await loadManagedResourceMetadata(input)
  const { error } = await supabase
    .from('lucid_pack_managed_resources')
    .update({
      resource_id: input.resourceId ?? null,
      metadata: {
        ...existing,
        ...input.metadata,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', input.orgId)
    .eq('install_id', input.installId)
    .eq('resource_key', input.resourceKey)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        installId: input.installId,
        resourceKey: input.resourceKey,
        operation: 'updateLucidPackManagedResourceProvisioning',
      },
      tags: { layer: 'database', table: 'lucid_pack_managed_resources' },
    })
    throw error
  }
}

async function loadManagedResourceMetadata(input: {
  orgId: string
  installId: string
  resourceKey: string
}): Promise<LucidPackManagedResource['metadata']> {
  const { data, error } = await supabase
    .from('lucid_pack_managed_resources')
    .select('metadata')
    .eq('org_id', input.orgId)
    .eq('install_id', input.installId)
    .eq('resource_key', input.resourceKey)
    .maybeSingle()

  if (error) return {}
  return ((data?.metadata as Record<string, unknown> | null) ?? {})
}
