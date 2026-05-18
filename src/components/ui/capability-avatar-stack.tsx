'use client'

import { AvatarStack } from '@/components/ui/avatar-stack'
import { LogoIcon } from '@/components/ui/logo-icon'
import type { CapabilityIconItem } from '@/lib/capabilities/icon-resolver'

interface CapabilityAvatarStackProps {
  items: CapabilityIconItem[]
  avatarClassName?: string
  iconSize?: number
  max?: number
  onAdd?: () => void
  addTitle?: string
  className?: string
}

export function CapabilityAvatarStack({
  items,
  avatarClassName,
  iconSize,
  max,
  onAdd,
  addTitle,
  className,
}: CapabilityAvatarStackProps) {
  return (
    <AvatarStack
      items={items}
      avatarClassName={avatarClassName}
      iconSize={iconSize}
      max={max}
      onAdd={onAdd}
      addTitle={addTitle}
      className={className}
      renderIcon={(item, size) => (
        <LogoIcon
          slug={item.slug}
          category={item.category}
          alwaysOn={item.alwaysOn}
          section={item.section}
          size={size}
          className="object-contain"
        />
      )}
    />
  )
}
