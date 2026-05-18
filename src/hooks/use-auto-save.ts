'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions<T> {
  /** Data to watch for changes */
  data: T
  /** Save function — called with current data */
  onSave: (data: T) => Promise<void>
  /** Debounce delay in ms (default: 1500) */
  delay?: number
  /** Compare function — return true if data has changed from baseline */
  hasChanged: (data: T) => boolean
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean
}

/**
 * useAutoSave — Debounced auto-save with status tracking.
 *
 * Usage:
 *   const { status, save } = useAutoSave({
 *     data: formValues,
 *     onSave: async (data) => { await fetch(...) },
 *     hasChanged: (data) => data.name !== original.name,
 *   })
 *
 * Returns:
 *   - status: 'idle' | 'saving' | 'saved' | 'error'
 *   - save: () => void  — trigger immediate save
 */
export function useAutoSave<T>({
  data,
  onSave,
  delay = 1500,
  hasChanged,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const doSave = useCallback(async (currentData: T) => {
    if (!isMountedRef.current) return
    setStatus('saving')
    try {
      await onSave(currentData)
      if (!isMountedRef.current) return
      setStatus('saved')
      // Clear "saved" after 2s
      savedTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setStatus('idle')
      }, 2000)
    } catch (err) {
      console.error('[useAutoSave] Save failed:', err)
      if (isMountedRef.current) {
        setStatus('error')
        // Clear error after 3s so user can retry
        savedTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) setStatus('idle')
        }, 3000)
      }
    }
  }, [onSave])

  // Debounced auto-save on data change
  useEffect(() => {
    if (!enabled || !hasChanged(data)) return

    // Clear previous timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)

    timerRef.current = setTimeout(() => {
      doSave(data)
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data, delay, enabled, hasChanged, doSave])

  // Immediate save (for Cmd+S)
  const save = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    if (hasChanged(data)) doSave(data)
  }, [data, hasChanged, doSave])

  return { status, save }
}
