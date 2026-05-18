'use client'

import * as React from 'react'

import { setOAuthFlowActive } from '@/lib/oauth/flow-state'
import { toast } from '@/hooks/use-toast'

interface ConnectableProvider {
  providerId: string
  providerName: string
}

interface OAuthCallbackMessage {
  source: 'lucid-oauth-callback'
  success: boolean
  provider?: string
  errorMessage?: string
}

function isAcceptableOAuthOrigin(eventOrigin: string): boolean {
  try {
    const eventUrl = new URL(eventOrigin)
    const currentUrl = new URL(window.location.origin)

    if (eventUrl.origin === currentUrl.origin) return true

    const localhostHosts = new Set(['localhost', '127.0.0.1'])
    return (
      eventUrl.protocol === currentUrl.protocol
      && localhostHosts.has(eventUrl.hostname)
      && localhostHosts.has(currentUrl.hostname)
    )
  } catch {
    return false
  }
}

export function useOrgOAuthConnector(input: {
  orgId: string
  onConnected?: (providerId: string) => void | Promise<void>
}) {
  const [connectingProviderId, setConnectingProviderId] = React.useState<string | null>(null)
  const [connectedProviderIds, setConnectedProviderIds] = React.useState<Set<string>>(() => new Set())
  const activeFlowRef = React.useRef<{ providerId: string } | null>(null)

  const finish = React.useCallback(() => {
    activeFlowRef.current = null
    setConnectingProviderId(null)
    setOAuthFlowActive(false)
  }, [])

  const verifyConnection = React.useCallback(async (providerId: string) => {
    const response = await fetch('/api/oauth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider: providerId, orgId: input.orgId }),
    })

    const payload = await response.json().catch(() => ({ connected: false }))
    if (!response.ok || !payload.connected) {
      throw new Error(payload?.error || 'Connection verification failed')
    }

    setConnectedProviderIds((current) => {
      const next = new Set(current)
      next.add(providerId)
      return next
    })
    await input.onConnected?.(providerId)
  }, [input])

  React.useEffect(() => {
    const handleOAuthCallback = (event: MessageEvent<OAuthCallbackMessage>) => {
      if (!isAcceptableOAuthOrigin(event.origin)) return
      if (event.data?.source !== 'lucid-oauth-callback') return

      const activeFlow = activeFlowRef.current
      if (!activeFlow) return
      if (event.data.provider && event.data.provider !== activeFlow.providerId) return

      if (!event.data.success) {
        toast.error(event.data.errorMessage || 'Connection failed')
        finish()
        return
      }

      void verifyConnection(activeFlow.providerId)
        .then(() => {
          toast.success('Connection ready')
          finish()
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Connection failed')
          finish()
        })
    }

    window.addEventListener('message', handleOAuthCallback)
    return () => window.removeEventListener('message', handleOAuthCallback)
  }, [finish, verifyConnection])

  const connectProvider = React.useCallback(async (provider: ConnectableProvider) => {
    const popup = window.open(
      '',
      `oauth_${provider.providerId}`,
      'width=600,height=700,popup=yes',
    )

    if (!popup) {
      toast.error('Popup blocked - please allow popups for this site')
      return
    }

    try {
      activeFlowRef.current = { providerId: provider.providerId }
      setConnectingProviderId(provider.providerId)
      setOAuthFlowActive(true)

      const response = await fetch('/api/oauth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: provider.providerId }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.authUrl) {
        throw new Error(payload?.error || 'Failed to start connection')
      }

      popup.location.href = payload.authUrl

      const poll = window.setInterval(() => {
        try {
          if (!popup.closed) return
        } catch {
          return
        }

        window.clearInterval(poll)
        void verifyConnection(provider.providerId)
          .then(() => {
            toast.success(`${provider.providerName} connected`)
            finish()
          })
          .catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Connection failed')
            finish()
          })
      }, 600)
    } catch (error) {
      try {
        popup.close()
      } catch {}
      toast.error(error instanceof Error ? error.message : 'Failed to start connection')
      finish()
    }
  }, [finish, verifyConnection])

  return {
    connectingProviderId,
    connectedProviderIds,
    connectProvider,
  }
}
