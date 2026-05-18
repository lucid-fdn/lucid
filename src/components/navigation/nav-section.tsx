"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
} from "@/ui/components/sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

export interface NavSectionMenuItem {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: () => void
  href?: string
}

interface NavSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  menuItems?: NavSectionMenuItem[]
}

/**
 * NavSection - Collapsible navigation section
 * 
 * Groups related nav items under a collapsible header
 * 
 * Features:
 * - Collapsible/expandable
 * - Remembers state
 * - Smooth animations
 * - Keyboard accessible
 * 
 * @example
 * <NavSection title="Teamspaces">
 *   <NavItem href="/data" icon={Database} label="Data" />
 *   <NavItem href="/functions" icon={Zap} label="Functions" />
 * </NavSection>
 */
export function NavSection({
  title,
  children,
  defaultOpen = true,
  menuItems,
}: NavSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const router = useRouter()

  const handleMenuItemClick = (item: NavSectionMenuItem) => {
    if (item.onClick) {
      item.onClick()
    } else if (item.href) {
      router.push(item.href)
    }
  }

  const label = (
    <SidebarGroupLabel className="group/label cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      {title}
      <ChevronRight className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
    </SidebarGroupLabel>
  )

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        {menuItems && menuItems.length > 0 ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <CollapsibleTrigger asChild>
                {label}
              </CollapsibleTrigger>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {menuItems.map((item, index) => {
                const Icon = item.icon
                return (
                  <ContextMenuItem
                    key={index}
                    onClick={() => handleMenuItemClick(item)}
                  >
                    {Icon && <Icon className="mr-2 h-4 w-4" />}
                    {item.label}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          <CollapsibleTrigger asChild>
            {label}
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}
