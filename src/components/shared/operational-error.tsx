'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OperationalErrorProps {
  title: string
  impact: string
  action: string
  details?: string
  onRetry?: () => void
  className?: string
}

export function OperationalError({
  title,
  impact,
  action,
  details,
  onRetry,
  className,
}: OperationalErrorProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-8 px-4 text-center',
        className,
      )}
    >
      <AlertCircle className="h-5 w-5 text-red-400 mb-3" />
      <p className="text-sm text-zinc-300">{title}</p>
      <p className="text-xs text-zinc-500 mt-1">{impact}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{action}</p>
      {details && (
        <p className="text-[10px] font-mono text-zinc-600 mt-2 max-w-xs truncate">
          {details}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 border border-zinc-800 rounded-md hover:border-zinc-700 transition-colors duration-150"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  )
}
