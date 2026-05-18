import {
  getLucidPack,
  listLucidPackInstalls,
  listLucidPackManagedResources,
  listLucidPackMarketplaceSubmissions,
  listLucidPacks,
} from '@/lib/db'
import { listDeployableTemplateCatalogEntries } from '@/lib/templates/library-server'
import { TemplateWorkspaceClient } from '@/components/templates/template-workspace-client'

interface WorkspaceTemplatesPageProps {
  orgId: string
  workspaceSlug: string
  projectId?: string
  projectSlug?: string
}

export async function WorkspaceTemplatesPage({
  orgId,
  workspaceSlug,
  projectId,
  projectSlug,
}: WorkspaceTemplatesPageProps) {
  const [catalogTemplates, templatePacks, packInstalls, managedResources, marketplaceSubmissions] = await Promise.all([
    listDeployableTemplateCatalogEntries({ orgId }),
    listLucidPacks({ orgId, status: 'active', limit: 100 }),
    listLucidPackInstalls({ orgId, projectId, limit: 100 }),
    listLucidPackManagedResources({ orgId, limit: 500 }),
    listLucidPackMarketplaceSubmissions({ orgId, limit: 100 }),
  ])
  const capabilityPackById = new Map(templatePacks.map((pack) => [pack.id, pack]))
  const missingInstalledPackIds = Array.from(
    new Set(packInstalls.map((install) => install.packId).filter((packId) => !capabilityPackById.has(packId)))
  )

  if (missingInstalledPackIds.length > 0) {
    const installedPacks = await Promise.all(
      missingInstalledPackIds.map((packId) => getLucidPack({ packId, orgId }))
    )
    for (const pack of installedPacks) {
      if (pack) {
        capabilityPackById.set(pack.id, pack)
      }
    }
  }

  return (
    <TemplateWorkspaceClient
      catalogTemplates={catalogTemplates}
      capabilityTemplates={templatePacks}
      installedCapabilities={packInstalls
        .map((install) => {
          const pack = capabilityPackById.get(install.packId)
          if (!pack || pack.manifest.metadata?.template_type !== 'capability') return null
          return {
            install,
            pack,
            resources: managedResources.filter((resource) => resource.installId === install.id),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)}
      marketplaceSubmissions={marketplaceSubmissions}
      orgId={orgId}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      projectSlug={projectSlug}
    />
  )
}
