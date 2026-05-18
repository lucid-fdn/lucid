'use client'
import { EmptyState } from '@/components/page'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { AlertTriangle } from 'lucide-react'

interface ErrorEntry {
  id: string
  assistant_id: string
  agent_name: string
  error_message: string | null
  created_at: string
}

interface ErrorLogProps {
  errors: ErrorEntry[]
}

export function ErrorLog({ errors }: ErrorLogProps) {
  if (errors.length === 0) {
    return (
      <EmptyState
        title="No recent errors"
        description="Runtime and agent errors will appear here when they need review."
        className="min-h-24 py-6"
      />
    )
  }
  return (
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-1.5">
        {errors.map((err) => (
          <WorkspaceActionRow
            key={err.id}
            title={err.agent_name}
            description={
              <span className="font-mono text-red-400">
                {err.error_message || 'Unknown error'}
              </span>
            }
            icon={AlertTriangle}
            tone="danger"
            meta={<span>{new Date(err.created_at).toLocaleTimeString()}</span>}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
