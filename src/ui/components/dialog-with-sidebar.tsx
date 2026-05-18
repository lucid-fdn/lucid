"use client"

import * as React from "react"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/ui/components/drawer"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/ui/components/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/ui/components/breadcrumb"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

export interface DialogSidebarItem {
  id: string
  title: string
  icon?: LucideIcon
  section?: string
  badge?: string
  disabled?: boolean
}

interface DialogWithSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  items?: DialogSidebarItem[]
  currentItem?: string
  onItemChange?: (itemId: string) => void
  children: React.ReactNode
  showBreadcrumb?: boolean
  zIndex?: number  // For nested modals
}

/**
 * DialogWithSidebar - Reusable responsive dialog with optional sidebar navigation
 * 
 * Features:
 * - Desktop: Dialog with sidebar (≥768px) or simple dialog
 * - Mobile: Drawer with dropdown (<768px) or simple drawer
 * - Grouped sections
 * - Active state
 * - Breadcrumb navigation
 * - Fully customizable content
 * - Optional sidebar (pass items to enable)
 * 
 * @example
 * // With sidebar (for settings, preferences, etc.)
 * <DialogWithSidebar
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Settings"
 *   items={settingsItems}
 *   currentItem={currentTab}
 *   onItemChange={setCurrentTab}
 * >
 *   <YourContent />
 * </DialogWithSidebar>
 * 
 * @example
 * // Without sidebar (for simple modals)
 * <DialogWithSidebar
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Confirm Action"
 *   description="Are you sure?"
 * >
 *   <YourSimpleContent />
 * </DialogWithSidebar>
 */
export function DialogWithSidebar({
  open,
  onOpenChange,
  title,
  description,
  items = [],
  currentItem,
  onItemChange,
  children,
  showBreadcrumb = true,
  zIndex = 50,
}: DialogWithSidebarProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  
  // Determine if sidebar should be shown (only if items exist)
  const hasSidebar = items.length > 0

  // Get current item details
  const current = items.find(item => item.id === currentItem)

  // Group items by section (memoized for performance)
  const groupedItems = React.useMemo(() => {
    if (!hasSidebar) return []
    const groups: Record<string, DialogSidebarItem[]> = {}
    items.forEach(item => {
      const section = item.section || 'Default'
      if (!groups[section]) groups[section] = []
      groups[section].push(item)
    })
    return Object.entries(groups)
  }, [items, hasSidebar])

  if (isDesktop) {
    // Simple dialog without sidebar
    if (!hasSidebar) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent 
            className="overflow-hidden md:max-h-[85vh] md:max-w-[500px]"
            style={{ zIndex }}
          >
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
            <ScrollArea className="max-h-[calc(85vh-8rem)]">
              <div className="py-4">
                {children}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )
    }
    
    // Dialog with sidebar
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="overflow-hidden p-0 md:max-h-[85vh] md:max-w-[700px] lg:max-w-[900px]"
          style={{ zIndex }}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description || title}
          </DialogDescription>
          <SidebarProvider className="items-start">
            <Sidebar collapsible="none" className="hidden md:flex border-r">
              <SidebarContent>
                <div className="p-4">
                  <h2 className="text-lg font-semibold mb-4">{title}</h2>
                </div>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {groupedItems.map(([section, sectionItems]) => (
                        <div key={section} className="mb-4">
                          {groupedItems.length > 1 && (
                            <div className="px-3 mb-2">
                              <h3 className="text-xs font-medium text-muted-foreground">
                                {section}
                              </h3>
                            </div>
                          )}
                          {sectionItems.map((item) => {
                            const Icon = item.icon
                            return (
                              <SidebarMenuItem key={item.id}>
                                <SidebarMenuButton
                                  onClick={() => !item.disabled && onItemChange?.(item.id)}
                                  isActive={currentItem === item.id}
                                  disabled={item.disabled}
                                  className="w-full"
                                >
                                  {Icon && <Icon className="h-4 w-4" />}
                                  <span>{item.title}</span>
                                  {item.badge && (
                                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                      {item.badge}
                                    </span>
                                  )}
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            )
                          })}
                        </div>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <main className="flex flex-1 flex-col">
              {showBreadcrumb && (
                <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
                  <div className="flex items-center gap-2 px-6">
                    <Breadcrumb>
                      <BreadcrumbList>
                        <BreadcrumbItem className="hidden md:block">
                          <BreadcrumbLink 
                            onClick={() => onItemChange?.(items[0]?.id || '')}
                            className="cursor-pointer"
                          >
                            {title}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="hidden md:block" />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{current?.title}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </BreadcrumbList>
                    </Breadcrumb>
                  </div>
                </header>
              )}
              <div className="relative flex-1 overflow-hidden">
                <ScrollArea className={cn(showBreadcrumb ? "h-[calc(85vh-4rem)]" : "h-[85vh]")}>
                  <div className="p-6">
                    {children}
                  </div>
                </ScrollArea>
              </div>
            </main>
          </SidebarProvider>
        </DialogContent>
      </Dialog>
    )
  }

  // Mobile: Use Drawer
  // Simple drawer without sidebar
  if (!hasSidebar) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left border-b">
            <DrawerTitle>{title}</DrawerTitle>
            {description && (
              <DrawerDescription>{description}</DrawerDescription>
            )}
          </DrawerHeader>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {children}
            </div>
          </ScrollArea>

          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }
  
  // Drawer with tab selector
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left border-b">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>
            {current?.title}
          </DrawerDescription>
        </DrawerHeader>
        
        {/* Mobile: Show selector at top */}
        <div className="border-b p-4">
          <select
            value={currentItem}
            onChange={(e) => onItemChange?.(e.target.value)}
            className="w-full p-2 rounded-md border bg-background"
          >
            {groupedItems.map(([section, sectionItems]) => (
              <optgroup key={section} label={section}>
                {sectionItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {children}
          </div>
        </ScrollArea>

        <DrawerFooter className="border-t">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
