/**
 * OAuth Context Provider
 *
 * Provides OAuth data from server-side fetch to client components.
 * Eliminates duplicate fetches by using initialOAuth from root layout.
 *
 * Pattern: Server fetch → Context → useOAuth hook (no duplicate fetch!)
 *
 * INDUSTRY STANDARD: Eagerly initializes OAuth service at root level
 * so modal opens instantly without initialization delay.
 */

'use client'

import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react'
import type { OAuthProviderInfo, OAuthConnection } from '@/lib/oauth'
import { getOAuthService } from '@/lib/oauth'

interface OAuthContextValue {
  // Data
  providers: OAuthProviderInfo[]
  connections: OAuthConnection[]

  // State
  loading: boolean
  error: string | null

  // Actions
  setProviders: (providers: OAuthProviderInfo[]) => void
  setConnections: (connections: OAuthConnection[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Flags
  hasInitialData: boolean
}

const OAuthContext = createContext<OAuthContextValue | undefined>(undefined)

/**
 * OAuth Provider Component
 * Wraps app to provide OAuth data from server
 */
export function OAuthProvider({
  children,
  initialOAuth,
}: {
  children: ReactNode
  initialOAuth?: { providers: OAuthProviderInfo[]; connections: OAuthConnection[] }
}) {
  // Initialize state with server data (if available)
  const [providers, setProviders] = useState<OAuthProviderInfo[]>(
    initialOAuth?.providers || []
  )
  const [connections, setConnections] = useState<OAuthConnection[]>(
    initialOAuth?.connections || []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if we have initial data from server
  const hasInitialData = useMemo(
    () => !!initialOAuth && (initialOAuth.providers.length > 0 || initialOAuth.connections.length > 0),
    [initialOAuth]
  )

  // Eagerly initialize OAuth service at root level
  // This ensures the modal opens instantly without initialization delay
  useEffect(() => {
    // Initialize OAuth service immediately on app load
    // This pre-warms the Nango SDK so it's ready when modal opens
    try {
      getOAuthService()
    } catch (err) {
      // Will retry on use
    }
  }, [])

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      providers,
      connections,
      loading,
      error,
      setProviders,
      setConnections,
      setLoading,
      setError,
      hasInitialData,
    }),
    [providers, connections, loading, error, hasInitialData]
  )

  return <OAuthContext.Provider value={value}>{children}</OAuthContext.Provider>
}

/**
 * Hook to access OAuth context
 * Must be used within OAuthProvider
 */
export function useOAuthContext() {
  const context = useContext(OAuthContext)
  if (context === undefined) {
    throw new Error('useOAuthContext must be used within OAuthProvider')
  }
  return context
}

/**
 * Safe version that returns null when outside OAuthProvider
 */
export function useOAuthContextSafe() {
  return useContext(OAuthContext) ?? null
}
