import { notFound, redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { getLucidPack, getLucidPackByPackKey } from '@/lib/db'
import { TemplateDetail } from '@/components/templates/template-detail'
import { CapabilityTemplateDetail } from '@/components/templates/capability-template-detail'
import { getPackBackedTemplateType, packBackedTemplateToCatalogEntry } from '@/lib/templates/pack-adapter'
import { listTemplateLibraryItems } from '@/lib/templates/library-server'

const TEMPLATE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = 'force-dynamic'

export default async function WorkspaceTemplateDetailPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; id: string }>
}) {
  const { 'workspace-slug': workspaceSlug, id } = await params
  const userId = await getUserId()

  if (!userId) redirect('/login')

  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) redirect('/login')

  const relatedItems = await listTemplateLibraryItems({ orgId: workspace.id })

  const pack = TEMPLATE_ID_RE.test(id)
    ? await getLucidPack({ packId: id, orgId: workspace.id })
    : await getLucidPackByPackKey({ packKey: id, orgId: workspace.id })
  const packType = pack ? getPackBackedTemplateType(pack) : null
  const packTemplate = pack ? packBackedTemplateToCatalogEntry(pack) : null

  if (pack && packTemplate && (packType === 'agent' || packType === 'team')) {
    return (
      <TemplateDetail
        template={packTemplate}
        backHref={`/${workspaceSlug}/templates`}
        backLabel="Back to workspace templates"
        orgId={workspace.id}
        workspaceSlug={workspaceSlug}
        allowDeploy
        relatedItems={relatedItems}
      />
    )
  }

  if (pack && packType === 'capability') {
    return (
      <CapabilityTemplateDetail
        pack={pack}
        backHref={`/${workspaceSlug}/templates`}
        backLabel="Back to workspace templates"
        orgId={workspace.id}
        relatedItems={relatedItems}
      />
    )
  }

  notFound()
}
