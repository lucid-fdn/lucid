import 'server-only'

import { getLucidPack, listLucidPackManagedResources } from '@/lib/db'
import { buildCapabilityTemplateInstallPreview } from '@/lib/templates/composition'

export async function previewCapabilityTemplateInstall(input: {
  orgId: string
  packId: string
}) {
  const pack = await getLucidPack({
    orgId: input.orgId,
    packId: input.packId,
  })
  if (!pack) return null

  const existingResources = await listLucidPackManagedResources({
    orgId: input.orgId,
    limit: 500,
  })

  return buildCapabilityTemplateInstallPreview({
    packId: pack.id,
    manifest: pack.manifest,
    existingResources,
  })
}
