'use client'

import { Loader2 } from 'lucide-react'

interface LoadingRedirectProps {
  message?: string
}

/**
 * LoadingRedirect - Full-page loading state for auth transitions
 * 
 * Industry standard pattern for:
 * - Logout/Sign-off
 * - Account deletion
 * - Auth redirects
 * 
 * Prevents FOUC by showing consistent loading state
 * 
 * @example
 * <LoadingRedirect message="Signing out..." />
 */
export function LoadingRedirect({ message = 'Redirecting...' }: LoadingRedirectProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
