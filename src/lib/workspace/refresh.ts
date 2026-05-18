/**
 * Centralized Workspace Refresh System
 * 
 * Industry-standard approach for keeping UI in sync with database
 * Reusable for logo, name, and any workspace field updates
 */

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export interface RefreshOptions {
  /** Field being updated (for logging) */
  field?: string
  /** Delay before refresh in ms */
  delay?: number
  /** Use soft refresh (router.refresh) vs hard reload */
  soft?: boolean
}

/**
 * Hook for refreshing workspace data after updates
 * 
 * @example
 * const refreshWorkspace = useWorkspaceRefresh()
 * await refreshWorkspace({ field: 'logo', delay: 1000 })
 */
export function useWorkspaceRefresh() {
  const router = useRouter()
  
  return useCallback(async (options?: RefreshOptions) => {
    const { 
      field = 'workspace',
      delay = 500,
      soft = true  // Default to soft refresh (no page reload)
    } = options || {}
    
    console.log(`[WorkspaceRefresh] Refreshing after ${field} update...`)
    
    if (soft) {
      // Soft refresh: Next.js router refresh (no page reload, updates server components)
      setTimeout(() => {
        router.refresh()
      }, delay)
    } else {
      // Hard refresh: Full page reload (use only if soft refresh doesn't work)
      setTimeout(() => {
        window.location.reload()
      }, delay)
    }
  }, [router])
}

/**
 * Update single workspace field with auto-refresh
 * 
 * @example
 * await updateWorkspaceField({
 *   workspaceId: 'uuid',
 *   field: 'logo_url',
 *   value: 'https://...',
 *   onSuccess: () => console.log('Updated!')
 * })
 */
export async function updateWorkspaceField<T = unknown>(params: {
  workspaceId: string
  field: string
  value: T
  onSuccess?: () => void
  onError?: (error: Error) => void
}): Promise<boolean> {
  const { workspaceId, field, value, onSuccess, onError } = params
  
  try {
    const response = await fetch(`/api/organizations/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Failed to update ${field}`)
    }
    
    console.log(`[WorkspaceRefresh] ✅ ${field} updated`)
    onSuccess?.()
    return true
  } catch (error) {
    console.error(`[WorkspaceRefresh] ❌ Update ${field} failed:`, error)
    onError?.(error as Error)
    return false
  }
}

/**
 * Batch update multiple fields (more efficient)
 * 
 * @example
 * await updateWorkspaceFields({
 *   workspaceId: 'uuid',
 *   updates: { name: 'New Name', bio: 'New Bio' }
 * })
 */
export async function updateWorkspaceFields(params: {
  workspaceId: string
  updates: Record<string, unknown>
  onSuccess?: () => void
  onError?: (error: Error) => void
}): Promise<boolean> {
  const { workspaceId, updates, onSuccess, onError } = params
  
  try {
    const response = await fetch(`/api/organizations/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update workspace')
    }
    
    const fields = Object.keys(updates).join(', ')
    console.log(`[WorkspaceRefresh] ✅ Updated: ${fields}`)
    onSuccess?.()
    return true
  } catch (error) {
    console.error('[WorkspaceRefresh] ❌ Batch update failed:', error)
    onError?.(error as Error)
    return false
  }
}
