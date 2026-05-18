'use client'

import { FileCode2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatBrowserDate, formatBrowserLabel, shortId, trustBadgeVariant } from './format'
import type { BrowserProcedureDetail } from './types'

interface BrowserProcedureDetailSheetProps {
  detail: BrowserProcedureDetail | null
  open: boolean
  loading: boolean
  onOpenChange: (open: boolean) => void
}

export function BrowserProcedureDetailSheet({
  detail,
  open,
  loading,
  onOpenChange,
}: BrowserProcedureDetailSheetProps) {
  const procedure = detail?.procedure ?? null
  const latestVersion = detail?.versions[0] ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle>{procedure?.name ?? 'Browser procedure'}</SheetTitle>
          <SheetDescription>
            Versioned routine, fixtures, approval policy, and provenance for Browser Operator reuse.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading procedure detail...</div>
          ) : !procedure ? (
            <div className="p-6 text-sm text-muted-foreground">No procedure selected.</div>
          ) : (
            <div className="space-y-4 p-6">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={trustBadgeVariant(procedure.trustState)}>{formatBrowserLabel(procedure.trustState)}</Badge>
                  <Badge variant="outline">{formatBrowserLabel(procedure.procedureType)}</Badge>
                  <Badge variant="outline">{formatBrowserLabel(procedure.scope)}</Badge>
                  <Badge variant="outline">Run {shortId(procedure.sourceRunId)}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{procedure.description}</p>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <Field label="Host pattern" value={procedure.hostPattern} mono />
                  <Field label="Updated" value={formatBrowserDate(procedure.updatedAt)} />
                  <Field label="Triggers" value={(procedure.intentTriggers ?? []).join(', ') || procedure.slug || 'None recorded'} />
                  <Field label="Procedure id" value={procedure.id} mono />
                </dl>
              </div>

              <div className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Versions</h3>
                  </div>
                  <Badge variant="outline">{detail?.versions.length ?? 0} revisions</Badge>
                </div>
                <div className="divide-y">
                  {detail?.versions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No versions have been stored for this procedure.</div>
                  ) : detail?.versions.map((version) => (
                    <div key={version.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={version.id === latestVersion?.id ? 'default' : 'outline'}>v{version.version}</Badge>
                        <Badge variant="outline">{formatBrowserLabel(version.definitionKind)}</Badge>
                        <Badge variant={version.riskLevel === 'high' ? 'destructive' : version.riskLevel === 'medium' ? 'secondary' : 'outline'}>
                          {formatBrowserLabel(version.riskLevel)} risk
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatBrowserDate(version.createdAt)}</span>
                      </div>
                      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                        <Field label="Content hash" value={version.contentHash} mono />
                        <Field label="Fixture" value={shortId(version.fixtureArtifactId)} mono />
                        <Field label="Capabilities" value={version.capabilities.join(', ') || 'None recorded'} />
                        <Field label="Approval policy" value={JSON.stringify(version.approvalPolicy)} mono />
                      </div>
                      <pre className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed">
                        {JSON.stringify(version.definition, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'mt-1 truncate font-mono text-foreground' : 'mt-1 truncate text-foreground'}>{value || 'None'}</dd>
    </div>
  )
}
