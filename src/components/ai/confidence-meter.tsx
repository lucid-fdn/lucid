'use client'

import { cn } from '@/lib/utils'
import { validateFlowSpecEnhanced, getStatusLabel } from '@/lib/ai/validation'
import type { FlowSpec } from '@/lib/lucid-l2/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AlertCircle } from 'lucide-react'

interface ConfidenceMeterProps {
  flowSpec: FlowSpec
  className?: string
}

/**
 * Confidence Meter
 * Visual progress ring showing workflow readiness
 * 
 * Features:
 * - SVG progress ring (36×36px)
 * - Percentage text
 * - Status label
 * - Issues popover
 */
export function ConfidenceMeter({
  flowSpec,
  className,
}: ConfidenceMeterProps) {
  const validation = validateFlowSpecEnhanced(flowSpec)
  const percentage = validation.confidence
  const circumference = 2 * Math.PI * 16 // radius = 16
  const offset = circumference - (percentage / 100) * circumference

  // Color based on status
  const ringColor = 
    validation.status === 'excellent' || validation.status === 'ready' 
      ? '#2AB673'  // Success green
      : validation.status === 'needs-review'
      ? '#F5B84B'  // Warning amber
      : '#E05252'  // Error red

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Progress Ring */}
      <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
        {/* Background circle */}
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="var(--border)"
          strokeWidth="3"
        />
        {/* Progress circle */}
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke={ringColor}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-400"
        />
        {/* Percentage text */}
        <text
          x="18"
          y="18"
          className="text-[10px] font-semibold"
          fill="currentColor"
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(90 18 18)"
        >
          {percentage}
        </text>
      </svg>

      {/* Status Label */}
      <div className="flex-1">
        <div className={cn(
          "text-sm font-medium",
          validation.status === 'excellent' || validation.status === 'ready' 
            ? "text-green-700 dark:text-green-300"
            : validation.status === 'needs-review'
            ? "text-amber-700 dark:text-amber-300"
            : "text-red-700 dark:text-red-300"
        )}>
          {getStatusLabel(validation.status)}
        </div>

        {/* Issues Link */}
        {validation.issues.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {validation.issues.length} issue{validation.issues.length > 1 ? 's' : ''}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Issues</h4>
                <ul className="space-y-2">
                  {validation.issues.map((issue, index) => (
                    <li key={index} className="text-sm space-y-1">
                      <div className={cn(
                        "font-medium",
                        issue.severity === 'error' && "text-red-700",
                        issue.severity === 'warning' && "text-amber-700"
                      )}>
                        {issue.severity === 'error' ? '⚠️' : '⚡'} {issue.message}
                      </div>
                      {issue.suggestion && (
                        <div className="text-xs text-muted-foreground">
                          💡 {issue.suggestion}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}
