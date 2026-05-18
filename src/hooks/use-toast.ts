import { useMemo } from 'react'
import { toast as sonnerToast } from 'sonner'

type ToastDescription = string | Record<string, unknown> | undefined

function normalizeOptions(description?: ToastDescription): Record<string, unknown> | undefined {
  if (!description) return undefined
  if (typeof description === 'string') return { description }
  return description
}

/**
 * Shared client notification surface.
 *
 * This is the single app-level API for transient user notifications.
 * It stays compatible with existing call-sites that pass either:
 * - toast.success('Saved')
 * - toast.success('Saved', 'Everything worked')
 * - toast.success('Saved', { description: 'Everything worked' })
 */
export const toast = Object.assign(
  (message: string, options?: Record<string, unknown>) => sonnerToast(message, options),
  {
    success: (message: string, description?: ToastDescription) =>
      sonnerToast.success(message, normalizeOptions(description)),
    error: (message: string, description?: ToastDescription) =>
      sonnerToast.error(message, normalizeOptions(description)),
    info: (message: string, description?: ToastDescription) =>
      sonnerToast.info(message, normalizeOptions(description)),
    warning: (message: string, description?: ToastDescription) =>
      sonnerToast.warning(message, normalizeOptions(description)),
    custom: (message: string, options?: Record<string, unknown>) =>
      sonnerToast(message, options),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
    loading: (message: string, options?: Record<string, unknown>) =>
      sonnerToast.loading(message, options),
    promise: sonnerToast.promise.bind(sonnerToast),
  },
)

/**
 * Hook wrapper for ergonomic usage inside React components.
 * Returns the shared app-level toast object.
 */
export function useToast() {
  return useMemo(() => toast, [])
}

export type ToastFunction = ReturnType<typeof useToast>
