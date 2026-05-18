"use client"

import * as React from "react"
import { User, Lock, Bell, Building2, CreditCard, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

const iconMap = {
  User,
  Lock,
  Bell,
  Building2,
  CreditCard,
  Shield,
}

interface SettingsModalLayoutProps {
  children: React.ReactNode
  currentTab: string
  onTabChange: (tab: string) => void
  className?: string
}

const settingsItems = [
  { id: 'profile', title: 'Profile', icon: 'User', section: 'Personal Settings' },
  { id: 'account', title: 'Account', icon: 'Lock', section: 'Personal Settings' },
  { id: 'notifications', title: 'Notifications', icon: 'Bell', section: 'Personal Settings' },
  { id: 'organizations', title: 'Organizations', icon: 'Building2', section: 'Organization' },
  { id: 'billing', title: 'Billing', icon: 'CreditCard', section: 'Organization', badge: 'Pro' },
  { id: 'security', title: 'Privacy & Security', icon: 'Shield', section: 'Security' },
]

/**
 * SettingsModalLayout - Tab-like navigation for modal
 * 
 * Features:
 * - Fixed sidebar with sections
 * - Click to switch tabs (no page navigation)
 * - Scrollable content area
 * - Industry standard (Notion/Linear pattern)
 * 
 * @example
 * <SettingsModalLayout currentTab={tab} onTabChange={setTab}>
 *   {content}
 * </SettingsModalLayout>
 */
export function SettingsModalLayout({
  children,
  currentTab,
  onTabChange,
  className,
}: SettingsModalLayoutProps) {
  // Group items by section
  const sections = React.useMemo(() => {
    const grouped: Record<string, typeof settingsItems> = {}
    settingsItems.forEach(item => {
      if (!grouped[item.section]) grouped[item.section] = []
      grouped[item.section].push(item)
    })
    return Object.entries(grouped)
  }, [])

  return (
    <div className={cn("flex h-full overflow-hidden", className)}>
      {/* Fixed Sidebar */}
      <aside className="w-64 border-r bg-muted/10 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>
          
          <nav className="space-y-6">
            {sections.map(([sectionTitle, items]) => (
              <div key={sectionTitle}>
                <h3 className="text-xs font-medium text-muted-foreground mb-2 px-3">
                  {sectionTitle}
                </h3>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = iconMap[item.icon as keyof typeof iconMap]
                    const isActive = currentTab === item.id
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors duration-120",
                          isActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : "hover:bg-accent/50"
                        )}
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="flex-1 text-left">{item.title}</span>
                        {item.badge && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl">
          {children}
        </div>
      </main>
    </div>
  )
}
