"use client"

import * as React from "react"
import { SecondaryNav } from '@/components/navigation/secondary-nav'
import { settingsNavigation } from '@/config/settings-nav'

interface SettingsLayoutProps {
  children: React.ReactNode
  className?: string
}

/**
 * SettingsLayout - Reusable layout for settings
 * 
 * Features:
 * - Fixed sidebar navigation on left
 * - Scrollable content area on right
 * - Same UI as settings page
 * - Reusable in modal or page
 * 
 * @example
 * <SettingsLayout>
 *   <ProfileForm />
 * </SettingsLayout>
 */
export function SettingsLayout({ children, className }: SettingsLayoutProps) {
  return (
    <div className={`flex flex-col md:flex-row h-full overflow-hidden ${className || ''}`}>
      <SecondaryNav 
        title="Settings" 
        sections={settingsNavigation}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
