'use client'

import { useState, useEffect } from 'react'

export interface Credential {
  id: string
  name: string
  type: 'api_key' | 'basic_auth' | 'oauth2' | 'custom_headers'
  organization_id: string | null
  created_at: string
  updated_at: string
}

interface UseCredentialsOptions {
  type?: string // Filter by credential type
  orgId?: string // Filter by organization
}

interface UseCredentialsResult {
  credentials: Credential[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch and manage credentials
 * Filters by type and organization as needed
 */
export function useCredentials(options: UseCredentialsOptions = {}): UseCredentialsResult {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCredentials = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (options.orgId) {
        params.append('org_id', options.orgId)
      }

      const response = await fetch(`/api/credentials?${params}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch credentials')
      }

      const data = await response.json()
      let fetchedCredentials = data.credentials || []

      // Filter by type if specified
      if (options.type) {
        fetchedCredentials = fetchedCredentials.filter(
          (cred: Credential) => cred.type === options.type
        )
      }

      setCredentials(fetchedCredentials)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load credentials'
      setError(errorMessage)
      console.error('[useCredentials] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCredentials()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [options.type, options.orgId])

  return {
    credentials,
    isLoading,
    error,
    refetch: fetchCredentials,
  }
}
