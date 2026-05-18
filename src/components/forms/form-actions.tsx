'use client'

import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface FormActionsProps {
  submitLabel?: string
  cancelLabel?: string
  loading?: boolean
  disabled?: boolean
  onCancel?: () => void
  submitVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  cancelVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  className?: string
  align?: 'left' | 'center' | 'right'
}

/**
 * Form Actions Component
 * 
 * Optional wrapper for submit/cancel buttons
 * Provides consistent styling and loading states
 * 
 * @example
 * ```tsx
 * <FormActions
 *   loading={loading}
 *   onCancel={() => router.back()}
 * />
 * ```
 * 
 * NOTE: This is optional! You can keep using Button directly.
 */
export function FormActions({
  submitLabel = 'Save Changes',
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  onCancel,
  submitVariant = 'default',
  cancelVariant = 'outline',
  className,
  align = 'right',
}: FormActionsProps) {
  const alignmentClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  }

  return (
    <div className={cn('flex gap-3', alignmentClasses[align], className)}>
      {onCancel && (
        <Button
          type="button"
          variant={cancelVariant}
          onClick={onCancel}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
      )}
      
      <Button
        type="submit"
        variant={submitVariant}
        disabled={disabled || loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Saving...' : submitLabel}
      </Button>
    </div>
  )
}
