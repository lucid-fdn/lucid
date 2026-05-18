'use client'

import { CheckCircle2, FileSearch, ShieldAlert, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatBrowserDate, formatBrowserLabel, trustBadgeVariant } from './format'
import type { BrowserOperatorProcedure, ProcedureTrustAction } from './types'

interface BrowserProcedureListProps {
  procedures: BrowserOperatorProcedure[]
  busyAction: string | null
  onOpen: (procedure: BrowserOperatorProcedure) => void
  onTrustAction: (procedureId: string, action: ProcedureTrustAction) => void
}
export function BrowserProcedureList({
  procedures,
  busyAction,
  onOpen,
  onTrustAction,
}: BrowserProcedureListProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Procedures</h2>
          <p className="text-xs text-muted-foreground">Reusable browser routines promoted from evidence-bearing runs.</p>
        </div>
        <Badge variant="outline">{procedures.length} total</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Procedure</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Trust</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {procedures.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                No Browser Operator procedures have been promoted yet.
              </TableCell>
            </TableRow>
          ) : procedures.map((procedure) => (
            <TableRow key={procedure.id}>
              <TableCell className="max-w-[260px]">
                <button
                  type="button"
                  className="block min-w-0 text-left"
                  onClick={() => onOpen(procedure)}
                >
                  <span className="block truncate text-sm font-medium text-foreground">{procedure.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{procedure.triggerPreview}</span>
                </button>
              </TableCell>
              <TableCell className="max-w-[180px] truncate font-mono text-xs">{procedure.hostPattern}</TableCell>
              <TableCell>
                <Badge variant={trustBadgeVariant(procedure.trustState)}>{formatBrowserLabel(procedure.trustState)}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatBrowserLabel(procedure.scope)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatBrowserDate(procedure.updatedAt)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1.5">
                  <Button variant="ghost" size="icon" title="Open procedure detail" onClick={() => onOpen(procedure)}>
                    <FileSearch className="h-4 w-4" />
                  </Button>
                  {procedure.trustState !== 'active' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Activate procedure"
                      disabled={busyAction === `browser-procedure:promote:${procedure.id}`}
                      onClick={() => onTrustAction(procedure.id, 'promote')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {procedure.trustState !== 'blocked' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Block procedure"
                      disabled={busyAction === `browser-procedure:block:${procedure.id}`}
                      onClick={() => onTrustAction(procedure.id, 'block')}
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Restore as draft"
                      disabled={busyAction === `browser-procedure:restore_draft:${procedure.id}`}
                      onClick={() => onTrustAction(procedure.id, 'restore_draft')}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
