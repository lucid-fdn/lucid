'use client'

import { Button } from '@/components/ui/button'

export default function KnowledgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-primary">Workspace Brain</p>
      <h1 className="text-2xl font-semibold tracking-tight">We could not load this brain space.</h1>
      <p className="text-sm text-muted-foreground">
        This usually means an operating context, source, eval, or memory table is temporarily unavailable. Your agents keep running, and you can retry safely.
      </p>
      <p className="max-w-lg rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
        {error.message || error.digest || 'Unknown load error'}
      </p>
      <Button onClick={reset}>Retry</Button>
    </div>
  )
}
