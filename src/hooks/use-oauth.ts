/**
 * useOAuth Hook
 * 
 * React hook for managing OAuth connections.
 * Follows project patterns: useMemo, useCallback, proper dependency arrays.
 * 
 * Usage:
 *   const { providers, connections, connectProvider, loading } = useOAuth()
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getOAuthService, OAuthProviderInfo, OAuthConnection } from '@/lib/oauth'
import { useOAuthContextSafe } from '@/contexts/oauth-context'

interface UseOAuthReturn {
  // Data
  providers: OAuthProviderInfo[]
  connections: OAuthConnection[]
  
  // State
  loading: boolean
  loadingProviders: Set<string> // Track which specific providers are loading
  error: string | null
  
  // Actions
  connectProvider: (providerId: string) => Promise<{ authUrl: string; providerId: string; connectionId: string }>
  disconnectProvider: (providerId: string, connectionId?: string) => Promise<void>
  refreshConnections: () => Promise<void>
  syncConnection: (providerId: string, connectionId: string) => Promise<void> // Sync connection after OAuth - connectionId is REQUIRED
  
  // Helpers
  isConnected: (providerId: string) => boolean
  getConnection: (providerId: string) => OAuthConnection | undefined
  isProviderLoading: (providerId: string) => boolean
}

/**
 * Hook to manage OAuth providers and connections
 */
