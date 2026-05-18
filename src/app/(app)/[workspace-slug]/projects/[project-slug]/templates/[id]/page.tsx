import { notFound } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getLucidPack, getLucidPackByPackKey } from '@/lib/db'
import { TemplateDetail } from '@/components/templates/template-detail'
import { CapabilityTemplateDetail } from '@/components/templates/capability-template-detail'
import { resolveWorkspaceProjectScope } from '@/lib/projects/scope'
import { getPackBackedTemplateType, packBackedTemplateToCatalogEntry } from '@/lib/templates/pack-adapter'
import { listTemplateLibraryItems } from '@/lib/templates/library-server'

const TEMPLATE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = 'force-dynamic'

export default async function ProjectTemplateDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'project-slug': string; id: string }>
}) {
  const { 'workspace-slug': workspaceSlug, 'project-slug': projectSlug, id } = await params
  const userId = await getUserId()

  if (!userId) notFound()

  const scope = await resolveWorkspaceProjectScope(workspaceSlug, userId, projectSlug)
  if (!scope) notFound()

  const relatedItems = await listTemplateLibraryItems({ orgId: scope.workspace.id })

  const pack = TEMPLATE_ID_RE.test(id)
    ? await getLucidPack({ packId: id, orgId: scope.workspace.id })
    : await getLucidPackByPackKey({ packKey: id, orgId: scope.workspace.id })
  const packType = pack ? getPackBackedTemplateType(pack) : null
  const packTemplate = pack ? packBackedTemplateToCatalogEntry(pack) : null

  if (pack && packTemplate && (packType === 'agent' || packType === 'team')) {
    return (
      <TemplateDetail
        template={packTemplate}
        backHref={`/${workspaceSlug}/projects/${scope.project.slug}/templates`}
        backLabel="Back to project templates"
        orgId={scope.workspace.id}
        workspaceSlug={workspaceSlug}
        projectId={scope.project.id}
        allowDeploy
        relatedItems={relatedItems}
      />
    )
  }

  if (pack && packType === 'capability') {
    return (
      <CapabilityTemplateDetail
        pack={pack}
        backHref={`/${workspaceSlug}/projects/${scope.project.slug}/templates`}
        backLabel="Back to project templates"
        orgId={scope.workspace.id}
        projectId={scope.project.id}
        relatedItems={relatedItems}
      />
    )
  }

  notFound()
}
