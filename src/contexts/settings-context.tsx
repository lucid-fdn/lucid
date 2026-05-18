"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useWorkspace } from './workspace-context'
import { 
  prefetchAllSettings, 
  invalidateSettingsCache,
  type CachedSettingsData 
} from '@/lib/settings/cache'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

interface SettingsContextType {
  settingsData: CachedSettingsData | null
  isLoading: boolean
  refreshSettings: () => Promise<void>
  invalidateCache: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | null>(null)

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

interface SettingsProviderProps {
  children: React.ReactNode
  enabled?: boolean // Only prefetch when modal is open
}

/**
 * SettingsProvider - Industry-standard settings data management
 * 
 * Features:
 * - Prefetches all settings data when enabled (modal opens)
 * - Caches for instant tab switching
 * - Single source of truth for all settings components
 * 
 * Usage:
 * ```tsx
 * <SettingsProvider enabled={isModalOpen}>
 *   <SettingsModal />
 * </SettingsProvider>
 * ```
 */
export function SettingsProvider({ children, enabled = true }: SettingsProviderProps) {
  const { workspace } = useWorkspace()
  const [settingsData, setSettingsData] = useState<CachedSettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Prefetch when enabled and we have an org
  useEffect(() => {
    if (!enabled || !workspace?.org?.id) {
      return
    }

    let isMounted = true

    async function prefetch() {
      setIsLoading(true)
      console.log('[SettingsContext] Prefetching settings', {
        orgId: maskIdentifier(workspace?.org?.id),
      })
      
      try {
        const data = await prefetchAllSettings(workspace!.org!.id)
        
        if (isMounted) {
          setSettingsData(data)
          console.log('[SettingsContext] Settings data loaded:', {
            memberCount: data.members.length,
            hasInviteToken: !!data.inviteToken
          })
        }
      } catch (error) {
        console.error('[SettingsContext] Failed to prefetch settings:', summarizeError(error))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    prefetch()

    return () => {
      isMounted = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [enabled, workspace?.org?.id])

  const refreshSettings = async () => {
    if (!workspace?.org?.id) return

    console.log('[SettingsContext] Refreshing settings')
    setIsLoading(true)

    try {
      const data = await prefetchAllSettings(workspace.org.id)
      setSettingsData(data)
    } catch (error) {
      console.error('[SettingsContext] Failed to refresh settings:', summarizeError(error))
    } finally {
      setIsLoading(false)
    }
  }

  const invalidateCache = async () => {
    if (!workspace?.org?.id) return

    console.log('[SettingsContext] Invalidating settings cache')
    await invalidateSettingsCache(workspace.org.id)
    await refreshSettings()
  }

  return (
    <SettingsContext.Provider
      value={{
        settingsData,
        isLoading,
        refreshSettings,
        invalidateCache
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