export function useOAuth(): UseOAuthReturn {
  const { isAuthenticated: authenticated, user } = useAuth()
  
  // Always call the hook (Rules of Hooks), but gracefully handle missing context
  // Safe version returns null when outside OAuthProvider
  const context = useOAuthContextSafe()
  
  // State - initialize with context data if available
  const [providers, setProviders] = useState<OAuthProviderInfo[]>(
    context?.providers || []
  )
  const [connections, setConnections] = useState<OAuthConnection[]>(
    context?.connections || []
  )
  const [loading, setLoading] = useState(false)
  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Get OAuth service instance (singleton, vendor-agnostic)
  const oauth = useMemo(() => getOAuthService(), [])
  
  // Use ref to store context's setConnections to avoid infinite loops
  // (updating context triggers re-render → useEffect → loadConnections → update context...)
  const setContextConnectionsRef = useRef(context?.setConnections)
  setContextConnectionsRef.current = context?.setConnections

  /**
   * Load available OAuth providers
   * This is public data, doesn't require authentication
   */
  const loadProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await oauth.getProviders()

      setProviders(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load OAuth providers')
    } finally {
      setLoading(false)
    }
  }, [oauth])

  /**
   * Load user's OAuth connections
   * Requires authentication
   * Updates both local state AND context so modal reopens show fresh data
   */
  const loadConnections = useCallback(async () => {
    if (!authenticated || !user?.id) {
      setConnections([])
      // Also update context if available (using ref to avoid infinite loops)
      if (setContextConnectionsRef.current) {
        setContextConnectionsRef.current([])
      }
      return
    }

    try {
      setLoading(true)
      setError(null)

      const data = await oauth.getConnections(user.id)

      // Update local state
      setConnections(data)

      // ALSO update context so modal reopens see fresh data!
      // Using ref to avoid triggering re-render loops
      if (setContextConnectionsRef.current) {
        setContextConnectionsRef.current(data)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load OAuth connections')
    } finally {
      setLoading(false)
    }
  }, [authenticated, user?.id, oauth])

  /**
   * Connect a new OAuth provider
   * Returns OAuth data for component to handle (popup or redirect)
   */
  const connectProvider = useCallback(async (providerId: string) => {
    if (!authenticated || !user?.id) {
      throw new Error('Please log in to connect OAuth providers')
    }

    try {
      // Add this provider to loading set
      setLoadingProviders(prev => new Set(prev).add(providerId))
      setError(null)

      // Use OAuth service to initiate auth flow
      const result = await oauth.initiateAuth(providerId, user.id)

      // Return data for component to handle
      // Component will decide whether to use popup (Nango SDK) or redirect
      // CRITICAL: connectionId MUST be stored and passed to syncConnection
      return {
        authUrl: result.authUrl,
        providerId,
        connectionId: result.connectionId, // CRITICAL: Must store this for sync
        sessionToken: (result as unknown as Record<string, unknown>).sessionToken as string | undefined, // If backend provides it
        state: result.state,
        scopes: result.scopes
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to initiate OAuth connection')
      // Remove from loading set on error
      setLoadingProviders(prev => {
        const next = new Set(prev)
        next.delete(providerId)
        return next
      })
      throw err
    }
  }, [authenticated, user?.id, oauth])

  /**
   * Disconnect an OAuth provider
   * Revokes access and removes connection
   * @param providerId The provider ID (e.g., 'twitter', 'google')
   * @param connectionId Optional: Specific connection ID to disconnect (for multi-account support)
   */
  const disconnectProvider = useCallback(async (providerId: string, connectionId?: string) => {
    if (!authenticated || !user?.id) {
      throw new Error('Please log in to disconnect OAuth providers')
    }

    try {
      // Add this provider to loading set
      setLoadingProviders(prev => new Set(prev).add(providerId))
      setError(null)

      // Per API doc: Always pass connectionId when disconnecting a specific account
      await oauth.disconnect(providerId, user.id, connectionId)

      // Reload connections after disconnect
      await loadConnections()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect OAuth provider')
      throw err
    } finally {
      // Remove from loading set
      setLoadingProviders(prev => {
        const next = new Set(prev)
        next.delete(providerId)
        return next
      })
    }
  }, [authenticated, user?.id, oauth, loadConnections])

  /**
   * Refresh connections list
   * Useful after OAuth callback
   */
  const refreshConnections = useCallback(async () => {
    await loadConnections()
  }, [loadConnections])

  /**
   * Sync connection after OAuth completes.
   * Forwards to Nango backend to confirm the connection is established.
   *
   * @param providerId - The OAuth provider ID (e.g., 'twitter', 'google')
   * @param connectionId - REQUIRED: The connectionId returned from connectProvider/initiate
   */
  const syncConnection = useCallback(async (providerId: string, connectionId: string) => {
    if (!authenticated) {
      throw new Error('Please log in to sync OAuth connections')
    }

    if (!connectionId) {
      throw new Error('connectionId is required for sync - get it from connectProvider response')
    }

    try {
      // Call the sync endpoint to persist connection in database
      // CRITICAL: connectionId must be sent in the body per backend API
      const response = await fetch(`/api/oauth/${providerId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ connectionId }), // CRITICAL: Required by backend
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        // Build detailed error message
        const errorMessage = errorData.details
          ? `Sync failed: ${errorData.details}`
          : errorData.error || 'Failed to sync connection'
        throw new Error(errorMessage)
      }

      // After sync, reload connections to update UI
      await loadConnections()

    } catch (err: unknown) {
      throw err
    }
  }, [authenticated, loadConnections])

  /**
   * Check if a provider is connected
   * Normalizes provider IDs to handle aliases (twitter/x, etc.)
   */
  const isConnected = useCallback((providerId: string): boolean => {
    // Normalize provider ID to handle common aliases
    const normalizeId = (id: string) => {
      const lower = id.toLowerCase()
      // twitter → x (Nango stores it as 'x')
      if (lower === 'twitter' || lower === 'x') return 'x'
      return lower
    }
    
    const normalizedId = normalizeId(providerId)
    
    // Check if connected
    // If isActive is undefined, treat as connected (connection exists = active)
    const connected = connections.some(
      (conn) => normalizeId(conn.provider) === normalizedId && conn.isActive !== false
    )

    return connected
  }, [connections])

  /**
   * Get a specific connection
   */
  const getConnection = useCallback((providerId: string): OAuthConnection | undefined => {
    return connections.find(
      (conn) => conn.provider === providerId && conn.isActive
    )
  }, [connections])

  /**
   * Check if a specific provider is currently loading
   */
  const isProviderLoading = useCallback((providerId: string): boolean => {
    return loadingProviders.has(providerId)
  }, [loadingProviders])

  // Track if we've already loaded data (prevent infinite loops)
  const hasLoadedProvidersRef = useRef(false)
  const hasLoadedConnectionsRef = useRef(false)
  const previousUserIdRef = useRef<string | undefined>(undefined)

  /**
   * Load providers on mount (public data)
   * SKIP if we have server-side data from context or already loaded
   */
  useEffect(() => {
    // Skip if already loaded
    if (hasLoadedProvidersRef.current) {
      return
    }
    
    const hasServerData = context?.hasInitialData && context.providers.length > 0
    
    // Skip fetch if we have server data
    if (hasServerData) {
      setProviders(context!.providers)
      hasLoadedProvidersRef.current = true
      return
    }
    
    // No server data - fetch client-side (mark as loaded to prevent loops)
    hasLoadedProvidersRef.current = true
    loadProviders()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- context would cause infinite loop
  }, [loadProviders]) // Removed 'context' to prevent infinite loop

  /**
   * Load connections when authenticated
   * SKIP if we have server-side data from context or already loaded
   */
  useEffect(() => {
    if (!authenticated || !user?.id) {
      setConnections([])
      hasLoadedConnectionsRef.current = false
      previousUserIdRef.current = undefined
      return
    }
    
    // Reset if user changed
    if (previousUserIdRef.current !== user.id) {
      hasLoadedConnectionsRef.current = false
      previousUserIdRef.current = user.id
    }
    
    // Skip if already loaded for this user
    if (hasLoadedConnectionsRef.current) {
      return
    }
    
    const hasServerData = context?.hasInitialData && context.connections.length > 0
    
    // Skip fetch if we have server data
    if (hasServerData) {
      setConnections(context!.connections)
      hasLoadedConnectionsRef.current = true
      return
    }
    
    // No server data - fetch client-side (mark as loaded to prevent loops)
    hasLoadedConnectionsRef.current = true
    loadConnections()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- context would cause infinite loop
  }, [authenticated, user?.id, loadConnections]) // Removed 'context' to prevent infinite loop

  /**
   * Return memoized value to prevent unnecessary re-renders
   * Following project's React Context patterns
   */
  return useMemo(
    () => ({
      providers,
      connections,
      loading,
      loadingProviders,
      error,
      connectProvider,
      disconnectProvider,
      refreshConnections,
      syncConnection,
      isConnected,
      getConnection,
      isProviderLoading,
    }),
    [
      providers,
      connections,
      loading,
      loadingProviders,
      error,
      connectProvider,
      disconnectProvider,
      refreshConnections,
      syncConnection,
      isConnected,
      getConnection,
      isProviderLoading,
    ]
  )
}

/**
 * Hook to get OAuth provider for a specific node type
 * Combines node detection with OAuth status
 */
export function useNodeOAuth(nodeType: string | undefined) {
  const { connections, loading: oauthLoading } = useOAuth()
  const [nodeProvider, setNodeProvider] = useState<{
    provider: string
    providerName: string
    credentialType: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!nodeType) {
      setNodeProvider(null)
      setLoading(false)
      return
    }

    async function detectNodeOAuth() {
      try {
        // Call API instead of importing server-only code
        const response = await fetch(`/api/oauth/node-detection?action=provider&nodeType=${encodeURIComponent(nodeType!)}`)
        
        if (!response.ok) {
          setNodeProvider(null)
          setLoading(false)
          return
        }

        const data = await response.json()
        const provider = data.provider
        
        if (provider) {
          setNodeProvider({
            provider: provider.provider,
            providerName: provider.providerName,
            credentialType: provider.credentialType,
          })
        } else {
          setNodeProvider(null)
        }
      } catch (_error) {
        setNodeProvider(null)
      } finally {
        setLoading(false)
      }
    }

    detectNodeOAuth()
  }, [nodeType])

  const connection = useMemo(() => {
    if (!nodeProvider) return null
    return connections.find(
      (conn) => conn.provider === nodeProvider.provider && conn.isActive
    )
  }, [nodeProvider, connections])

  return useMemo(
    () => ({
      requiresOAuth: !!nodeProvider,
      provider: nodeProvider,
      connection,
      isConnected: !!connection,
      loading: loading || oauthLoading,
    }),
    [nodeProvider, connection, loading, oauthLoading]
  )
}
