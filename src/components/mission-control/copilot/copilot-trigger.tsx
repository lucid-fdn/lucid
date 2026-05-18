'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MessageCircle, X } from 'lucide-react'
import { CopilotPanel } from './copilot-panel'
import { useWorkspace } from '@/contexts/workspace-context'

interface CopilotTriggerProps {
  orgId: string
  workspaceName?: string
}

export function CopilotTrigger({ orgId, workspaceName }: CopilotTriggerProps) {
  const [open, setOpen] = useState(false)

  // Fall back to workspace context if workspaceName not passed as prop
  const { workspace } = useWorkspace()
  const resolvedWorkspaceName =
    workspaceName || workspace?.org?.name || 'Workspace'

  return (
    <>
      {/* FAB */}
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        aria-label={open ? 'Close Mission Control copilot' : 'Open Mission Control copilot'}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg',
          open && 'bg-destructive hover:bg-destructive/90',
        )}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </Button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-96 h-[500px] rounded-lg border bg-background shadow-2xl flex flex-col overflow-hidden">
          <CopilotPanel
            orgId={orgId}
            workspaceName={resolvedWorkspaceName}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  )
}
