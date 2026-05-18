'use client'

import { Plus, Search } from 'lucide-react'

interface AssistantsEmptyStateProps {
  emptyTitle: string
  emptyDescription: string
  onCreateAgent: () => void
}

export function AssistantsEmptyState({
  emptyTitle,
  emptyDescription,
  onCreateAgent,
}: AssistantsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <div className="rounded-full border border-border p-4 mb-5">
        <Plus className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-sm font-medium text-foreground mb-1">{emptyTitle}</h2>
      <p className="text-[13px] text-muted-foreground max-w-xs mb-5">
        {emptyDescription}
      </p>
      <button
        onClick={onCreateAgent}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-150"
      >
        <Plus className="h-3.5 w-3.5" />
        Create agent
      </button>
    </div>
  )
}

export function AssistantsNoResults() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm font-medium text-muted-foreground">No matches found</p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        Try adjusting your search or filters
      </p>
    </div>
  )
}
