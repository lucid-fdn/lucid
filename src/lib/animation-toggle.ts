/**
 * Animation Toggle System
 * Allows switching between Animate UI (animated) and standard shadcn/ui components
 * 
 * Usage:
 *   import { useAnimations } from '@/lib/animation-toggle'
 *   const { Dialog } = useAnimations()
 */

'use client'

import { useState, useEffect } from 'react'

// Animation mode type
export type AnimationMode = 'animated' | 'standard'

// Default mode (can be changed)
const DEFAULT_MODE: AnimationMode = 'animated'
const STORAGE_KEY = 'animation-mode'

/**
 * Hook to get/set animation mode
 */
export function useAnimationMode() {
  const [mode, setMode] = useState<AnimationMode>(DEFAULT_MODE)
  
  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AnimationMode
    if (stored === 'animated' || stored === 'standard') {
      setMode(stored)
    }
  }, [])
  
  // Save to localStorage when changed
  const updateMode = (newMode: AnimationMode) => {
    setMode(newMode)
    localStorage.setItem(STORAGE_KEY, newMode)
  }
  
  return { mode, setMode: updateMode }
}

/**
 * Hook to get the correct component imports based on animation mode
 * Returns either Animate UI or standard shadcn components
 */
export function useAnimations() {
  const { mode } = useAnimationMode()
  
  if (mode === 'animated') {
    return {
      // Animate UI components
      Dialog: () => import('@/components/animate-ui/primitives/radix/dialog'),
      Sheet: () => import('@/components/animate-ui/primitives/radix/sheet'),
      DropdownMenu: () => import('@/components/animate-ui/primitives/radix/dropdown-menu'),
      Tooltip: () => import('@/components/animate-ui/primitives/radix/tooltip'),
      Popover: () => import('@/components/animate-ui/primitives/radix/popover'),
      Accordion: () => import('@/components/animate-ui/primitives/radix/accordion'),
      AlertDialog: () => import('@/components/animate-ui/primitives/radix/alert-dialog'),
      Checkbox: () => import('@/components/animate-ui/primitives/radix/checkbox'),
      Collapsible: () => import('@/components/animate-ui/primitives/radix/collapsible'),
      HoverCard: () => import('@/components/animate-ui/primitives/radix/hover-card'),
      Progress: () => import('@/components/animate-ui/primitives/radix/progress'),
      RadioGroup: () => import('@/components/animate-ui/primitives/radix/radio-group'),
      Switch: () => import('@/components/animate-ui/primitives/radix/switch'),
      Tabs: () => import('@/components/animate-ui/primitives/radix/tabs'),
      Toggle: () => import('@/components/animate-ui/primitives/radix/toggle'),
      ToggleGroup: () => import('@/components/animate-ui/primitives/radix/toggle-group'),
      Files: () => import('@/components/animate-ui/primitives/radix/files'),
    }
  }
  
  return {
    // Standard shadcn/ui components
    Dialog: () => import('@/components/ui/dialog'),
    Sheet: () => import('@/components/ui/sheet'),
    DropdownMenu: () => import('@/components/ui/dropdown-menu'),
    Tooltip: () => import('@/components/animate-ui/primitives/radix/tooltip'),
    Popover: () => import('@/components/ui/popover'),
    AlertDialog: () => import('@/components/ui/alert-dialog'),
    Checkbox: () => import('@/components/ui/checkbox'),
    Collapsible: () => import('@/components/ui/collapsible'),
    HoverCard: () => import('@/components/ui/hover-card'),
    Progress: () => import('@/components/ui/progress'),
    RadioGroup: () => import('@/components/ui/radio-group'),
    Switch: () => import('@/components/ui/switch'),
    Tabs: () => import('@/components/ui/tabs'),
  }
}

/**
 * Simple barrel export for easier static imports
 * Defaults to animated components
 */
export { Dialog } from '@/components/animate-ui/primitives/radix/dialog'
export { Sheet } from '@/components/animate-ui/primitives/radix/sheet'
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/animate-ui/primitives/radix/dropdown-menu'
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/animate-ui/primitives/radix/tooltip'
export { Popover, PopoverTrigger, PopoverContent } from '@/components/animate-ui/primitives/radix/popover'

// Magic UI exports
export { TypingAnimation } from '@/ui/components/typing-animation'
export { ShineBorder } from '@/ui/components/shine-border'
export { AnimatedList } from '@/ui/components/animated-list'
