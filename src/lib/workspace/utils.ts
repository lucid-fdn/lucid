/**
 * Workspace Utilities
 * 
 * Centralized helpers for workspace-related operations.
 * Follows industry standard patterns (Linear, Notion, GitHub).
 * 
 * @module workspace/utils
 */

/**
 * Get the effective workspace slug for navigation links
 * 
 * Industry Standard Pattern:
 * - If in workspace context → use current workspace
 * - If on global page → fallback to user's first workspace
 * - If no workspaces → return null (links won't render)
 * 
 * This ensures sidebar links are ALWAYS visible unless truly unavailable.
 * 
 * @example
 * ```tsx
 * // In components
 * const slug = getEffectiveWorkspaceSlug(currentSlug, userWorkspaces)
 * <NavItem href={`/${slug}/ai`} />
 * ```
 * 
 * @param currentWorkspaceSlug - Slug from URL params (null on global pages)
 * @param userWorkspaces - User's available workspaces
 * @returns Workspace slug to use, or null if unavailable
 */
export function getEffectiveWorkspaceSlug(
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: Array<{ slug: string }> = []
): string | null {
  // Priority 1: Current workspace (if in workspace context)
  if (currentWorkspaceSlug) {
    return currentWorkspaceSlug
  }
  
  // Priority 2: First available workspace (fallback for global pages)
  if (userWorkspaces.length > 0 && userWorkspaces[0]?.slug) {
    return userWorkspaces[0].slug
  }
  
  // Priority 3: No workspaces available
  return null
}

/**
 * Build workspace-scoped URL
 * 
 * Handles both workspace and global contexts gracefully.
 * Returns null if no workspace is available.
 * 
 * @example
 * ```tsx
 * const url = buildWorkspaceUrl('/ai', currentSlug, userWorkspaces)
 * // → '/my-workspace/ai' or null
 * ```
 * 
 * @param path - Path within workspace (e.g., '/ai', '/workflows')
 * @param currentWorkspaceSlug - Current workspace slug
 * @param userWorkspaces - Available workspaces
 * @returns Full URL path or null
 */
export function buildWorkspaceUrl(
  path: string,
  currentWorkspaceSlug: string | null | undefined,
  userWorkspaces: Array<{ slug: string }> = []
): string | null {
  const slug = getEffectiveWorkspaceSlug(currentWorkspaceSlug, userWorkspaces)
  
  if (!slug) return null
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  
  return `/${slug}${normalizedPath}`
}

/**
 * Check if currently in a workspace context
 * 
 * Used to determine UI behavior (e.g., show different layouts).
 * 
 * @param currentWorkspaceSlug - Current workspace slug from URL
 * @returns true if in workspace context
 */
export function isInWorkspaceContext(
  currentWorkspaceSlug: string | null | undefined
): boolean {
  return Boolean(currentWorkspaceSlug)
}

/**
 * Get workspace from list by slug
 * 
 * Type-safe helper to find specific workspace.
 * 
 * @param slug - Workspace slug to find
 * @param workspaces - List of workspaces
 * @returns Workspace object or undefined
 */
export function getWorkspaceBySlug<T extends { slug: string }>(
  slug: string | null | undefined,
  workspaces: T[]
): T | undefined {
  if (!slug) return undefined
  return workspaces.find(w => w.slug === slug)
}
