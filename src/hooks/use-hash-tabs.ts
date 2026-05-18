'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * useHashTabs — Drive tab state from the URL hash.
 *
 * Returns [tab, setTab, isMounted]:
 * - `tab` is always `defaultTab` during SSR, then syncs from hash on mount
 * - `isMounted` is false during SSR/hydration, true after — use it to defer
 *   rendering of components that depend on the tab value (avoids hydration mismatch)
 * - Responds to browser back/forward via hashchange listener
 */
export function useHashTabs<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
): [T, (tab: T) => void, boolean] {
  const [activeTab, setActiveTab] = useState<T>(defaultTab)
  const [mounted, setMounted] = useState(false)

  // On mount: read hash and start listening for changes
  useEffect(() => {
    const getTab = (): T => {
      const hash = window.location.hash.replace('#', '') as T
      return validTabs.includes(hash) ? hash : defaultTab
    }

    setActiveTab(getTab())
    setMounted(true)

    const onHashChange = () => setActiveTab(getTab())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [validTabs, defaultTab])

  const setTab = useCallback((tab: T) => {
    setActiveTab(tab)
    window.location.hash = tab === defaultTab ? '' : tab
  }, [defaultTab])

  return [activeTab, setTab, mounted]
}
