import { redirect } from 'next/navigation'

export default async function WorkspaceRunsRedirectPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  redirect(`/${workspaceSlug}/mission-control/activity`)
}
