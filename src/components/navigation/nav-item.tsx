"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LucideIcon, ChevronRight } from "lucide-react"

import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/ui/components/sidebar"
import { cn } from "@/lib/utils"

interface NavItemProps {
  href?: string
  icon?: LucideIcon
  label: string
  badge?: number
  isActive?: boolean
  onClick?: () => void
  external?: boolean
  /** Show a right chevron indicating this item opens a secondary menu */
  hasSubmenu?: boolean
}

/**
 * NavItem - Single navigation link
 * 
 * Features:
 * - Auto-detects active state from pathname
 * - Optional icon
 * - Optional badge (e.g., notification count)
 * - Supports onClick for custom actions
 * - Responsive tooltips when sidebar collapsed
 * 
 * @example
 * <NavItem href="/home" icon={Home} label="Home" />
 * <NavItem href="/inbox" icon={Inbox} label="Inbox" badge={3} />
 */
export function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  isActive: isActiveProp,
  onClick,
  external = false,
  hasSubmenu = false,
}: NavItemProps) {
  const pathname = usePathname()
  
  // Auto-detect active state if not provided
  const isActive = isActiveProp ?? (href && pathname ? pathname === href || pathname.startsWith(`${href}/`) : false)

  // If no href, render as button
  if (!href) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={onClick}
          isActive={isActive}
          tooltip={label}
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span>{label}</span>
          {badge !== undefined && badge > 0 && (
            <SidebarMenuBadge>{badge}</SidebarMenuBadge>
          )}
          {hasSubmenu && (
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  // Render external link
  if (external) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={label}
        >
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClick}
            className={cn(
              "flex items-center gap-2",
              isActive && "font-medium"
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span>{label}</span>
            {badge !== undefined && badge > 0 && (
              <SidebarMenuBadge>{badge}</SidebarMenuBadge>
            )}
            {hasSubmenu && (
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            )}
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  // Otherwise render as internal link
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
      >
        <Link
          href={href}
          onClick={onClick}
          className={cn(
            "flex items-center gap-2",
            isActive && "font-medium"
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span className="flex-1">{label}</span>
          {badge !== undefined && badge > 0 && (
            <SidebarMenuBadge>{badge}</SidebarMenuBadge>
          )}
          {hasSubmenu && (
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
