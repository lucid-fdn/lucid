import { redirect } from 'next/navigation'

export default async function WorkspaceRootPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  redirect(`/${workspaceSlug}/dashboard`)
}
