'use client'

import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface UsageMeterProps {
  title: string
  description?: string
  current: number
  limit: number
  unit?: string
  isUnlimited?: boolean
  warningThreshold?: number
  dangerThreshold?: number
  className?: string
  showUpgradePrompt?: boolean
  onUpgrade?: () => void
}

/**
 * UsageMeter - Display usage progress with visual indicators
 * 
 * Features:
 * - Progress bar with color coding
 * - Warning/danger thresholds
 * - Unlimited support
 * - Reusable across app
 * 
 * @example
 * ```tsx
 * <UsageMeter
 *   title="API Calls"
 *   description="Monthly limit"
 *   current={850}
 *   limit={1000}
 *   unit="calls"
 *   warningThreshold={80}
 *   dangerThreshold={95}
 * />
 * ```
 */
export function UsageMeter({
  title,
  description,
  current,
  limit,
  unit = 'units',
  isUnlimited = false,
  warningThreshold = 80,
  dangerThreshold = 95,
  className,
  showUpgradePrompt = false,
  onUpgrade,
}: UsageMeterProps) {
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const isWarning = percentage >= warningThreshold && percentage < dangerThreshold
  const isDanger = percentage >= dangerThreshold
  
  // Format numbers with commas
  const formatNumber = (num: number) => num.toLocaleString()
  
  // Get status color
  const getStatusColor = () => {
    if (isUnlimited) return 'text-blue-600 dark:text-blue-400'
    if (isDanger) return 'text-destructive'
    if (isWarning) return 'text-amber-600 dark:text-amber-400'
    return 'text-muted-foreground'
  }
  
  // Get progress color
  const getProgressColor = () => {
    if (isDanger) return 'bg-destructive'
    if (isWarning) return 'bg-amber-500'
    return undefined // Use default
  }
  
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm">{description}</CardDescription>
            )}
          </div>
          {(isWarning || isDanger) && (
            <AlertTriangle className={cn('h-5 w-5', getStatusColor())} />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Usage Numbers */}
        <div className="flex items-baseline justify-between">
          <span className={cn('text-2xl font-bold', getStatusColor())}>
            {isUnlimited ? 'Unlimited' : formatNumber(current)}
          </span>
          {!isUnlimited && (
            <span className="text-sm text-muted-foreground">
              of {formatNumber(limit)} {unit}
            </span>
          )}
        </div>
        
        {/* Progress Bar */}
        {!isUnlimited && (
          <>
            <Progress 
              value={percentage} 
              className={cn('h-2', isDanger && 'bg-destructive/20', isWarning && 'bg-amber-500/20')}
              indicatorClassName={getProgressColor()}
            />
            
            <div className="flex items-center justify-between text-xs">
              <span className={getStatusColor()}>
                {percentage.toFixed(1)}% used
              </span>
              <span className="text-muted-foreground">
                {formatNumber(limit - current)} remaining
              </span>
            </div>
          </>
        )}
        
        {/* Warning Message */}
        {isDanger && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Limit almost reached</p>
            <p className="text-xs mt-1">
              Upgrade your plan to increase limits
            </p>
          </div>
        )}
        
        {isWarning && !isDanger && (
          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            <p className="font-medium">Approaching limit</p>
            <p className="text-xs mt-1">
              Consider upgrading soon
            </p>
          </div>
        )}
        
        {/* Upgrade Prompt */}
        {showUpgradePrompt && onUpgrade && (isDanger || isWarning) && (
          <button
            onClick={onUpgrade}
            className="w-full text-sm text-primary hover:underline"
          >
            Upgrade Plan →
          </button>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * UsageMeterCompact - Compact version for smaller spaces
 */
export function UsageMeterCompact({
  title,
  current,
  limit,
  unit = 'units',
  isUnlimited = false,
  className,
}: Omit<UsageMeterProps, 'description' | 'showUpgradePrompt' | 'onUpgrade'>) {
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const isDanger = percentage >= 95
  const isWarning = percentage >= 80 && percentage < 95
  
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className={cn(
          'text-xs',
          isDanger && 'text-destructive font-medium',
          isWarning && 'text-amber-600 dark:text-amber-400 font-medium',
          !isDanger && !isWarning && 'text-muted-foreground'
        )}>
          {isUnlimited ? (
            'Unlimited'
          ) : (
            <>
              {current.toLocaleString()} / {limit.toLocaleString()} {unit}
            </>
          )}
        </span>
      </div>
      
      {!isUnlimited && (
        <Progress 
          value={percentage} 
          className={cn(
            'h-1.5',
            isDanger && 'bg-destructive/20',
            isWarning && 'bg-amber-500/20'
          )}
          indicatorClassName={cn(
            isDanger && 'bg-destructive',
            isWarning && 'bg-amber-500'
          )}
        />
      )}
    </div>
  )
}
