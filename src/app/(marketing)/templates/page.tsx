import { listTemplateLibraryItems } from '@/lib/templates/library-server'
import { TemplateGallery } from '@/components/templates/template-gallery'

export const dynamic = 'force-dynamic'

export default async function PublicTemplatesPage() {
  const libraryItems = await listTemplateLibraryItems()
  const templates = libraryItems
    .filter((item) => item.action === 'deploy')
    .map((item) => item.template)

  return (
    <main className="min-h-screen bg-background">
      <TemplateGallery
        initialTemplates={templates}
        libraryItems={libraryItems}
        detailBasePath="/templates"
        title="Template gallery"
        description="Browse deployable agents and teams, inspect their living spec data, and pick the one that matches your workflow."
        allowDeploy={false}
      />
    </main>
  )
}
