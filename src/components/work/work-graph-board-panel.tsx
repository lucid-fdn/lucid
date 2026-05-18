'use client'

import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, GripVertical, Kanban } from 'lucide-react'

import type { WorkBoardReadModel } from '@/lib/work-graph/types'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface WorkGraphBoardPanelProps {
  orgId: string
  projectId: string
  initialBoards: WorkBoardReadModel[]
}

export function WorkGraphBoardPanel({
  orgId,
  projectId,
  initialBoards,
}: WorkGraphBoardPanelProps) {
  const safeInitialBoards = initialBoards ?? []
  const [boards, setBoards] = useState(safeInitialBoards)
  const [selectedBoardId, setSelectedBoardId] = useState(safeInitialBoards[0]?.id ?? '')
  const [movingItemId, setMovingItemId] = useState<string | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? boards[0] ?? null,
    [boards, selectedBoardId],
  )

  const moveItem = async (workItemId: string, columnId: string) => {
    if (!selectedBoard || movingItemId) return
    const targetColumn = selectedBoard.columns.find((column) => column.id === columnId)
    if (!targetColumn) return

    setMovingItemId(workItemId)
    try {
      const csrf = getCSRFTokenFromCookie()
      const lastRank = targetColumn.items[targetColumn.items.length - 1]?.rank ?? null
      const res = await fetch(`/api/workspaces/${orgId}/projects/${projectId}/work-graph/boards/${selectedBoard.id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          work_item_id: workItemId,
          column_id: columnId,
          after_rank: lastRank,
          metadata: {
            source: 'project_work_board',
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to move work item')
        return
      }

      const data = await res.json() as { board?: WorkBoardReadModel }
      if (data.board) {
        setBoards((current) => current.map((board) => board.id === data.board?.id ? data.board : board))
      }
      toast.success('Work item moved')
    } catch {
      toast.error('Network error while moving work item')
    } finally {
      setMovingItemId(null)
      setDraggedItemId(null)
    }
  }

  if (!selectedBoard) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Kanban className="h-4 w-4" />
          Board
        </div>
        <p className="mt-2 text-sm text-muted-foreground">No Work Graph board is available yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Kanban className="h-4 w-4" />
          Board
        </div>
        {boards.length > 1 ? (
          <Select value={selectedBoard.id} onValueChange={setSelectedBoardId}>
            <SelectTrigger className="h-9 w-full sm:w-64">
              <SelectValue placeholder="Choose board" />
            </SelectTrigger>
            <SelectContent>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="border-border text-muted-foreground">
            {selectedBoard.name}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 overflow-x-auto pb-1 lg:grid-cols-4">
        {selectedBoard.columns.map((column, columnIndex) => (
          <section
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (draggedItemId) void moveItem(draggedItemId, column.id)
            }}
            className="min-h-[220px] min-w-[240px] rounded-lg border bg-muted/20 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">{column.label}</p>
                <p className="text-xs text-muted-foreground">
                  {column.status_filter[0]?.replace('_', ' ') ?? 'custom'}
                </p>
              </div>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {column.items.length}
              </Badge>
            </div>

            <div className="space-y-2">
              {column.items.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Empty
                </div>
              ) : (
                column.items.map((item) => (
                  <article
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggedItemId(item.work_item_id)}
                    onDragEnd={() => setDraggedItemId(null)}
                    className="rounded-md border bg-background p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {item.workItem?.title ?? 'Missing work item'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.workItem?.priority ? (
                            <Badge variant="outline" className="border-border text-muted-foreground">
                              {item.workItem.priority}
                            </Badge>
                          ) : null}
                          {item.workItem?.status ? (
                            <Badge variant="outline" className="border-border text-muted-foreground">
                              {item.workItem.status.replace('_', ' ')}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move left"
                        disabled={columnIndex === 0 || movingItemId === item.work_item_id}
                        onClick={() => {
                          const previous = selectedBoard.columns[columnIndex - 1]
                          if (previous) void moveItem(item.work_item_id, previous.id)
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Move right"
                        disabled={columnIndex === selectedBoard.columns.length - 1 || movingItemId === item.work_item_id}
                        onClick={() => {
                          const next = selectedBoard.columns[columnIndex + 1]
                          if (next) void moveItem(item.work_item_id, next.id)
                        }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
