import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/server-utils'
import { getUnifiedSkillsForOrg } from '@/lib/db/unified-skills'
import { filterPublicBuilderCapabilities } from '@/lib/builder/state/builder-selectors'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireOrgRequestContext } from '@/lib/request-context/org'
import { getWorkspaceCapabilities } from '@/lib/workspace/capabilities'
import { NewProjectCanvas } from '@/components/projects/new-project-canvas'
import { getProjectBySlugForWorkspace } from '@/lib/db/projects'
import { listDeployableTemplateCatalogEntries } from '@/lib/templates/library-server'

export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'workspace-slug': string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const resolvedSearchParams = (await searchParams) ?? {}
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)

  if (!workspace) notFound()

  const [catalogTemplates, initialAvailableUnifiedSkills, workspaceCapabilities] = await Promise.all([
    requireOrgRequestContext({ userId, orgId: workspace.id, permission: 'editProjects' }),
    listDeployableTemplateCatalogEntries({ orgId: workspace.id }),
    getUnifiedSkillsForOrg({ orgId: workspace.id })
      .then((items) => filterPublicBuilderCapabilities(items)),
    getWorkspaceCapabilities(userId, workspace.id),
  ]).then(([, templates, skills, capabilities]) => [templates, skills, capabilities] as const)

  const start = Array.isArray(resolvedSearchParams.start)
    ? resolvedSearchParams.start[0]
    : resolvedSearchParams.start
  const template = Array.isArray(resolvedSearchParams.template)
    ? resolvedSearchParams.template[0]
    : resolvedSearchParams.template
  const blank = Array.isArray(resolvedSearchParams.blank)
    ? resolvedSearchParams.blank[0]
    : resolvedSearchParams.blank
  const view = Array.isArray(resolvedSearchParams.view)
    ? resolvedSearchParams.view[0]
    : resolvedSearchParams.view
  const projectParam = Array.isArray(resolvedSearchParams.project)
    ? resolvedSearchParams.project[0]
    : resolvedSearchParams.project
  const targetProject = typeof projectParam === 'string' && projectParam.trim()
    ? await getProjectBySlugForWorkspace(workspace.id, projectParam.trim())
    : null

  return (
    <NewProjectCanvas
      workspaceId={workspace.id}
      workspaceSlug={workspaceSlug}
      initialTemplateSlug={typeof template === 'string' ? template : null}
      initialBlank={blank === '1' || start === 'fresh'}
      initialDescribe={start === 'describe' || start === 'interview'}
      initialUpload={start === 'upload'}
      initialBrowseAllTemplates={view === 'templates'}
      catalogTemplates={catalogTemplates}
      initialAvailableUnifiedSkills={initialAvailableUnifiedSkills}
      runtimeFeatureAccess={workspaceCapabilities.runtimeFeatureAccess}
      targetProjectId={targetProject?.id ?? null}
      targetProjectSlug={targetProject?.slug ?? null}
    />
  )
}
