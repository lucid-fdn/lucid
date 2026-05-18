'use client'

import { useAnimate } from 'motion/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { LogoIcon } from '@/components/ui/logo-icon'

type LogoClusterItemSize = 'sm' | 'md' | 'lg'

export interface LogoClusterItem {
  id: string
  slug?: string
  icon?: ReactNode
  size?: LogoClusterItemSize
  iconClassName?: string
}

interface LogoClusterIllustrationProps {
  items: LogoClusterItem[]
  className?: string
}

const SIZE_MAP: Record<LogoClusterItemSize, { container: string; icon: number }> = {
  sm: { container: 'h-8 w-8', icon: 18 },
  md: { container: 'h-10 w-10', icon: 22 },
  lg: { container: 'h-12 w-12', icon: 26 },
}

function LogoOrb({
  item,
  className,
}: {
  item: LogoClusterItem
  className?: string
}) {
  const size = SIZE_MAP[item.size ?? 'md']

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        size.container,
        className,
      )}
    >
      {item.icon ? (
        item.icon
      ) : item.slug ? (
        <LogoIcon slug={item.slug} size={size.icon} className={item.iconClassName} />
      ) : null}
    </div>
  )
}

export function LogoClusterIllustration({
  items,
  className,
}: LogoClusterIllustrationProps) {
  const [scope, animate] = useAnimate()

  useEffect(() => {
    const sequence = items.map((item) => [
      `.logo-cluster-item-${item.id}`,
      {
        scale: [1, 1.08, 1],
        transform: ['translateY(0px)', 'translateY(-3px)', 'translateY(0px)'],
      },
      { duration: 0.8 },
    ] as const)

    const controls = animate(sequence as never, {
      repeat: Infinity,
      repeatDelay: 1,
    })

    return () => controls.stop()
  }, [animate, items])

  return (
    <div ref={scope} className={cn('flex w-full items-center justify-center', className)}>
      <div className="flex shrink-0 flex-row items-center justify-center gap-3">
        {items.map((item) => (
          <LogoOrb
            key={item.id}
            item={item}
            className={`logo-cluster-item-${item.id}`}
          />
        ))}
      </div>
    </div>
  )
}
