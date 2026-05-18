'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface AddStepButtonProps {
  onAdd: (description: string) => Promise<void>
  position: 'before' | 'after'
  className?: string
}

/**
 * Add Step Button
 * Floating + button to insert new workflow steps
 * 
 * Features:
 * - Appears between steps
 * - Popover with mini prompt
 * - Natural language input
 * - Smooth insertion
 */
export function AddStepButton({
  onAdd,
  position: _position,
  className,
}: AddStepButtonProps) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (!description.trim()) return

    setIsAdding(true)
    try {
      await onAdd(description)
      setDescription('')
      setOpen(false)
    } catch (error) {
      console.error('Failed to add step:', error)
    } finally {
      setIsAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className={cn(
      "relative h-8 flex items-center justify-center",
      className
    )}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-8 h-8 rounded-full",
              "bg-muted hover:bg-lucid/10",
              "border border-mist hover:border-lucid",
              "flex items-center justify-center",
              "transition-all duration-120",
              "hover:scale-110"
            )}
          >
            <Plus className="w-4 h-4 text-muted-foreground hover:text-lucid" />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-80 p-4 space-y-3">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Add Step</h4>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What should happen next?"
              disabled={isAdding}
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!description.trim() || isAdding}
              className="flex-1"
            >
              {isAdding ? 'Adding...' : 'Add Step'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false)
                setDescription('')
              }}
              disabled={isAdding}
            >
              Cancel
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
