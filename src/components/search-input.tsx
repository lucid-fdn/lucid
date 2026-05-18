"use client"

import React from "react"
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { useCommandPalette } from "./command-palette"
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut"
import { cn } from "@/lib/utils"

interface SearchInputProps {
  placeholder: string
  className?: string
  showKeyboardShortcut?: boolean
  size?: "sm" | "md" | "lg"
  variant?: "default" | "hero" | "minimal"
  searchContext?: "hero" | "navbar" | "docs" | "global"
  searchEndpoint?: string
  onSearch?: (query: string) => void
}

export function SearchInput({ 
  placeholder,
  className,
  showKeyboardShortcut = true,
  size = "md",
  variant = "default",
  searchContext: _searchContext = "global",
  searchEndpoint,
  onSearch
}: SearchInputProps) {
  const { open: _open, setOpen } = useCommandPalette()
  const { shortcut: keyboardShortcut, isMobile } = useKeyboardShortcut()

  // Handle search with context
  const handleSearch = React.useCallback((query: string) => {
    if (onSearch) {
      onSearch(query)
    } else if (searchEndpoint) {
      // API call would go here
      fetch(`${searchEndpoint}?q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
          // Handle search results
          console.log('Search results:', data)
        })
        .catch(error => {
          console.error('Search error:', error)
        })
    } else {
      // Default behavior - open command palette
      setOpen(true)
    }
  }, [onSearch, searchEndpoint, setOpen])

  const sizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-3 text-base",
    lg: "px-6 py-4 text-lg"
  }

  const variantClasses = {
    default: "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400",
    hero: "bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder:text-white/70 hover:bg-white/20 hover:border-white/30 focus:border-white/40",
    minimal: "bg-transparent border-0 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 focus:bg-white dark:focus:bg-gray-800"
  }

  return (
    <>
      <button
        onClick={() => handleSearch('')}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg transition-all duration-200 group cursor-pointer",
          sizeClasses[size],
          variantClasses[variant],
          className
        )}
      >
        <MagnifyingGlassIcon className={cn(
          "flex-shrink-0",
          size === "sm" ? "h-4 w-4" : size === "md" ? "h-5 w-5" : "h-6 w-6",
          variant === "hero" ? "text-white/50 group-hover:text-white/70" : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
        )} />
        <span className="flex-1 text-left truncate">
          {placeholder}
        </span>
        {showKeyboardShortcut && !isMobile && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-mono",
            variant === "hero" ? "text-white/50 group-hover:text-white/70" : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
          )}>
            <kbd className={cn(
              "px-1.5 py-0.5 rounded text-xs font-mono border",
              variant === "hero" 
                ? "bg-white/10 border-white/20" 
                : "bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
            )}>
              {keyboardShortcut}
            </kbd>
          </div>
        )}
      </button>
    </>
  )
}
