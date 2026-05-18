'use client'

import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Database } from 'lucide-react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { Favorite } from './use-favorites'

interface FavoriteItemProps {
  favorite: Favorite
  onRemove: (id: string) => void
}

/**
 * Single draggable favorite item
 * - Drag handle (grip icon)
 * - Right-click context menu
 * - Link to favorited item
 * - Smooth drag animations
 */
export function FavoriteItem({ favorite, onRemove }: FavoriteItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: favorite.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleRemove = () => {
    onRemove(favorite.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative',
        isDragging && 'z-50 opacity-50'
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            href={favorite.url}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
              'transition-colors duration-200'
            )}
          >
            {/* Drag Handle */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Icon */}
            <Database className="h-4 w-4 shrink-0" />

            {/* Name */}
            <span className="flex-1 truncate">{favorite.name}</span>
          </Link>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem
            onClick={handleRemove}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove from favorites
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
