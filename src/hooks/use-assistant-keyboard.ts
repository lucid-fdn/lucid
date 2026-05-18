'use client'

import { useEffect, useCallback } from 'react'

export interface AssistantKeyboardActions {
  /** ⌘S — Force save */
  onSave?: () => void
  /** ⌘1 — Focus config panel */
  onFocusConfig?: () => void
  /** ⌘2 — Focus chat panel */
  onFocusChat?: () => void
  /** ⌘3 — Focus activity panel */
  onFocusActivity?: () => void
}

/**
 * Registers keyboard shortcuts for the assistant command center.
 * Shortcuts are scoped to the assistant detail page — they don't fire
 * when a text input/textarea is focused (except ⌘S which always fires).
 */
export function useAssistantKeyboard(actions: AssistantKeyboardActions) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (!mod) return

      // ⌘S — always fires (even in inputs)
      if (e.key === 's' && actions.onSave) {
        e.preventDefault()
        actions.onSave()
        return
      }

      // Skip remaining shortcuts if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return
      }

      switch (e.key) {
        case '1':
          e.preventDefault()
          actions.onFocusConfig?.()
          break
        case '2':
          e.preventDefault()
          actions.onFocusChat?.()
          break
        case '3':
          e.preventDefault()
          actions.onFocusActivity?.()
          break
      }
    },
    [actions],
  )

  useEffect(() => {
    document.addEventListener('keydown', handler, { passive: false })
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}
