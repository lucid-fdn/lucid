import type { ReactNode } from 'react'
import { MissionControlGlobalSearch } from './global-search'
import { MissionControlSystemNotices } from './system-notices'
import { PageHeader } from '@/components/page/page-header'
import { PageShell } from '@/components/page/page-shell'

interface MissionControlSectionShellProps {
  title: string
  description: string
  orgId?: string
  workspaceSlug?: string
  children: ReactNode
}

export function MissionControlSectionShell({
  title,
  description,
  orgId,
  workspaceSlug,
  children,
}: MissionControlSectionShellProps) {
  return (
    <PageShell constrained={false}>
      <PageHeader
        title={title}
        description={description}
        actions={orgId && workspaceSlug ? (
          <MissionControlGlobalSearch orgId={orgId} workspaceSlug={workspaceSlug} />
        ) : null}
      />
      {orgId ? <MissionControlSystemNotices orgId={orgId} /> : null}
      <div className="min-h-0 flex-1">{children}</div>
    </PageShell>
  )
}
