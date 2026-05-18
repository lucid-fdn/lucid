'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

/**
 * Returns the correct Lucid logo paths based on the current theme.
 * - Dark mode: white logo (lucid_w.png / lucid_w.gif)
 * - Light mode: dark logo (lucid.png)
 * Defaults to dark mode logos until mounted to prevent FOUC.
 */
export function useThemeLogo() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === 'dark'

  return {
    /** Static logo (png) */
    logo: isDark ? '/lucid_w.png' : '/lucid.png',
    /** Animated logo (gif) */
    logoAnimated: isDark ? '/lucid_w.gif' : '/lucid.png',
    /** Whether dark theme is active */
    isDark,
  }
}
