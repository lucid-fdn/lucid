'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react'
import { useAuth } from './auth-context'

/**
 * Workspace: The complete scope for all operations
 * Hierarchy: Profile → Organization → Project → Environment
 * 
 * MVP: Project + Env are hidden until first project is created
 * Future: Expose multi-project/env switchers with feature flags
 */

interface Organization {
  id: string
  name: string
  slug: string
  type?: string
}

interface Project {
  id: string
  org_id: string
  name: string
  slug: string
  is_default: boolean
  agent_count?: number
  counts?: {
    assistants: number
    crews: number
    workflows: number
    templates: number
  }
}

interface Environment {
  id: string
  project_id: string
  name: 'production' | 'development' | 'staging'
  is_default: boolean
  config?: Record<string, unknown>
}

interface UserPreferences {
  sidebar_collapsed: boolean
  theme: 'light' | 'dark' | 'system'
  language: string
  compact_mode: boolean
  show_onboarding: boolean
}

interface Subscription {
  subscription_id: string
  org_id: string
  plan_id: string
  plan_name: 'starter' | 'pro' | 'business'
  plan_display_name: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
  billing_period: 'monthly' | 'yearly'
  payment_method: 'stripe_card' | 'stripe_paypal' | 'crypto'
  current_period_start: string
  current_period_end: string
  features: Record<string, boolean>
  limits: Record<string, number>
}

interface Workspace {
  org: Organization
  project: Project | null
  projects?: Project[]
  env: Environment | null
  role?: string  // ✅ FIX: User's role in the organization
  favorites?: unknown[]
  preferences?: UserPreferences
  subscription?: Subscription | null
}

interface WorkspaceContextType {
  workspace: Workspace | null
  loading: boolean
  switchOrg: (orgId: string) => void
  switchProject: (projectId: string) => void
  refetch: () => void
  
  // Future: Expose when multi-project UI enabled
  // switchEnv: (envName: string) => void
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

interface WorkspaceProviderProps {
  children: ReactNode
  initialOrg?: Organization
  /** Full workspace data from server — skips client-side /api/workspace fetch when provided */
  initialWorkspace?: Workspace
}

/**
 * WorkspaceProvider - Manages org/project/env hierarchy
 * 
 * How it works:
 * - Fetches org + current primary project + env on mount
 * - Stores in context for all components
 * - Updates when user switches org
 * - Hidden project/env (always use defaults for MVP)
 * 
 * Future:
 * - Add switchProject() / switchEnv() when feature flags enabled
 * - Persist selection in localStorage
 * - Add URL params for sharing
 */
export function WorkspaceProvider({ children, initialOrg, initialWorkspace }: WorkspaceProviderProps) {
  const { ready, user, isAuthenticated } = useAuth()
  const [workspace, setWorkspace] = useState<Workspace | null>(initialWorkspace || null)
  const [loading, setLoading] = useState(!initialWorkspace)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(
    initialWorkspace?.org.id || initialOrg?.id || null
  )
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    initialWorkspace?.project?.id || null,
  )

