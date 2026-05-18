'use client'

import { Logo } from '@/components/logo-animated'

interface LoadingScreenProps {
  message?: string
  fullScreen?: boolean
  minHeight?: string
}

/**
 * Centralized Loading Screen Component
 * 
 * Reusable loading screen with animated Lucid logo
 * 
 * @example
 * // Full screen
 * <LoadingScreen message="Loading workspace..." fullScreen />
 * 
 * @example
 * // Inline with custom height
 * <LoadingScreen message="Loading..." minHeight="400px" />
 * 
 * @example
 * // Default (no message)
 * <LoadingScreen />
 */
export function LoadingScreen({
  message,
  fullScreen = false,
  minHeight = '400px',
}: LoadingScreenProps) {
  const containerClass = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-100'
    : `flex items-center justify-center min-h-[${minHeight}]`

  return (
    <div className={containerClass}>
      <div className="flex flex-col items-center space-y-4">
        {/* Animated Logo */}
        <div className="relative">
          <Logo className="w-16 h-16" />
          {/* Pulsing effect */}
          <div className="absolute inset-0 animate-ping opacity-20">
            <Logo className="w-16 h-16" />
          </div>
        </div>

        {/* Loading Message */}
        {message && (
          <p className="text-sm text-muted-foreground animate-pulse">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
