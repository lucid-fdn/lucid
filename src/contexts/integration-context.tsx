/**
 * Integration Context Provider
 *
 * Assistant-scoped integration data — wraps at the assistant level (not root).
 * Fetches once from /api/assistants/[id]/integrations, caches, and exposes
 * helpers like isConnected('slack') to any child component.
 *
 * Architecture:
 *   - Split into DataContext (fast-changing) and ActionsContext (stable identity)
 *     to prevent re-render storms when only data changes.
 *   - In-flight fetch deduplication via shared promise ref.
 *   - Error state exposed for UI feedback.
 *
 * Usage:
 *   <IntegrationProvider assistantId={id}>
 *     <MyComponent />   // can call useIntegrations()
 *   </IntegrationProvider>
 */

'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { Integration } from '@contracts/integration'

// ---------------------------------------------------------------------------
// Context shapes
// ---------------------------------------------------------------------------

interface IntegrationDataValue {
  integrations: Integration[]
  connectedProviders: string[]
  loading: boolean
  error: string | null
}

interface IntegrationActionsValue {
  /** Whether a specific provider is connected */
  isConnected: (provider: string) => boolean
  /** Get integration details by provider name */
  getIntegration: (provider: string) => Integration | undefined
  /** Re-fetch integration data (silent — no loading spinner) */
  refresh: () => Promise<void>
  /** Optimistically update a single integration's connection status */
  setConnectionStatus: (provider: string, status: 'connected' | 'setup_required', connectionId?: string | null) => void
}

// ---------------------------------------------------------------------------
// Two contexts — data changes frequently, actions are stable
// ---------------------------------------------------------------------------

const IntegrationDataContext = createContext<IntegrationDataValue | undefined>(undefined)
const IntegrationActionsContext = createContext<IntegrationActionsValue | undefined>(undefined)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function IntegrationProvider({
  children,
  assistantId,
  initialIntegrations,
}: {
  children: ReactNode
  assistantId: string
  initialIntegrations?: Integration[]
}) {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations ?? [])
  const [loading, setLoading] = useState(!initialIntegrations)
  const [error, setError] = useState<string | null>(null)

  // Dedup guard — prevent concurrent fetches
  const inflightRef = useRef<Promise<void> | null>(null)

  const fetchIntegrations = useCallback(async (opts?: { silent?: boolean }) => {
    // Dedup: if a fetch is already in flight, return the same promise
    if (inflightRef.current) return inflightRef.current

    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }

    const promise = (async () => {
      try {
        const res = await fetch(`/api/assistants/${assistantId}/integrations`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setIntegrations(data.integrations ?? [])
        setError(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load integrations'
        if (!opts?.silent) {
          setError(msg)
          setIntegrations([])
        }
        // On silent refresh failure, keep stale data but log error
      } finally {
        if (!opts?.silent) setLoading(false)
        inflightRef.current = null
      }
    })()

    inflightRef.current = promise
    return promise
  }, [assistantId])

  // Initial fetch
  useEffect(() => {
    if (initialIntegrations && initialIntegrations.length > 0) return
    fetchIntegrations()
  }, [fetchIntegrations, initialIntegrations])

  // --- Derived data ---
  const connectedProviders = useMemo(
    () => integrations.filter(i => i.connection_status === 'connected').map(i => i.auth_provider),
    [integrations],
  )

  // --- Data value (changes when integrations/loading/error change) ---
  const dataValue = useMemo<IntegrationDataValue>(
    () => ({ integrations, connectedProviders, loading, error }),
    [integrations, connectedProviders, loading, error],
  )

  // --- Stable refs for actions (avoid re-creating callbacks) ---
  const integrationsRef = useRef(integrations)
  useEffect(() => { integrationsRef.current = integrations }, [integrations])

  const isConnected = useCallback(
    (provider: string) => integrationsRef.current.some(
      i => i.auth_provider === provider && i.connection_status === 'connected',
    ),
    [], // stable — reads from ref
  )

  const getIntegration = useCallback(
    (provider: string) => integrationsRef.current.find(i => i.auth_provider === provider),
    [],
  )

  const refresh = useCallback(() => fetchIntegrations({ silent: true }), [fetchIntegrations])

  const setConnectionStatus = useCallback(
    (provider: string, status: 'connected' | 'setup_required', connectionId?: string | null) => {
      setIntegrations(prev => prev.map(i =>
        i.auth_provider === provider
          ? { ...i, connection_status: status, connection_id: connectionId ?? (status === 'setup_required' ? null : i.connection_id) }
          : i,
      ))
    },
    [],
  )

  // --- Actions value (stable identity — callbacks don't change) ---
  const actionsValue = useMemo<IntegrationActionsValue>(
    () => ({ isConnected, getIntegration, refresh, setConnectionStatus }),
    [isConnected, getIntegration, refresh, setConnectionStatus],
  )

  return (
    <IntegrationDataContext.Provider value={dataValue}>
      <IntegrationActionsContext.Provider value={actionsValue}>
        {children}
      </IntegrationActionsContext.Provider>
    </IntegrationDataContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Access integration data + actions. Must be inside IntegrationProvider. */
export function useIntegrations() {
  const data = useContext(IntegrationDataContext)
  const actions = useContext(IntegrationActionsContext)
  if (!data || !actions) throw new Error('useIntegrations must be used within IntegrationProvider')
  return { ...data, ...actions }
}

/** Safe version — returns null when outside IntegrationProvider. */
export function useIntegrationsSafe() {
  const data = useContext(IntegrationDataContext)
  const actions = useContext(IntegrationActionsContext)
  if (!data || !actions) return null
  return { ...data, ...actions }
}
