'use client'

import { memo } from 'react'
import { Plus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface AvatarStackItem {
  id: string
  label?: string
}

interface AvatarStackProps<T extends AvatarStackItem> {
  items: T[]
  /** Render the icon/content inside each avatar */
  renderIcon: (item: T, size: number) => React.ReactNode
  /** Avatar diameter in Tailwind size class (e.g. "!size-5", "!size-7"). Default: "!size-7" */
  avatarClassName?: string
  /** Icon size in px. Default: 16 */
  iconSize?: number
  /** Max visible before "+N" overflow. Default: unlimited */
  max?: number
  /** Optional add button callback */
  onAdd?: () => void
  /** Tooltip for the add button. Default: "Add" */
  addTitle?: string
  className?: string
}

function AvatarStackInner<T extends AvatarStackItem>({
  items,
  renderIcon,
  avatarClassName = '!size-7',
  iconSize = 16,
  max,
  onAdd,
  addTitle = 'Add',
  className,
}: AvatarStackProps<T>) {
  if (items.length === 0 && !onAdd) return null

  const visible = max != null ? items.slice(0, max) : items
  const overflow = max != null ? Math.max(0, items.length - max) : 0

  return (
    <div className="flex items-center gap-1.5">
      <AvatarGroup className={cn('opacity-70 !-space-x-1.5', className)}>
        {visible.map((item) => (
          <Avatar key={item.id} className={avatarClassName} title={item.label}>
            <AvatarFallback className="!bg-muted">
              {renderIcon(item, iconSize)}
            </AvatarFallback>
          </Avatar>
        ))}
        {onAdd && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            title={addTitle}
            className={cn(
              avatarClassName,
              'relative shrink-0 rounded-full overflow-hidden flex items-center justify-center',
              'bg-transparent border border-dashed border-border text-muted-foreground',
              'hover:border-primary/50 hover:text-foreground transition-colors duration-120 cursor-pointer',
            )}
          >
            <Plus style={{ width: iconSize * 0.75, height: iconSize * 0.75 }} />
          </button>
        )}
      </AvatarGroup>
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
          +{overflow}
        </span>
      )}
    </div>
  )
}

export const AvatarStack = memo(AvatarStackInner) as typeof AvatarStackInner