  const fetchWorkspace = useCallback(async (orgId: string, projectId?: string | null) => {
    if (!isAuthenticated) {
      setWorkspace(null)
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const params = new URLSearchParams({ org_id: orgId })
      if (projectId) {
        params.set('project_id', projectId)
      }

      const res = await fetch(`/api/workspace?${params.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })

      if (res.ok) {
        const data = await res.json()
        setWorkspace(data)
        setCurrentProjectId(data.project?.id ?? null)
      } else {
        setWorkspace(null)
      }
    } catch (_error) {
      setWorkspace(null)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  // Sync state when server re-renders with new workspace data (e.g., after onboarding)
  useEffect(() => {
    if (initialWorkspace) {
      setWorkspace(initialWorkspace)
      setCurrentOrgId(initialWorkspace.org.id)
      setCurrentProjectId(initialWorkspace.project?.id ?? null)
      setLoading(false)
    } else if (initialOrg?.id && currentOrgId !== initialOrg.id) {
      setCurrentOrgId(initialOrg.id)
    }
  }, [initialWorkspace, initialOrg]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch user's default workspace on mount
  useEffect(() => {
    async function initializeWorkspace() {
      // If server already provided full workspace, skip fetch
      if (initialWorkspace) return

      // Wait for Privy to be ready
      if (!ready) return

      if (!isAuthenticated || !user || !user.id) {
        setWorkspace(null)
        setLoading(false)
        return
      }

      if (currentOrgId) {
        fetchWorkspace(currentOrgId, currentProjectId)
        return
      }

      // If initialOrg provided from server, use it immediately
      if (initialOrg?.id) {
        setCurrentOrgId(initialOrg.id)
        return
      }

      // Fallback: fetch organizations client-side
      try {
        setLoading(true)
        const res = await fetch('/api/organizations/user')

        if (res.ok) {
          const orgs = await res.json()

          if (orgs && orgs.length > 0) {
            const firstOrg = orgs[0]
            setCurrentOrgId(firstOrg.id)
          } else {
            setLoading(false)
          }
        } else {
          setLoading(false)
        }
      } catch (_error) {
        setLoading(false)
      }
    }

    initializeWorkspace()
  }, [ready, isAuthenticated, user, initialOrg, initialWorkspace, currentProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load workspace when currentOrgId changes (skip if server-provided workspace matches)
  useEffect(() => {
    if (
      initialWorkspace
      && currentOrgId === initialWorkspace.org.id
      && currentProjectId === (initialWorkspace.project?.id ?? null)
    ) return
    if (currentOrgId && isAuthenticated) {
      fetchWorkspace(currentOrgId, currentProjectId)
    }
  }, [currentOrgId, currentProjectId, isAuthenticated, fetchWorkspace, initialWorkspace])

  // Switch organization
  const switchOrg = useCallback((orgId: string) => {
    setCurrentOrgId(orgId)
    setCurrentProjectId(null)
  }, [])

  // Hidden for MVP, but ready for future project switcher rollout.
  const switchProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId)
    setWorkspace((current) => {
      if (!current?.projects?.length) return current
      const nextProject = current.projects.find((project) => project.id === projectId)
      return nextProject ? { ...current, project: nextProject } : current
    })
  }, [])

  // Refetch current workspace
  const refetch = useCallback(() => {
    if (currentOrgId) {
      fetchWorkspace(currentOrgId, currentProjectId)
    }
  }, [currentOrgId, currentProjectId, fetchWorkspace])

  const value: WorkspaceContextType = useMemo(() => ({
    workspace,
    loading,
    switchOrg,
    switchProject,
    refetch
  }), [workspace, loading, switchOrg, switchProject, refetch])

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

/**
 * useWorkspace - Access current workspace
 * 
 * Returns org/project/env for scoping all queries
 * 
 * @example
 * const { workspace } = useWorkspace()
 * 
 * // Use in API calls
 * const agents = await fetch('/api/agents', {
 *   headers: {
 *     'X-Org-ID': workspace.org.id,
 *     'X-Project-ID': workspace.project.id,
 *     'X-Env-ID': workspace.env.id
 *   }
 * })
 * 
 * // Or use helper
 * const agents = await getAgents(workspace)
 */
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (context === undefined) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}

/**
 * Helper: Extract scope IDs from workspace
 * Makes it easy to pass to API functions
 */
export function getWorkspaceScope(workspace: Workspace | null) {
  if (!workspace) {
    return null
  }
  
  return {
    org_id: workspace.org.id,
    ...(workspace.project?.id ? { project_id: workspace.project.id } : {}),
    ...(workspace.env?.id ? { env_id: workspace.env.id } : {})
  }
}

/**
 * Helper: Workspace headers for API requests
 * Use this to add scope headers to fetch calls
 */
export function getWorkspaceHeaders(workspace: Workspace | null): HeadersInit {
  if (!workspace) {
    return {}
  }
  
  return {
    'X-Org-ID': workspace.org.id,
    ...(workspace.project?.id ? { 'X-Project-ID': workspace.project.id } : {}),
    ...(workspace.env?.id ? { 'X-Env-ID': workspace.env.id } : {})
  }
}

/**
 * useSubscription - Access current org's subscription
 * 
 * @example
 * const { subscription, planName, isStarterPlan, isProPlan } = useSubscription()
 * 
 * if (subscription?.features.ai_agents) {
 *   // Show AI agents
 * }
 */
export function useSubscription() {
  const { workspace } = useWorkspace()
  
  return {
    subscription: workspace?.subscription || null,
    planName: workspace?.subscription?.plan_name
      ? PLAN_DISPLAY_NAMES[workspace.subscription.plan_name as keyof typeof PLAN_DISPLAY_NAMES]
      : 'Starter',
    isStarterPlan: workspace?.subscription?.plan_name === 'starter',
    isProPlan: workspace?.subscription?.plan_name === 'pro',
    isBusinessPlan: workspace?.subscription?.plan_name === 'business',
    hasFeature: (feature: string) => workspace?.subscription?.features?.[feature] === true,
    getLimit: (metric: string) => workspace?.subscription?.limits?.[metric] || 0,
  }
}
import { PLAN_DISPLAY_NAMES } from '@/lib/pricing/plans'
