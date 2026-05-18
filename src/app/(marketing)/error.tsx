'use client'

import { useEffect } from 'react'
import { ErrorService } from '@/lib/errors/error-service'

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { layer: 'marketing-route-group', digest: error.digest },
      tags: { boundary: 'marketing-error' },
    })
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-xl font-semibold tracking-tight">
          Something went wrong
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          We ran into an issue loading this page. Please try again.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
