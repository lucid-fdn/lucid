import { notFound } from 'next/navigation'
import { getLucidPack, getLucidPackByPackKey } from '@/lib/db'
import { getDeployableTemplateCatalogEntry, listTemplateLibraryItems } from '@/lib/templates/library-server'
import { getPackBackedTemplateType } from '@/lib/templates/pack-adapter'
import { TemplateDetail } from '@/components/templates/template-detail'
import { CapabilityTemplateDetail } from '@/components/templates/capability-template-detail'

export const dynamic = 'force-dynamic'

const TEMPLATE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PublicTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const template = await getDeployableTemplateCatalogEntry({ idOrSlug: id })

  if (template) {
    return (
      <main className="min-h-screen bg-background">
        <TemplateDetail
          template={template}
          backHref="/templates"
          backLabel="Back to templates"
        />
      </main>
    )
  }

  const pack = TEMPLATE_ID_RE.test(id)
    ? await getLucidPack({ packId: id })
    : await getLucidPackByPackKey({ packKey: id })

  if (pack && getPackBackedTemplateType(pack) === 'capability') {
    const relatedItems = await listTemplateLibraryItems()
    return (
      <main className="min-h-screen bg-background">
        <CapabilityTemplateDetail
          pack={pack}
          backHref="/templates"
          backLabel="Back to templates"
          relatedItems={relatedItems}
        />
      </main>
    )
  }

  notFound()
}
