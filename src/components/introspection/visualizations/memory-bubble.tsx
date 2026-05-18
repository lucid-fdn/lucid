'use client'

/**
 * MemoryBubble — Thought bubble for memory load/extract events.
 */

import { motion } from 'framer-motion'
import { Sparkles, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MemoryBubbleProps {
  kind: 'memory_load' | 'memory_extract'
  preview?: string
  count?: number
  className?: string
}

export function MemoryBubble({ kind, preview, count, className }: MemoryBubbleProps) {
  const isExtract = kind === 'memory_extract'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-start gap-2 pl-2 py-1',
        className,
      )}
    >
      {isExtract ? (
        <Sparkles className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
      ) : (
        <Brain className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <span className={cn(
          'text-xs',
          isExtract ? 'text-blue-300' : 'text-muted-foreground',
        )}>
          {isExtract
            ? `Learned${count ? ` ${count} fact${count !== 1 ? 's' : ''}` : ''}`
            : `Loaded ${count ?? 0} memories`}
        </span>
        {preview && (
          <p className={cn(
            'text-[10px] italic mt-0.5 truncate max-w-[220px]',
            isExtract ? 'text-blue-300/60' : 'text-muted-foreground',
          )}>
            &ldquo;{preview}&rdquo;
          </p>
        )}
      </div>
    </motion.div>
  )
}
