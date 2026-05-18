'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

// ── Generic types ─────────────────────────────────────────────────

export interface DetailNavItem {
  id: string
  label: string
  icon?: LucideIcon | React.ReactNode
  badge?: string | number | null
  highlight?: 'emerald' | 'amber' | 'red'
}

export interface DetailNavGroup {
  id: string
  label?: string
  items: DetailNavItem[]
}

export interface DetailIdentity {
  name: string
  statusDot?: string
  statusLabel?: string
}

export interface DetailSidebarRegistration {
  identity: DetailIdentity
  backLabel: string
  onBack?: () => void
  navGroups: DetailNavGroup[]
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  /** Structural fingerprint for navGroups — used internally to skip no-op re-registrations */
  _navKey?: string
}

// ── Contexts ──────────────────────────────────────────────────────

/** Full read context — used by DetailSidebar and SidebarSwitch */
interface DetailSidebarContextValue {
  registration: DetailSidebarRegistration | null
  activeSectionId: string | null
  setActiveSectionId: (id: string | null) => void
  isDetailPage: boolean
}

/** Write-only actions — stable identity, never causes re-renders */
interface DetailSidebarActionsValue {
  register: (data: DetailSidebarRegistration) => void
  unregister: () => void
  setActiveSectionId: (id: string | null) => void
}

/** Minimal read context — only activeSectionId. For components that register
 *  but don't need to read registration data (avoids re-render loops). */
interface ActiveSectionContextValue {
  activeSectionId: string | null
}

const DetailSidebarContext = React.createContext<DetailSidebarContextValue | null>(null)
const DetailSidebarActionsContext = React.createContext<DetailSidebarActionsValue | null>(null)
const ActiveSectionContext = React.createContext<ActiveSectionContextValue | null>(null)

export function DetailSidebarProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = React.useState<DetailSidebarRegistration | null>(null)
  const [activeSectionId, setActiveSectionId] = React.useState<string | null>(null)

  const registrationKeyRef = React.useRef('')
  const register = React.useCallback((data: DetailSidebarRegistration) => {
    // Build a structural key to skip no-op updates and prevent re-render loops
    const key = `${data.identity.name}|${data.identity.statusDot}|${data.identity.statusLabel}|${data.backLabel}|${data.saveStatus}|${data._navKey ?? ''}`
    if (key === registrationKeyRef.current) return
    registrationKeyRef.current = key
    setRegistration(data)
  }, [])

  const unregister = React.useCallback(() => {
    registrationKeyRef.current = ''
    setRegistration(null)
    setActiveSectionId(null)
  }, [])

  const readValue = React.useMemo<DetailSidebarContextValue>(() => ({
    registration, activeSectionId, setActiveSectionId, isDetailPage: registration !== null,
  }), [registration, activeSectionId])

  const actionsValue = React.useMemo<DetailSidebarActionsValue>(() => ({
    register, unregister, setActiveSectionId,
  }), [register, unregister])

  const activeSectionValue = React.useMemo<ActiveSectionContextValue>(() => ({
    activeSectionId,
  }), [activeSectionId])

  return (
    <DetailSidebarActionsContext.Provider value={actionsValue}>
      <ActiveSectionContext.Provider value={activeSectionValue}>
        <DetailSidebarContext.Provider value={readValue}>
          {children}
        </DetailSidebarContext.Provider>
      </ActiveSectionContext.Provider>
    </DetailSidebarActionsContext.Provider>
  )
}

/** Full read — used by DetailSidebar (needs registration to render). */
export function useDetailSidebar() {
  const ctx = React.useContext(DetailSidebarContext)
  if (!ctx) throw new Error('useDetailSidebar must be used within DetailSidebarProvider')
  return ctx
}

/** Full read (optional) — used by SidebarSwitch to check isDetailPage. */
export function useDetailSidebarOptional() {
  return React.useContext(DetailSidebarContext)
}

/** Write-only actions — stable identity, never re-renders on registration change. */
export function useDetailSidebarActions() {
  const ctx = React.useContext(DetailSidebarActionsContext)
  if (!ctx) throw new Error('useDetailSidebarActions must be used within DetailSidebarProvider')
  return ctx
}

export function useDetailSidebarActionsOptional() {
  return React.useContext(DetailSidebarActionsContext)
}

/** Read only activeSectionId — does NOT re-render when registration changes. */
export function useActiveSectionId() {
  return React.useContext(ActiveSectionContext)?.activeSectionId ?? null
}
