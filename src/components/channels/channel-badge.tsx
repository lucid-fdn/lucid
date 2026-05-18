/**
 * Channel Badge Component
 * 
 * Displays channel status with visual indicators.
 * Used in channel lists, cards, and status displays.
 */

import { Badge } from '@/components/ui/badge'
import { LogoIcon } from '@/components/ui/logo-icon'
import { type ChannelType, type ChannelStatus, getChannelMetadata } from '@/lib/channels/types'
import { cn } from '@/lib/utils'

interface ChannelBadgeProps {
  type: ChannelType
  status?: ChannelStatus
  showIcon?: boolean
  className?: string
}

const STATUS_STYLES = {
  active: 'bg-green-500/10 text-green-700 border-green-500/20',
  inactive: 'bg-muted text-muted-foreground border-border',
  error: 'bg-red-500/10 text-red-700 border-red-500/20',
  pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
}

const STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  error: 'Error',
  pending: 'Pending bind',
}

export function ChannelBadge({
  type,
  status = 'active',
  showIcon = true,
  className,
}: ChannelBadgeProps) {
  const metadata = getChannelMetadata(type)

  return (
    <Badge
      variant="outline"
      className={cn(STATUS_STYLES[status], 'gap-1.5', className)}
    >
      {showIcon && <LogoIcon slug={type} size={14} />}
      <span className="font-medium">{metadata.name}</span>
      {status !== 'active' && (
        <span className="text-xs opacity-70">• {STATUS_LABELS[status]}</span>
      )}
    </Badge>
  )
}
