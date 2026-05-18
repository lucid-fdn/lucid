'use client'

import useSWR from 'swr'
import { useCallback } from 'react'
import { toast } from '@/hooks/use-toast'

export interface Favorite {
  id: string
  favoritable_type: 'project' | 'agent' | 'app' | 'page' | 'data_source'
  favoritable_id: string
  sort_order: number
  name: string
  url: string
  icon?: string | null
  created_at: string
}

interface UseFavoritesOptions {
  orgId?: string
}

/**
 * Hook for managing favorites
 * - Fetches with SWR (cached, revalidates on focus)
 * - Provides add/remove/reorder functions
 * - Optimistic updates for instant UI feedback
 */
export function useFavorites({ orgId }: UseFavoritesOptions = {}) {
  const { data, error, isLoading, mutate } = useSWR<Favorite[]>(
    orgId ? `/api/favorites?org_id=${orgId}` : null,
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )

  const addFavorite = useCallback(
    async (favorite: Omit<Favorite, 'id' | 'sort_order' | 'created_at'>) => {
      if (!orgId) return

      // Optimistic update
      const newFavorite: Favorite = {
        ...favorite,
        id: crypto.randomUUID(),
        sort_order: (data?.length || 0),
        created_at: new Date().toISOString(),
      }

      mutate([...(data || []), newFavorite], false)

      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            ...favorite,
          }),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Failed to add favorite')
        }

        toast.success('Added to favorites')
        mutate() // Revalidate
      } catch (error) {
        console.error('[useFavorites] Add error:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to add favorite')
        mutate() // Rollback
      }
    },
    [orgId, data, mutate]
  )

  const removeFavorite = useCallback(
    async (favoriteId: string) => {
      if (!orgId) return

      // Optimistic update
      const previousData = data
      mutate(data?.filter(f => f.id !== favoriteId), false)

      try {
        const res = await fetch(`/api/favorites/${favoriteId}`, {
          method: 'DELETE',
        })

        if (!res.ok) {
          throw new Error('Failed to remove favorite')
        }

        toast.success('Removed from favorites')
        mutate() // Revalidate
      } catch (error) {
        console.error('[useFavorites] Remove error:', error)
        toast.error('Failed to remove favorite')
        mutate(previousData) // Rollback
      }
    },
    [orgId, data, mutate]
  )

  const reorderFavorites = useCallback(
    async (newOrder: Favorite[]) => {
      if (!orgId) return

      // Optimistic update
      const previousData = data
      mutate(newOrder, false)

      try {
        const res = await fetch('/api/favorites/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            favorite_ids: newOrder.map(f => f.id),
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to reorder favorites')
        }

        mutate() // Revalidate
      } catch (error) {
        console.error('[useFavorites] Reorder error:', error)
        toast.error('Failed to reorder favorites')
        mutate(previousData) // Rollback
      }
    },
    [orgId, data, mutate]
  )

  const isFavorited = useCallback(
    (favoritableType: string, favoritableId: string) => {
      return data?.some(
        f => f.favoritable_type === favoritableType && f.favoritable_id === favoritableId
      )
    },
    [data]
  )

  const getFavorite = useCallback(
    (favoritableType: string, favoritableId: string) => {
      return data?.find(
        f => f.favoritable_type === favoritableType && f.favoritable_id === favoritableId
      )
    },
    [data]
  )

  return {
    favorites: data || [],
    isLoading,
    error,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    isFavorited,
    getFavorite,
  }
}
