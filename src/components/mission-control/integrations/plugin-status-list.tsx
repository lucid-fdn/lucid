'use client'
import { EmptyState } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { cn } from '@/lib/utils'
import { Puzzle } from 'lucide-react'

interface PluginStatus {
  id: string
  slug: string
  name: string
  is_active: boolean
  tool_call_count: number
  error_count: number
}

interface PluginStatusListProps {
  plugins: PluginStatus[]
}

export function PluginStatusList({ plugins }: PluginStatusListProps) {
  if (plugins.length === 0) {
    return (
      <EmptyState
        title="No plugins installed"
        description="Installed plugins will appear here with call and error health."
        className="min-h-24 py-6"
      />
    )
  }
  return (
    <div className="space-y-1.5">
      {plugins.map((p) => (
        <WorkspaceActionRow
          key={p.id}
          title={
            <span className={cn(!p.is_active && 'text-muted-foreground')}>
              {p.name}
            </span>
          }
          description={!p.is_active ? 'Inactive' : p.slug}
          icon={Puzzle}
          tone={
            p.error_count > 0 ? 'danger' : p.is_active ? 'default' : 'warning'
          }
          meta={
            <>
              <div>{p.tool_call_count} calls</div>
              {p.error_count > 0 && (
                <div className="text-red-400">{p.error_count} err</div>
              )}
            </>
          }
          className="py-2"
        />
      ))}
    </div>
  )
}
