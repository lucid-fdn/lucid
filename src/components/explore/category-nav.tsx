'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  Brain,
  Server,
  Puzzle,
  Bot,
  Database,
} from 'lucide-react'

interface CategoryNavProps {
  /** Base path for explore routes (e.g., '/explore' or '/my-workspace/explore') */
  basePath: string
}

const CATEGORIES = [
  { label: 'All', href: '', icon: Sparkles },
  { label: 'Models', href: '/models', icon: Brain },
  { label: 'Compute', href: '/compute', icon: Server },
  { label: 'Connectors', href: '/connectors', icon: Puzzle },
  { label: 'Agents', href: '/agents', icon: Bot },
  { label: 'Datasets', href: '/datasets', icon: Database },
]

/**
 * Shared category navigation pills for Explore pages
 * Adapts to both marketing (/explore-v2) and workspace (/[slug]/explore-v2) routes
 */
export function CategoryNav({ basePath }: CategoryNavProps) {
  const pathname = usePathname() ?? ''

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {CATEGORIES.map((cat) => {
        const fullHref = `${basePath}${cat.href}`
        const isActive =
          cat.href === ''
            ? pathname === basePath || pathname === `${basePath}/`
            : pathname.startsWith(fullHref)
        const Icon = cat.icon

        return (
          <Link
            key={cat.label}
            href={fullHref}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              isActive
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <Icon className="size-3.5" />
            {cat.label}
          </Link>
        )
      })}
    </div>
  )
}