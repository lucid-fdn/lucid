"use client"

import * as React from "react"
import { Search } from "lucide-react"

import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/ui/components/sidebar"
import { KeyboardShortcut } from "@/components/keyboard-shortcut"
import { useCommandPalette } from "@/components/command-palette"

interface SearchButtonProps {
  onClick?: () => void
}

/**
 * SearchButton - Trigger for command palette
 * 
 * Features:
 * - Shows keyboard shortcut (⌘K)
 * - Opens command palette when clicked
 * - Responsive tooltip when collapsed
 * 
 * TODO: Integrate with command palette/search modal
 * 
 * @example
 * <SearchButton onClick={() => setShowSearch(true)} />
 */
export function SearchButton({ onClick }: SearchButtonProps) {
  const { setOpen } = useCommandPalette()
  
  const handleClick = React.useCallback(() => {
    if (onClick) {
      onClick()
    } else {
      // Open command palette
      setOpen(true)
    }
  }, [onClick, setOpen])

  // Keyboard shortcut (⌘K or Ctrl+K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleClick()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClick])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={handleClick}
        tooltip="Search (⌘K)"
      >
        <Search className="h-4 w-4" />
        <span>Search</span>
        <KeyboardShortcut className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
