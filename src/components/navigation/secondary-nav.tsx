'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/ui/components/drawer'
import * as Icons from 'lucide-react'

export interface SecondaryNavItem {
  title: string
  href: string
  icon?: string // Icon name as string
  badge?: {
    text: string
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  }
  external?: boolean
  disabled?: boolean
}

export interface SecondaryNavSection {
  title: string
  items: SecondaryNavItem[]
}

export interface SecondaryNavProps {
  title: string
  sections: SecondaryNavSection[]
  className?: string
}

function NavContent({ title, sections }: { title: string; sections: SecondaryNavSection[] }) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (!pathname) return false
    if (pathname === href) return true
    if (href !== '/' && pathname.startsWith(href + '/')) return true
    return false
  }

  return (
    <div className="p-6">
      {/* Main Title */}
      <h2 className="text-2xl font-semibold tracking-tight mb-6">
        {title}
      </h2>

      {/* Sections */}
      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section.title}>
            {/* Section Title */}
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>

            {/* Section Items */}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon ? Icons[item.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }> : null

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    className={cn(
                      "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors duration-120",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      item.disabled && "pointer-events-none opacity-50"
                    )}
                    aria-current={active ? 'page' : undefined}
                    aria-disabled={item.disabled}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {Icon && (
                        <Icon className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <Badge 
                          variant={item.badge.variant || 'secondary'} 
                          className="text-xs"
                        >
                          {item.badge.text}
                        </Badge>
                      )}
                      {item.external && (
                        <Icons.ExternalLink className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                      )}
                      {active && !item.external && (
                        <Icons.ChevronRight className="h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SecondaryNav({ title, sections, className }: SecondaryNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile Drawer Trigger */}
      <div className="md:hidden p-4 border-b">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Icons.Menu className="h-4 w-4 mr-2" />
              {title}
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto">
              <DrawerClose asChild>
                <div onClick={() => setOpen(false)}>
                  <NavContent title={title} sections={sections} />
                </div>
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Desktop Sidebar */}
      <aside 
        className={cn(
          "hidden md:block w-64 shrink-0 border-r bg-background h-full overflow-y-auto",
          className
        )}
      >
        <NavContent title={title} sections={sections} />
      </aside>
    </>
  )
}

// Layout component to use with SecondaryNav
export function SecondaryNavLayout({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col md:flex-row h-full", className)}>
      {children}
    </div>
  )
}
