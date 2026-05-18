'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface TypingTextProps {
  /** Array of messages to cycle through with a typewriter effect */
  messages: string[]
  /** Time in ms to wait after a message is fully typed before advancing (default 3000) */
  intervalMs?: number
  /** Additional class names for the container span */
  className?: string
  /** Inline styles for dynamic colors (e.g. overlay tints) */
  style?: React.CSSProperties
  /** Whether to show the blinking cursor (default true) */
  showCursor?: boolean
}

/**
 * TypingText — Typewriter-style text that cycles through messages.
 *
 * Extracted from deploying-canvas-node.tsx for reuse across
 * connection ceremonies, deploy overlays, and lifecycle animations.
 */
export function TypingText({
  messages,
  intervalMs = 3000,
  className,
  style,
  showCursor = true,
}: TypingTextProps) {
  const [index, setIndex] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [charIndex, setCharIndex] = useState(0)

  // Reset when messages array changes (e.g. phase transition)
  useEffect(() => {
    setIndex(0)
    setCharIndex(0)
    setDisplayed('')
  }, [messages])

  useEffect(() => {
    const msg = messages[index % messages.length]
    if (charIndex < msg.length) {
      const timer = setTimeout(() => {
        setDisplayed(msg.slice(0, charIndex + 1))
        setCharIndex(charIndex + 1)
      }, 20 + Math.random() * 30)
      return () => clearTimeout(timer)
    }
    // Message fully typed — wait, then advance
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % messages.length)
      setCharIndex(0)
      setDisplayed('')
    }, intervalMs)
    return () => clearTimeout(timer)
  }, [index, charIndex, messages, intervalMs])

  return (
    <span className={cn('font-mono text-[10px]', className)} style={style}>
      {displayed}
      {showCursor && <span className="animate-pulse">_</span>}
    </span>
  )
}
