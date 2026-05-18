'use client'

import * as React from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from '@/ui/components/sidebar'
import { Separator } from '@/components/ui/separator'
import { AutoSaveIndicator } from '@/components/forms/auto-save-indicator'
import { useDetailSidebar } from '@/contexts/detail-sidebar-context'
import type { DetailNavItem } from '@/contexts/detail-sidebar-context'
import { cn } from '@/lib/utils'

const HIGHLIGHT_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
}

interface DetailSidebarProps {
  className?: string
}

/**
 * Generic detail sidebar — renders from registered navGroups + identity.
 *
 * Any detail page (agent, workflow, etc.) can register via useDetailSidebar()
 * and this sidebar renders their navigation automatically.
 */
export function DetailSidebar({ className }: DetailSidebarProps) {
  const {
    registration,
    activeSectionId,
    setActiveSectionId,
  } = useDetailSidebar()

  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  if (!registration) return null

  const { identity, backLabel, onBack, navGroups, saveStatus } = registration

  return (
    <Sidebar collapsible="icon" className={className}>
      <SidebarHeader className="animate-in fade-in duration-200">
        {/* Back button */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onBack}
              tooltip={backLabel}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{backLabel}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Identity block */}
        {!isCollapsed && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center gap-2.5">
              {identity.statusDot && (
                <span className={cn('w-2 h-2 rounded-full shrink-0', identity.statusDot)} />
              )}
              <span className="text-sm font-semibold text-zinc-200 truncate">
                {identity.name}
              </span>
            </div>
            {identity.statusLabel && (
              <p className="text-[11px] text-zinc-600 mt-0.5 ml-[18px]">
                {identity.statusLabel}
              </p>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="animate-in fade-in duration-200">
        {navGroups.map((group, idx) => (
          <React.Fragment key={group.id}>
            {idx > 0 && <Separator className="my-1" />}
            <SidebarGroup>
              {group.label && (
                <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-zinc-600">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarMenu>
                {group.items.map(item => (
                  <NavItem
                    key={item.id}
                    item={item}
                    isActive={activeSectionId === item.id || (activeSectionId === null && item.id === '__overview')}
                    onClick={() => setActiveSectionId(item.id)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter>
        {saveStatus && saveStatus !== 'idle' && !isCollapsed && (
          <div className="px-3 pb-2">
            <AutoSaveIndicator status={saveStatus} />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}

/** Single nav item — resolves icon from LucideIcon or ReactNode */
function NavItem({
  item,
  isActive,
  onClick,
}: {
  item: DetailNavItem
  isActive: boolean
  onClick: () => void
}) {
  const iconNode = renderIcon(item.icon)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onClick}
        isActive={isActive}
        tooltip={item.label}
        className="relative"
      >
        {iconNode && <span className="[&>svg]:h-4 [&>svg]:w-4">{iconNode}</span>}
        <span>{item.label}</span>
        {item.highlight && (
          <span className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full',
            HIGHLIGHT_COLORS[item.highlight] ?? 'bg-zinc-400',
          )} />
        )}
      </SidebarMenuButton>
      {item.badge != null && Number(item.badge) > 0 && (
        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}

/** Render a LucideIcon component or pass through ReactNode */
function renderIcon(icon?: LucideIcon | React.ReactNode): React.ReactNode {
  if (!icon) return null
  // Already a rendered element (e.g., <Settings2 className="..." />)
  if (React.isValidElement(icon)) return icon
  // Unrendered component (function or forwardRef object) — instantiate it
  if (typeof icon === 'function' || typeof icon === 'object') {
    const Icon = icon as LucideIcon
    return <Icon className="h-4 w-4" />
  }
  return icon
}
