'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { useIntegrationsSafe } from '@/contexts/integration-context'
import { useWorkspacePlan } from '@/lib/access-control/hooks'
import { setOAuthFlowActive } from '@/lib/oauth/flow-state'
import {
  formatAssistantToolCapMessage,
  getActiveUnifiedSkillToolCount,
  getUnifiedSkillToolCount,
  HARD_MAX_TOOLS_PER_AGENT,
} from '@/lib/plugins/assistant-tool-cap'
import { cn } from '@/lib/utils'

import { BrowseView } from './browse-view'
import { ConnectionCeremony, type CeremonyPhase } from './connection-ceremony'
import { InstalledView } from './installed-view'
import { SkillAdvancedDrawer } from './skill-advanced-drawer'
import { notificationCopy } from '@/lib/notifications/copy'

interface UnifiedSkillManagerProps {
  assistantId?: string
  orgId?: string
  initialItems?: UnifiedSkillItem[]
  onItemsChange?: (items: UnifiedSkillItem[]) => void
  controlledItems?: UnifiedSkillItem[]
  mode?: 'assistant' | 'controlled'
  deferConnectionUntilSelected?: boolean
}

interface OAuthCallbackMessage {
  source: 'lucid-oauth-callback'
  success: boolean
  provider?: string
  error?: string
  errorMessage?: string
}

type OAuthCompletionState = 'pending' | 'success' | 'error' | 'cancelled'

function extractApiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback

  const body = data as Record<string, unknown>
  const error = body.error

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  if (error && typeof error === 'object') {
    const structured = error as Record<string, unknown>
    if (typeof structured.message === 'string' && structured.message.trim().length > 0) {
      return structured.message
    }
  }

  if (typeof body.message === 'string' && body.message.trim().length > 0) {
    return body.message
  }

  return fallback
}

function isAcceptableOAuthOrigin(eventOrigin: string): boolean {
  try {
    const eventUrl = new URL(eventOrigin)
    const currentUrl = new URL(window.location.origin)

    if (eventUrl.origin === currentUrl.origin) return true

    const localhostHosts = new Set(['localhost', '127.0.0.1'])
    return (
      eventUrl.protocol === currentUrl.protocol &&
      localhostHosts.has(eventUrl.hostname) &&
      localhostHosts.has(currentUrl.hostname)
    )
  } catch {
    return false
  }
}

