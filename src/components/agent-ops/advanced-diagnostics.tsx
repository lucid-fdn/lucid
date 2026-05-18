'use client'

import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'

import { CollapsibleSection } from '@/components/panels/collapsible-section'

export function AdvancedDiagnosticsSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string
  description?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <CollapsibleSection
        title={title}
        icon={<Activity className="h-3.5 w-3.5" />}
        defaultOpen={defaultOpen}
        className="border-b-0"
      >
        {description ? <p className="-mt-1 mb-3 text-xs text-muted-foreground">{description}</p> : null}
        <div className="space-y-3">{children}</div>
      </CollapsibleSection>
    </div>
  )
}
