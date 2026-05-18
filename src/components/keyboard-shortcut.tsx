'use client'

import React from 'react'
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut'

interface KeyboardShortcutProps {
  className?: string
}

export function KeyboardShortcut({ className }: KeyboardShortcutProps) {
  const { shortcut, isMobile } = useKeyboardShortcut()

  if (isMobile) return null

  return (
    <kbd className={className}>{shortcut}</kbd>
  )
}
