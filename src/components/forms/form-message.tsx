'use client'

import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface FormMessageProps {
  type: 'success' | 'error' | 'warning' | 'info'
  title?: string
  message: string
  className?: string
}

/**
 * Form Message Component
 * 
 * Optional component for displaying form-level messages
 * (Success, error, warning, or info)
 * 
 * @example
 * ```tsx
 * {error && (
 *   <FormMessage
 *     type="error"
 *     title="Error"
 *     message={error}
 *   />
 * )}
 * 
 * {success && (
 *   <FormMessage
 *     type="success"
 *     message="Profile updated successfully!"
 *   />
 * )}
 * ```
 * 
 * NOTE: This is optional! You can keep using Alert directly or toast notifications.
 */
export function FormMessage({
  type,
  title,
  message,
  className,
}: FormMessageProps) {
  const variants = {
    success: {
      icon: CheckCircle2,
      className: 'border-green-500/50 text-green-600 dark:border-green-500/30 dark:text-green-400',
    },
    error: {
      icon: XCircle,
      className: 'border-destructive/50 text-destructive dark:border-destructive/30',
    },
    warning: {
      icon: AlertCircle,
      className: 'border-yellow-500/50 text-yellow-600 dark:border-yellow-500/30 dark:text-yellow-400',
    },
    info: {
      icon: Info,
      className: 'border-blue-500/50 text-blue-600 dark:border-blue-500/30 dark:text-blue-400',
    },
  }

  const variant = variants[type]
  const Icon = variant.icon

  return (
    <div className={cn('rounded-lg border p-4', variant.className, className)}>
      <div className="flex gap-3">
        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          {title && <h5 className="font-medium text-sm">{title}</h5>}
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}