export function UnifiedSkillManager({
  assistantId,
  orgId,
  initialItems,
  onItemsChange,
  controlledItems,
  mode = 'assistant',
  deferConnectionUntilSelected = false,
}: UnifiedSkillManagerProps) {
  const isControlled = mode === 'controlled'
  const [items, setItems] = useState<UnifiedSkillItem[]>(controlledItems ?? initialItems ?? [])
  const [isLoading, setIsLoading] = useState(!isControlled && !initialItems)
  const [isError, setIsError] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [drawerItem, setDrawerItem] = useState<UnifiedSkillItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [ceremony, setCeremony] = useState<{
    provider: string
    providerName: string
    slug: string
    category: string
    alwaysOn: boolean
    section: string
    phase: CeremonyPhase
    failureMessage?: string | null
    itemId: string
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'installed' | 'browse'>(() =>
    (initialItems ?? []).some((item) => item.installed) ? 'installed' : 'browse',
  )

  const integrationCtx = useIntegrationsSafe()
  const { limits } = useWorkspacePlan()

  const onItemsChangeRef = useRef(onItemsChange)
  const itemsRef = useRef(items)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authorizingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeOAuthFlowRef = useRef<{ itemId: string; providerId: string } | null>(null)
  const oauthCompletionRef = useRef<OAuthCompletionState>('pending')

  useEffect(() => {
    onItemsChangeRef.current = onItemsChange
  }, [onItemsChange])

  useEffect(() => {
    if (!isControlled || !controlledItems) return
    setItems(controlledItems)
  }, [controlledItems, isControlled])

  useEffect(() => {
    if (!isControlled) return
    const hasInstalled = items.some((item) => item.installed)
    const hasBrowseable = items.some((item) => !item.installed && item.connection_status !== 'connected')

    if (hasInstalled) {
      setActiveTab('installed')
      return
    }

    if (hasBrowseable) {
      setActiveTab('browse')
    }
  }, [isControlled, items])

  useEffect(() => {
    itemsRef.current = items
    if (!isControlled) {
      onItemsChangeRef.current?.(items)
    }
  }, [isControlled, items])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current)
      if (authorizingTimeoutRef.current) clearTimeout(authorizingTimeoutRef.current)
    }
  }, [])

  const installedCount = useMemo(() => items.filter((item) => item.installed).length, [items])
  const activePluginCount = useMemo(
    () => items.filter((item) => item.item_type === 'plugin' && !item.auth_provider && item.is_active).length,
    [items],
  )
  const maxActivePlugins = Number.isFinite(limits.maxPluginsPerAssistant)
    ? limits.maxPluginsPerAssistant
    : Infinity
  const activeToolCount = useMemo(() => getActiveUnifiedSkillToolCount(items), [items])
  const hasReachedHardToolCap = activeToolCount >= HARD_MAX_TOOLS_PER_AGENT
  const topToolContributors = useMemo(() => (
    items
      .filter((item) => item.item_type === 'plugin' && item.is_active)
      .map((item) => ({
        id: item.id,
        name: item.name,
        toolCount: getUnifiedSkillToolCount(item),
      }))
      .sort((a, b) => b.toolCount - a.toolCount)
      .slice(0, 3)
  ), [items])

  const getProjectedToolCount = useCallback((item: UnifiedSkillItem, nextEnabledTools?: string[]) => {
    if (item.item_type !== 'plugin') {
      return activeToolCount
    }

    const currentItemToolCount = item.is_active ? getUnifiedSkillToolCount(item) : 0
    const nextItemToolCount = nextEnabledTools ? nextEnabledTools.length : getUnifiedSkillToolCount(item)
    return activeToolCount - currentItemToolCount + nextItemToolCount
  }, [activeToolCount])

  const getCapProjectionLabel = useCallback((item: UnifiedSkillItem): string | null => {
    if (item.item_type !== 'plugin' || item.is_active) return null

    const projectedToolCount = getProjectedToolCount(item)
    const addedToolCount = getUnifiedSkillToolCount(item)
    if (addedToolCount <= 0) return null

    return `Adds ${addedToolCount} tool${addedToolCount === 1 ? '' : 's'} • ${projectedToolCount}/${HARD_MAX_TOOLS_PER_AGENT} after enabling`
  }, [getProjectedToolCount])

  const getActivationBlockedReason = useCallback((item: UnifiedSkillItem): string | null => {
    if (item.item_type !== 'plugin' || item.is_active) return null

    const projectedToolCount = getProjectedToolCount(item)
    if (projectedToolCount > HARD_MAX_TOOLS_PER_AGENT) {
      return formatAssistantToolCapMessage(projectedToolCount)
    }

    if (!Number.isFinite(maxActivePlugins)) {
      return null
    }
    if (activePluginCount >= maxActivePlugins) {
      return `This assistant already has the maximum number of active plugins allowed by its current plan (${maxActivePlugins}). Turn one off to enable another.`
    }
    return null
  }, [activePluginCount, getProjectedToolCount, maxActivePlugins])

  const getBrowseLimitMessage = useCallback((item: UnifiedSkillItem): string | null => {
    if (item.item_type !== 'plugin' || item.installed || item.is_active) return null

    const projectedToolCount = getProjectedToolCount(item)
    if (projectedToolCount > HARD_MAX_TOOLS_PER_AGENT) {
      return formatAssistantToolCapMessage(projectedToolCount)
    }

    if (!Number.isFinite(maxActivePlugins)) {
      return null
    }
    if (activePluginCount >= maxActivePlugins) {
      return `This assistant is at its current plan limit (${maxActivePlugins} active plugins). You can still add this plugin now, but you'll need to turn one off before activating it.`
    }
    return null
  }, [activePluginCount, getProjectedToolCount, maxActivePlugins])

  const clearOAuthTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
    if (authorizingTimeoutRef.current) {
      clearTimeout(authorizingTimeoutRef.current)
      authorizingTimeoutRef.current = null
    }
  }, [])

  const resetOAuthFlow = useCallback(() => {
    clearOAuthTimers()
    activeOAuthFlowRef.current = null
    oauthCompletionRef.current = 'pending'
    setOAuthFlowActive(false)
    setConnectingId(null)
  }, [clearOAuthTimers])

  const getInterruptedOAuthMessage = useCallback((providerName: string) => (
    `Your ${providerName} account may have been created, but authorization did not finish. Reopen Connect and complete the final approval step.`
  ), [])

  const fetchItems = useCallback(async (opts?: { silent?: boolean }) => {
    if (isControlled || !assistantId) {
      setIsLoading(false)
      return
    }
    if (!opts?.silent) {
      setIsLoading(true)
      setIsError(false)
    }

    try {
      const res = await fetch(`/api/assistants/${assistantId}/unified-skills`)
      if (!res.ok) throw new Error('Failed to load skills')

      const data = await res.json()
      const serverItems: UnifiedSkillItem[] = data.items ?? []

      if (opts?.silent) {
        setItems((prev) => {
          const optimisticConnections = new Map<string, string | null>()
          for (const item of prev) {
            if (item.auth_provider && item.connection_status === 'connected') {
              optimisticConnections.set(item.auth_provider, item.connection_id)
            }
          }

          return serverItems.map((item) => {
            if (item.auth_provider && item.connection_status === 'setup_required') {
              const optimisticConnectionId = optimisticConnections.get(item.auth_provider)
              if (optimisticConnections.has(item.auth_provider)) {
                return {
                  ...item,
                  connection_status: 'connected' as const,
                  connection_id: optimisticConnectionId ?? item.connection_id,
                }
              }
            }
            return item
          })
        })
        return
      }

      setItems(serverItems)
    } catch (error) {
      console.error('[FetchItems] Failed:', error)
      if (!opts?.silent) {
        setIsError(true)
        toast.error('Failed to load skills')
      }
    } finally {
      if (!opts?.silent) {
        setIsLoading(false)
      }
    }
  }, [assistantId, isControlled])

  useEffect(() => {
    if (isControlled) return
    if (initialItems && initialItems.length > 0) return
    void fetchItems()
  }, [fetchItems, initialItems, isControlled])

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchQuery(value), 300)
  }, [])

  const verifyOAuthConnection = useCallback(async (providerId: string) => {
    try {
      const verifyRes = await fetch('/api/oauth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: providerId, assistantId }),
      })

      const verifyData = await verifyRes.json().catch(() => ({ connected: false }))

      if (verifyData.connected) {
        setItems((prev) => prev.map((item) =>
          item.auth_provider === providerId
            ? {
                ...item,
                connection_status: 'connected' as const,
                connection_id: verifyData.connectionId ?? item.connection_id,
                is_active: true,
              }
            : item,
        ))

        integrationCtx?.setConnectionStatus(providerId, 'connected', verifyData.connectionId)
        integrationCtx?.refresh()

        const item = itemsRef.current.find((candidate) => candidate.auth_provider === providerId)
        if (item?.installation_id && !item.is_active) {
          fetch(`/api/assistants/${assistantId}/plugins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installationId: item.installation_id }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.activation?.id) {
                setItems((prev) => prev.map((candidate) =>
                  candidate.auth_provider === providerId
                    ? { ...candidate, activation_id: data.activation.id }
                    : candidate,
                ))
              }
            })
            .catch((error) => {
              console.error('[OAuth] Activation failed:', error)
            })
        }

        setCeremony((prev) => (prev ? { ...prev, phase: 'ready' } : null))
        toast.success(notificationCopy.common.accountConnected)
        return
      }

      setCeremony((prev) => (prev ? { ...prev, phase: 'failed' } : null))
      toast.error('Connection verification failed')
    } catch (error) {
      console.error('[OAuth] Verify crashed:', error)
      setCeremony((prev) => (prev ? { ...prev, phase: 'failed' } : null))
      void fetchItems({ silent: true })
    } finally {
      resetOAuthFlow()
    }
  }, [assistantId, fetchItems, integrationCtx, resetOAuthFlow])

  const waitForOAuthVerification = useCallback(async (providerId: string) => {
    const maxAttempts = 5
    const delayMs = 2000

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const verifyRes = await fetch('/api/oauth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ provider: providerId, assistantId }),
        })
        const verifyData = await verifyRes.json().catch(() => ({ connected: false }))

        console.log('[OAuth] Close verification attempt', { providerId, attempt, status: verifyRes.status, verifyData })

        if (verifyData.connected) {
          oauthCompletionRef.current = 'success'
          await verifyOAuthConnection(providerId)
          return true
        }
      } catch (error) {
        console.error('[OAuth] Close verification attempt failed:', { providerId, attempt, error })
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    return false
  }, [assistantId, verifyOAuthConnection])

  const reconcileConnectedState = useCallback(async (providerId: string) => {
    try {
      const res = await fetch(`/api/assistants/${assistantId}/unified-skills`)
      if (!res.ok) return false

      const data = await res.json()
      const refreshedItems: UnifiedSkillItem[] = data.items ?? []
      setItems(refreshedItems)

      const providerItem = refreshedItems.find((item) => item.auth_provider === providerId)
      if (providerItem?.connection_status === 'connected' || providerItem?.is_active) {
        integrationCtx?.setConnectionStatus(providerId, 'connected', providerItem.connection_id ?? undefined)
        integrationCtx?.refresh()
        setCeremony((prev) => (prev ? { ...prev, phase: 'ready' } : null))
        toast.success(notificationCopy.common.accountConnected)
        resetOAuthFlow()
        return true
      }
    } catch (error) {
      console.error('[OAuth] Reconcile connected state failed:', error)
    }

    return false
  }, [assistantId, integrationCtx, resetOAuthFlow])

  useEffect(() => {
    const handleOAuthCallback = (event: MessageEvent<OAuthCallbackMessage>) => {
      if (!isAcceptableOAuthOrigin(event.origin)) return
      if (event.data?.source !== 'lucid-oauth-callback') return

      const activeFlow = activeOAuthFlowRef.current
      if (!activeFlow) return
      if (event.data.provider && event.data.provider !== activeFlow.providerId) return

      oauthCompletionRef.current = event.data.success ? 'success' : 'error'
      clearOAuthTimers()

      if (!event.data.success) {
        setConnectingId(null)
        setCeremony((prev) => (prev ? {
          ...prev,
          phase: 'failed',
          failureMessage: event.data.errorMessage || 'The provider returned an error before authorization completed.',
        } : null))
        toast.error(event.data.errorMessage || 'Connection failed')
        resetOAuthFlow()
        return
      }

      setConnectingId(null)
      setCeremony((prev) => (prev ? { ...prev, phase: 'connecting' } : null))
      void verifyOAuthConnection(activeFlow.providerId)
    }

    window.addEventListener('message', handleOAuthCallback)
    return () => {
      window.removeEventListener('message', handleOAuthCallback)
    }
  }, [clearOAuthTimers, resetOAuthFlow, verifyOAuthConnection])

  const openOAuthPopup = useCallback(async (itemId: string, providerId: string) => {
    const matchingItem = itemsRef.current.find((item) => item.id === itemId)
    const providerDisplayName = matchingItem?.name || providerId.charAt(0).toUpperCase() + providerId.slice(1)
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      '',
      `oauth_${providerId}`,
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    )

    if (!popup) {
      toast.error('Popup blocked - please allow popups for this site')
      resetOAuthFlow()
      setCeremony((prev) => (prev ? {
        ...prev,
        phase: 'failed',
        failureMessage: 'The popup was blocked before authorization could start.',
      } : null))
      return
    }

    try {
      resetOAuthFlow()
      activeOAuthFlowRef.current = { itemId, providerId }
      oauthCompletionRef.current = 'pending'
      setOAuthFlowActive(true)
      setConnectingId(itemId)
      setCeremony({
        provider: providerId,
        providerName: providerDisplayName,
        slug: matchingItem?.slug ?? providerId,
        category: matchingItem?.category ?? 'skills',
        alwaysOn: matchingItem?.always_on ?? false,
        section: matchingItem?.section ?? 'installed',
        phase: 'authorizing',
        failureMessage: null,
        itemId,
      })

      const sessionRes = await fetch('/api/oauth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: providerId }),
      })

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create OAuth session')
      }

      const sessionData = await sessionRes.json()
      const { authUrl } = sessionData
      popup.location.href = authUrl

      clearOAuthTimers()

      authorizingTimeoutRef.current = setTimeout(() => {
        const activeFlow = activeOAuthFlowRef.current
        if (!activeFlow || activeFlow.itemId !== itemId || oauthCompletionRef.current !== 'pending') {
          return
        }

        const interruptedMessage = getInterruptedOAuthMessage(providerDisplayName)
        setConnectingId(null)
        setCeremony((prev) => (prev ? {
          ...prev,
          phase: 'failed',
          failureMessage: interruptedMessage,
        } : null))
        toast.error(interruptedMessage)
        resetOAuthFlow()

        try {
          popup.close()
        } catch {
          // Ignore popup-close failures for cross-origin windows.
        }
      }, 90_000)

      pollRef.current = setInterval(() => {
        try {
          if (!popup.closed) return
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }

          if (oauthCompletionRef.current === 'success' || oauthCompletionRef.current === 'error') {
            return
          }

          setConnectingId(null)
          setCeremony((prev) => (prev ? { ...prev, phase: 'connecting' } : null))
          pollTimeoutRef.current = setTimeout(() => {
            pollTimeoutRef.current = null

            if (oauthCompletionRef.current === 'error') {
              return
            }

            if (oauthCompletionRef.current === 'success') {
              const activeFlow = activeOAuthFlowRef.current
              if (activeFlow) {
                void verifyOAuthConnection(activeFlow.providerId)
              }
              return
            }

            oauthCompletionRef.current = 'cancelled'
            const activeFlow = activeOAuthFlowRef.current
            if (!activeFlow) {
              resetOAuthFlow()
              return
            }

            void (async () => {
              const connected = await waitForOAuthVerification(activeFlow.providerId)
              if (connected) return

              const reconciled = await reconcileConnectedState(activeFlow.providerId)
              if (reconciled) return

              const interruptedMessage = getInterruptedOAuthMessage(providerDisplayName)
              setCeremony((prev) => (prev ? {
                ...prev,
                phase: 'failed',
                failureMessage: interruptedMessage,
              } : null))
              toast.error(interruptedMessage)
              resetOAuthFlow()
            })()
          }, 500)
        } catch {
          // Ignore cross-origin access until the popup closes.
        }
      }, 500)

      safetyTimeoutRef.current = setTimeout(() => {
        console.warn('[OAuth] Safety timeout reached')
        const timeoutMessage = `We never received the final ${providerDisplayName} authorization confirmation. Reopen Connect to finish setup.`
        setCeremony((prev) => (prev ? {
          ...prev,
          phase: 'failed',
          failureMessage: timeoutMessage,
        } : null))
        toast.error(timeoutMessage)
        resetOAuthFlow()
      }, 600_000)
    } catch (error) {
      try {
        popup.close()
      } catch {
        // Ignore popup-close failures for cross-origin windows.
      }
      console.error('[OAuth] Failed to start flow:', error)
      const msg = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to start OAuth flow: ${msg}`)
      resetOAuthFlow()
      setCeremony((prev) => (prev ? {
        ...prev,
        phase: 'failed',
        failureMessage: msg,
      } : null))
    }
  }, [clearOAuthTimers, getInterruptedOAuthMessage, reconcileConnectedState, resetOAuthFlow, verifyOAuthConnection, waitForOAuthVerification])

  const handleToggle = useCallback(async (item: UnifiedSkillItem, active: boolean) => {
    const blockedReason = getActivationBlockedReason(item)
    if (active && blockedReason) {
      toast.error(blockedReason)
      return
    }

    if (isControlled) {
      const nextItems = items.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              is_active: active,
              installed: active ? true : candidate.installed,
            }
          : candidate,
      )
      setItems(nextItems)
      onItemsChangeRef.current?.(nextItems)
      return
    }

    setBusyId(item.id)
    setItems((prev) => prev.map((candidate) => candidate.id === item.id ? { ...candidate, is_active: active } : candidate))

    try {
      const endpoint = `/api/assistants/${assistantId}/plugins`

      if (active && item.installation_id) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installationId: item.installation_id }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to activate skill' }))
          const message = extractApiErrorMessage(data, 'Failed to activate skill')
          throw new Error(message)
        }
        const data = await res.json()
        setItems((prev) =>
          prev.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, is_active: true, activation_id: data.activation?.id ?? candidate.activation_id }
              : candidate,
          ),
        )
      } else if (!active && item.activation_id) {
        const res = await fetch(endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activationId: item.activation_id }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to deactivate skill' }))
          const message = extractApiErrorMessage(data, 'Failed to deactivate skill')
          throw new Error(message)
        }
        setItems((prev) =>
          prev.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, is_active: false, activation_id: null }
              : candidate,
          ),
        )
      }
    } catch (error) {
      setItems((prev) => prev.map((candidate) => candidate.id === item.id ? { ...candidate, is_active: !active } : candidate))
      toast.error(error instanceof Error ? error.message : 'Failed to update skill')
    } finally {
      setBusyId(null)
    }
  }, [assistantId, getActivationBlockedReason, isControlled])

  const handleInstall = useCallback(async (item: UnifiedSkillItem) => {
    if (isControlled) {
      const nextItems = items.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, installed: true, is_active: true }
          : candidate,
      )
      setItems(nextItems)
      onItemsChangeRef.current?.(nextItems)
      return
    }

    setBusyId(item.id)
    try {
      const res = await fetch(`/api/orgs/${orgId}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: item.id }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Install failed' }))
        const errMsg = extractApiErrorMessage(data, 'Failed to install skill')
        toast.error(errMsg)
        return
      }

      const data = await res.json()
      setItems((prev) =>
        prev.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, installed: true, installation_id: data.installation?.id ?? null }
            : candidate,
        ),
      )

      if (item.auth_provider) {
        setBusyId(null)
        await openOAuthPopup(item.id, item.auth_provider)
        return
      }

      toast.success(`${item.name} added`)
    } catch (error) {
      console.error('[Install] Failed:', error)
      toast.error('Failed to install skill')
    } finally {
      setBusyId(null)
    }
  }, [isControlled, openOAuthPopup, orgId])

  const handleUninstall = useCallback(async (item: UnifiedSkillItem) => {
    if (isControlled) {
      const nextItems = items.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, installed: false, is_active: false, installation_id: null, activation_id: null }
          : candidate,
      )
      setItems(nextItems)
      onItemsChangeRef.current?.(nextItems)
      return
    }

    setBusyId(item.id)
    try {
      const res = await fetch(`/api/orgs/${orgId}/plugins`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId: item.id }),
      })

      if (!res.ok) throw new Error()

      setItems((prev) =>
        prev.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, installed: false, is_active: false, installation_id: null, activation_id: null }
            : candidate,
        ),
      )
      toast.success(`${item.name} removed`)
    } catch {
      toast.error('Failed to remove skill')
    } finally {
      setBusyId(null)
    }
  }, [isControlled, orgId])

  const handleToolToggle = useCallback(async (item: UnifiedSkillItem, enabledTools: string[]) => {
    if (!item.activation_id) return

    const projectedToolCount = getProjectedToolCount(item, enabledTools)
    if (projectedToolCount > HARD_MAX_TOOLS_PER_AGENT) {
      toast.error(formatAssistantToolCapMessage(projectedToolCount))
      return
    }

    setBusyId(item.id)
    try {
      const res = await fetch(`/api/assistants/${assistantId}/plugins`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationId: item.activation_id, enabledTools }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save tool configuration' }))
        throw new Error(extractApiErrorMessage(data, 'Failed to save tool configuration'))
      }

      setItems((prev) =>
        prev.map((candidate) =>
          candidate.id === item.id ? { ...candidate, enabled_tools: enabledTools } : candidate,
        ),
      )
      setDrawerItem(null)
      toast.success('Tool configuration saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save tool configuration')
    } finally {
      setBusyId(null)
    }
  }, [assistantId, getProjectedToolCount])

  const handleConnect = useCallback(async (item: UnifiedSkillItem) => {
    if (!item.auth_provider) return
    await openOAuthPopup(item.id, item.auth_provider)
  }, [openOAuthPopup])

  const handleConnectionChange = useCallback(async (item: UnifiedSkillItem, connectionRowId: string) => {
    if (!assistantId || !item.auth_provider) return
    const selectedConnection = item.connection_options?.find((connection) => connection.id === connectionRowId)
    if (!selectedConnection) return

    setBusyId(item.id)
    const previousItems = itemsRef.current
    setItems((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              connection_status: 'connected' as const,
              connection_row_id: selectedConnection.id,
              selected_connection_row_id: selectedConnection.id,
              connection_id: selectedConnection.connection_id,
              connection_account_label: selectedConnection.account_label,
            }
          : candidate,
      ),
    )

    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/assistants/${assistantId}/app-bindings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          plugin_id: item.id,
          org_connection_id: connectionRowId,
          enabled_actions: item.enabled_tools,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to switch account' }))
        throw new Error(extractApiErrorMessage(data, 'Failed to switch account'))
      }

      integrationCtx?.setConnectionStatus(item.auth_provider, 'connected', selectedConnection.connection_id)
      toast.success(`Using ${selectedConnection.account_label ?? selectedConnection.account_id ?? item.name}`)
    } catch (error) {
      setItems(previousItems)
      toast.error(error instanceof Error ? error.message : 'Failed to switch account')
    } finally {
      setBusyId(null)
    }
  }, [assistantId, integrationCtx])

  const handleDisconnect = useCallback(async (item: UnifiedSkillItem) => {
    if (!item.auth_provider) return

    setBusyId(item.id)
    setItems((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, connection_status: 'setup_required' as const, connection_id: null }
          : candidate,
      ),
    )

    try {
      const res = await fetch(`/api/oauth/${encodeURIComponent(item.auth_provider)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: item.connection_id, assistantId }),
      })

      if (!res.ok) {
        setItems((prev) =>
          prev.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, connection_status: 'connected' as const, connection_id: item.connection_id }
              : candidate,
          ),
        )
        toast.error(notificationCopy.common.failedToDisconnect)
        return
      }

      integrationCtx?.setConnectionStatus(item.auth_provider, 'setup_required')
      integrationCtx?.refresh()
      toast.success(`${item.name} disconnected`)
    } catch (error) {
      console.error('[Disconnect] Failed:', error)
      setItems((prev) =>
        prev.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, connection_status: 'connected' as const, connection_id: item.connection_id }
            : candidate,
        ),
      )
      toast.error(notificationCopy.common.failedToDisconnect)
    } finally {
      setBusyId(null)
    }
  }, [assistantId, integrationCtx])

  const isItemBusy = useCallback((id: string) => busyId === id || connectingId === id, [busyId, connectingId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <AlertCircle className="h-6 w-6 text-muted-foreground/70" />
        <p className="text-xs text-muted-foreground">Failed to load skills</p>
        <button
          type="button"
          onClick={() => void fetchItems()}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors duration-120 hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="mb-1">
        <p className="text-[11px] text-muted-foreground">Add capabilities to this agent</p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
        <div>
          <p className="text-[11px] font-medium text-foreground">Tool usage</p>
          <p className="text-[10px] text-muted-foreground">
            Active tools across enabled plugins for this agent
          </p>
        </div>
        <div className={cn(
          'rounded-full border px-2.5 py-1 text-[11px] font-medium',
          hasReachedHardToolCap
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            : 'border-border bg-background text-foreground',
        )}>
          {activeToolCount} / {HARD_MAX_TOOLS_PER_AGENT} tools
        </div>
      </div>

      {hasReachedHardToolCap && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-100">Tool cap reached</p>
            <p>{formatAssistantToolCapMessage(activeToolCount)} ({activeToolCount}/{HARD_MAX_TOOLS_PER_AGENT})</p>
            {topToolContributors.length > 0 && (
              <p className="mt-1 text-amber-100/90">
                Biggest contributors: {topToolContributors.map((item) => `${item.name} (${item.toolCount})`).join(', ')}.
              </p>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className="mt-2 text-[10px] font-medium text-amber-100 underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              Review active tools to turn some off
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search skills, tools, integrations..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-transparent py-0 pr-3 pl-8 text-xs text-zinc-300 placeholder:text-zinc-700 transition-colors duration-120 h-8 focus:border-zinc-600 focus:outline-none"
            aria-label="Search skills"
          />
        </div>

        <div className="flex shrink-0 items-center rounded-lg border border-border bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('installed')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all duration-120',
              activeTab === 'installed'
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Agent Skills
            {installedCount > 0 && (
              <span className={cn('ml-1.5 text-[10px]', activeTab === 'installed' ? 'text-zinc-400' : 'text-zinc-600')}>
                {installedCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all duration-120',
              activeTab === 'browse'
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Browse
          </button>
        </div>
      </div>

      {activeTab === 'installed' ? (
        <InstalledView
          items={items}
          searchQuery={searchQuery}
          getActivationBlockedReason={getActivationBlockedReason}
          getCapProjectionLabel={getCapProjectionLabel}
          onToggle={handleToggle}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          onConfigure={setDrawerItem}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          busyId={busyId}
          connectingId={connectingId}
          deferConnectionUntilSelected={deferConnectionUntilSelected}
        />
      ) : (
        <BrowseView
          items={items}
          searchQuery={searchQuery}
          getActivationBlockedReason={getBrowseLimitMessage}
          getCapProjectionLabel={getCapProjectionLabel}
          onInstall={handleInstall}
          busyId={busyId}
          connectingId={connectingId}
          deferConnectionUntilSelected={deferConnectionUntilSelected}
        />
      )}

      {drawerItem && (
        <SkillAdvancedDrawer
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
          onToolToggle={handleToolToggle}
          onConnectionChange={handleConnectionChange}
          isSaving={isItemBusy(drawerItem.id)}
        />
      )}

      {ceremony && (
        <ConnectionCeremony
          provider={ceremony.provider}
          providerName={ceremony.providerName}
          slug={ceremony.slug}
          category={ceremony.category}
          alwaysOn={ceremony.alwaysOn}
          section={ceremony.section}
          phase={ceremony.phase}
          failureMessage={ceremony.failureMessage}
          onCancel={() => {
            setCeremony(null)
            resetOAuthFlow()
          }}
          onRetry={() => {
            const { provider, itemId } = ceremony
            setCeremony(null)
            resetOAuthFlow()
            void openOAuthPopup(itemId, provider)
          }}
          onDismiss={() => setCeremony(null)}
        />
      )}
    </div>
  )
}
