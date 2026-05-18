'use client'

import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFavorites, Favorite } from './use-favorites'

interface FavoriteStarButtonProps {
  favoritableType: Favorite['favoritable_type']
  favoritableId: string
  name: string
  url: string
  icon?: string
  orgId?: string
  className?: string
  showLabel?: boolean
}

/**
 * Reusable star button to toggle favorites
 * - Shows filled star if favorited
 * - Shows outline star if not favorited
 * - Optimistic updates
 * - Toast notifications
 * 
 * @example
 * <FavoriteStarButton
 *   favoritableType="project"
 *   favoritableId="123"
 *   name="My Project"
 *   url="/projects/123"
 *   orgId={orgId}
 * />
 */
export function FavoriteStarButton({
  favoritableType,
  favoritableId,
  name,
  url,
  icon,
  orgId,
  className,
  showLabel = false,
}: FavoriteStarButtonProps) {
  const { isFavorited, getFavorite, addFavorite, removeFavorite } = useFavorites({ orgId })

  const favorited = isFavorited(favoritableType, favoritableId)
  const favorite = getFavorite(favoritableType, favoritableId)

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (favorited && favorite) {
      await removeFavorite(favorite.id)
    } else {
      await addFavorite({
        favoritable_type: favoritableType,
        favoritable_id: favoritableId,
        name,
        url,
        icon,
      })
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className={cn(
        'h-8 gap-2',
        favorited && 'text-yellow-500 hover:text-yellow-600',
        className
      )}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star
        className={cn(
          'h-4 w-4',
          favorited && 'fill-current'
        )}
      />
      {showLabel && (
        <span className="text-xs">
          {favorited ? 'Favorited' : 'Favorite'}
        </span>
      )}
    </Button>
  )
}
