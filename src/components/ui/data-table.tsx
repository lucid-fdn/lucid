'use client'

/**
 * DataTable — Shared table built on TanStack React Table + shadcn primitives.
 *
 * Provides sorting, pagination, empty/loading states out of the box.
 * Composable: pass column definitions and data, get a production table.
 *
 * Usage:
 *   const columns: ColumnDef<Agent>[] = [
 *     { accessorKey: 'name', header: 'Name' },
 *     { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge>{row.original.status}</Badge> },
 *   ]
 *   <DataTable columns={columns} data={agents} />
 */

import {
  type ColumnDef,
  type SortingState,
  type Row,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState, type ReactNode } from 'react'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Show loading skeleton rows (default: false) */
  isLoading?: boolean
  /** Rows per page. 0 = no pagination (default: 0) */
  pageSize?: number
  /** Custom empty state */
  emptyState?: ReactNode
  /** Simple empty message (default: "No results.") */
  emptyMessage?: string
  /** Row click handler */
  onRowClick?: (row: TData) => void
  /** Custom row className */
  rowClassName?: string | ((row: Row<TData>) => string)
  /** Table container className */
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  pageSize = 0,
  emptyState,
  emptyMessage = 'No results.',
  onRowClick,
  rowClassName,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pageSize > 0 && {
      getPaginationRowModel: getPaginationRowModel(),
      initialState: { pagination: { pageSize } },
    }),
    onSortingChange: setSorting,
    state: { sorting },
  })

  const colSpan = columns.length

  return (
    <div className={cn('space-y-2', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // Skeleton rows
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {Array.from({ length: colSpan }).map((_, j) => (
                  <TableCell key={`skeleton-${i}-${j}`}>
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={cn(
                  onRowClick && 'cursor-pointer',
                  typeof rowClassName === 'function' ? rowClassName(row) : rowClassName,
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-24 text-center">
                {emptyState || (
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {pageSize > 0 && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Cell Formatters ─────────────────────────────────────────────────────────

/** Render a date string as relative or absolute time */
export function dateCell(value: string | null | undefined, options?: { relative?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  const date = new Date(value)
  if (options?.relative) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return <span className="text-sm">{seconds}s ago</span>
    if (seconds < 3600) return <span className="text-sm">{Math.floor(seconds / 60)}m ago</span>
    if (seconds < 86400) return <span className="text-sm">{Math.floor(seconds / 3600)}h ago</span>
    return <span className="text-sm">{Math.floor(seconds / 86400)}d ago</span>
  }
  return <span className="text-sm">{date.toLocaleDateString()}</span>
}

/** Render a truncated hash/address with copy-on-click */
export function truncateCell(value: string | null | undefined, chars = 6) {
  if (!value) return <span className="text-muted-foreground">—</span>
  if (value.length <= chars * 2 + 2) return <span className="text-sm font-mono">{value}</span>
  return (
    <span className="text-sm font-mono" title={value}>
      {value.slice(0, chars)}...{value.slice(-chars)}
    </span>
  )
}

// Re-export types for convenience
export type { ColumnDef, SortingState, Row } from '@tanstack/react-table'
