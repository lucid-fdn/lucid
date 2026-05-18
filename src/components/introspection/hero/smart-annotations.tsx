'use client'

/**
 * SmartAnnotations — Rules-based insight cards after runs complete.
 *
 * Rendered as subtle cards with left border colored by severity.
 * Dismissible per-session. Max 3 per run.
 */

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Annotation } from '@/hooks/use-smart-annotations'

interface SmartAnnotationsProps {
  annotations: Annotation[]
  className?: string
}

export function SmartAnnotations({ annotations, className }: SmartAnnotationsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }, [])

  const visible = annotations.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className={cn('space-y-1.5 py-2', className)}>
      <AnimatePresence>
        {visible.map((ann) => (
          <motion.div
            key={ann.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              'flex items-start gap-2 px-3 py-2 rounded-sm text-xs border-l-2',
              ann.severity === 'warn'
                ? 'border-l-red-500/60 bg-red-500/[0.04]'
                : 'border-l-amber-500/60 bg-amber-500/[0.04]',
            )}
          >
            {ann.severity === 'warn' ? (
              <AlertTriangle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
            )}
            <span className="text-muted-foreground flex-1">{ann.message}</span>
            <button
              type="button"
              onClick={() => dismiss(ann.id)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
