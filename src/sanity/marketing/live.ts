import { getClient } from './client'
import { isSanityConfigured } from './env'

// Export sanityFetch function that uses the regular client
export const sanityFetch = async <T = unknown>({
  query,
  params = {},
  tags = [],
}: {
  query: string
  params?: Record<string, unknown>
  tags?: string[]
}): Promise<{ data: T }> => {
  if (!isSanityConfigured) {
    return { data: null as T }
  }
  const data = await getClient().fetch(query, params, {
    next: {
      tags,
    },
  })
  return { data }
}

// Export SanityLive component for live preview
export const SanityLive = ({ children }: { children: React.ReactNode }) => {
  // In next-sanity v11, live preview is handled differently
  // This is a placeholder component - you may need to implement
  // live preview using the @sanity/preview-kit or similar
  if (typeof window === 'undefined') {
    // Server-side rendering - just return children
    return children
  }
  
  // Client-side - return children as-is to avoid React DOM issues
  return children
}
