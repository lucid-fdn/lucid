'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function TableSkeleton({ rows = 3, className }: SkeletonProps & { rows?: number }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

export function OrderbookSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
      <div className="h-px bg-border my-2" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  )
}

export function SearchSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-zinc-800/50 p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
