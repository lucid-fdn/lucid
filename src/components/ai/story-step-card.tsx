'use client'

import { useState } from 'react'
import { LucideIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getColorForStepType } from '@/lib/ai/flowspec-parser'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface StoryStepCardProps {
  type: 'when' | 'if' | 'do'
  title: string
  description: string
  icon: LucideIcon
  editable?: boolean
  onEdit?: (newText: string) => Promise<void>
  onClick?: () => void
  className?: string
}

/**
 * Story Step Card
 * Individual When/If/Do step with Apple aesthetics
 * 
 * Features:
 * - Icon circle with color coding
 * - Title + description
 * - Breathing hover animation
 * - Tappable (optional)
 */
export function StoryStepCard({
  type,
  title,
  description,
  icon: Icon,
  editable = false,
  onEdit,
  onClick,
  className,
}: StoryStepCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const isInteractive = !!onClick || editable

  const handleEditStart = () => {
    if (!editable) return
    setIsEditing(true)
    setEditText(title)
    setEditError(null)
  }

  const handleEditSave = async () => {
    if (!editText.trim() || !onEdit) return
    
    setIsSaving(true)
    setEditError(null)
    
    try {
      await onEdit(editText)
      setIsEditing(false)
      setEditText('')
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditCancel = () => {
    setIsEditing(false)
    setEditText('')
    setEditError(null)
  }

  if (isEditing) {
    return (
      <div className={cn(
        "p-4 rounded-lg border border-lucid bg-card",
        "space-y-3",
        className
      )}>
        {/* Edit Input */}
        <Input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          placeholder="Describe this step in natural language..."
          disabled={isSaving}
          autoFocus
          className="font-medium"
        />
        
        {editError && (
          <p className="text-xs text-red-600">{editError}</p>
        )}

        {/* Edit Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleEditSave}
            disabled={!editText.trim() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleEditCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={editable ? handleEditStart : onClick}
      className={cn(
        // Base styles
        "relative p-4 rounded-lg border",
        "bg-card",
        // Color based on type
        type === 'when' && "border-green-200 dark:border-green-800",
        type === 'if' && "border-amber-200 dark:border-amber-800",
        type === 'do' && "border-blue-200 dark:border-blue-800",
        // Interactive states
        isInteractive && [
          "cursor-pointer",
          "hover:border-lucid hover:shadow-md hover:scale-[1.02]",
          "transition-all duration-120 ease-apple",
        ],
        className
      )}
    >
      {/* Icon Circle */}
      <div className="flex items-start gap-4">
        <div className={cn(
          // Size (8pt grid)
          "w-8 h-8 flex-shrink-0",
          "rounded-full flex items-center justify-center",
          // Color based on type
          getColorForStepType(type)
        )}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          <h4 className="font-medium text-sm text-foreground">
            {title}
          </h4>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {/* Edit Indicator (when interactive) */}
      {isInteractive && (
        <div className={cn(
          "absolute top-2 right-2",
          "text-xs text-muted-foreground",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity duration-200"
        )}>
          Click to edit
        </div>
      )}
    </div>
  )
}
