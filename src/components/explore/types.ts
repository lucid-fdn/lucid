/**
 * Shared types for Explore components
 * Used by both marketing (public) and workspace (authenticated) routes
 */

export interface ExploreContext {
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Workspace info (only available for authenticated users) */
  workspace?: {
    id: string
    slug: string
  }
  /** Base path for explore routes (e.g., '/explore' or '/my-workspace/explore') */
  basePath: string
}

export interface ExplorePageProps extends ExploreContext {
  /** Resolved search params from the route page */
  params: { [key: string]: string | string[] | undefined }
}