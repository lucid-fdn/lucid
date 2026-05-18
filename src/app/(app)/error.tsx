'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorService } from '@/lib/errors/error-service'
import { AlertCircle, RotateCcw } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { layer: 'app-route-group', digest: error.digest },
      tags: { boundary: 'app-error' },
    })
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
        <h2 className="mb-2 text-xl font-semibold tracking-tight">
          Something went wrong
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          An unexpected error occurred. Our team has been notified.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset} size="sm">
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = '/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
