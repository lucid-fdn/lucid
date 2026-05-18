'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { transitions } from '@/lib/design/motion'
import { cn } from '@/lib/utils'

export interface MobilePanelTab {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
  content: React.ReactNode
}

interface MobilePanelSwitcherProps {
  tabs: MobilePanelTab[]
  defaultTab?: string
  activeTab?: string
  onTabChange?: (tabId: string) => void
  className?: string
}

export function MobilePanelSwitcher({
  tabs,
  defaultTab,
  activeTab: controlledActiveTab,
  onTabChange,
  className,
}: MobilePanelSwitcherProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState(defaultTab ?? tabs[0]?.id)
  const activeTab = controlledActiveTab ?? uncontrolledActiveTab
  const activeContent = tabs.find((t) => t.id === activeTab)?.content

  const setActiveTab = (tabId: string) => {
    if (controlledActiveTab == null) {
      setUncontrolledActiveTab(tabId)
    }
    onTabChange?.(tabId)
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Content area with crossfade */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={transitions.instant}
            className="absolute inset-0"
          >
            {activeContent}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom tab bar */}
      <div className="flex items-center h-10 border-t border-border bg-background/70 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 h-full active:scale-[0.97] transition-all duration-120 relative',
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-muted-foreground',
            )}
          >
            {/* Animated active indicator */}
            {activeTab === tab.id && (
              <motion.div
                layoutId="mobile-tab-indicator"
                className="absolute top-0 inset-x-3 h-px bg-muted-foreground"
                transition={transitions.reveal}
              />
            )}
            <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{tab.icon}</span>
            <span className="text-[11px] font-medium">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="text-[11px] font-mono px-1 rounded-full bg-muted text-muted-foreground min-w-[14px] text-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
