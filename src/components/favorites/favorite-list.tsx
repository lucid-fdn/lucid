'use client'

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useFavorites } from './use-favorites'
import { FavoriteItem } from './favorite-item'

interface FavoriteListProps {
  orgId?: string
}

/**
 * Sortable list of favorites
 * - Drag-and-drop reordering
 * - Keyboard accessible
 * - Touch support
 * - Optimistic updates
 * 
 * @example
 * <FavoriteList orgId={workspace.org.id} />
 */
export function FavoriteList({ orgId }: FavoriteListProps) {
  const { favorites, removeFavorite, reorderFavorites } = useFavorites({ orgId })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = favorites.findIndex((f) => f.id === active.id)
      const newIndex = favorites.findIndex((f) => f.id === over.id)

      const newOrder = arrayMove(favorites, oldIndex, newIndex).map((f, index) => ({
        ...f,
        sort_order: index,
      }))

      reorderFavorites(newOrder)
    }
  }

  if (favorites.length === 0) {
    return null
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={favorites.map(f => f.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1">
          {favorites.map((favorite) => (
            <FavoriteItem
              key={favorite.id}
              favorite={favorite}
              onRemove={removeFavorite}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
