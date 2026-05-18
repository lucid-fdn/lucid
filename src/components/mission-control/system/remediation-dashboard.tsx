'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Shield, CheckCircle2, AlertTriangle } from 'lucide-react'
import { EmptyState, PageSection } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface RemediationPolicy {
  id: string
  name: string
  enabled: boolean
  trigger_type: string
  action_type: string
  last_triggered_at: string | null
}

interface RemediationLogEntry {
  id: string
  action_taken: string
  outcome: string | null
  details: Record<string, unknown>
  triggered_at: string
}

interface RemediationDashboardProps {
  policies: RemediationPolicy[]
  log: RemediationLogEntry[]
}

export function RemediationDashboard({ policies, log }: RemediationDashboardProps) {
  return (
    <PageSection
      title="Auto-Remediation"
      actions={<Shield className="h-4 w-4 text-muted-foreground" />}
    >
      {policies.length > 0 ? (
        <div className="space-y-1.5 mb-4">
          {policies.map((p) => (
            <WorkspaceActionRow
              key={p.id}
              title={p.name}
              description={p.trigger_type}
              tone={p.enabled ? 'success' : 'default'}
              meta={p.action_type}
              className="py-2"
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No remediation policies configured"
          description="Default policies are created automatically when you enable auto-remediation."
          className="mb-4 min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
        />
      )}
      {log.length > 0 && (
        <>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Recent Actions
          </h4>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-1">
              {log.map((entry) => (
                <WorkspaceActionRow
                  key={entry.id}
                  title={entry.action_taken}
                  icon={entry.outcome === 'success' ? CheckCircle2 : AlertTriangle}
                  tone={entry.outcome === 'success' ? 'success' : 'warning'}
                  meta={new Date(entry.triggered_at).toLocaleTimeString()}
                  className="py-2"
                />
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </PageSection>
  )
}
