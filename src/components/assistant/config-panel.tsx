'use client'

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CollapsibleSection } from '@/components/panels/collapsible-section'
import {
  Settings2,
  MessageSquare,
  Wallet,
  Brain,
  Zap,
  Sparkles,
  Link2,
  Cpu,
  Calendar,
  Activity,
  Shield,
  Fingerprint,
  FileJson,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ConfigSection {
  id: string
  title: string
  icon: React.ReactNode
  badge?: string | number | null
  badgeClassName?: string
  defaultOpen?: boolean
  content: React.ReactNode
}

interface ConfigPanelProps {
  sections?: ConfigSection[]
  className?: string
}

/** Default section definitions — IDs map to the old tab values */
export const DEFAULT_SECTION_ICONS: Record<string, React.ReactNode> = {
  settings: <Settings2 className="h-3.5 w-3.5" />,
  channels: <MessageSquare className="h-3.5 w-3.5" />,
  wallet: <Wallet className="h-3.5 w-3.5" />,
  memories: <Brain className="h-3.5 w-3.5" />,
  plugins: <Zap className="h-3.5 w-3.5" />,
  skills: <Sparkles className="h-3.5 w-3.5" />,
  integrations: <Link2 className="h-3.5 w-3.5" />,
  runtime: <Cpu className="h-3.5 w-3.5" />,
  tasks: <Calendar className="h-3.5 w-3.5" />,
  health: <Activity className="h-3.5 w-3.5" />,
  guardrails: <Shield className="h-3.5 w-3.5" />,
  verification: <Fingerprint className="h-3.5 w-3.5" />,
  'operating-context': <Fingerprint className="h-3.5 w-3.5" />,
  'agent-card': <FileJson className="h-3.5 w-3.5" />,
}

export function ConfigPanel({ sections = [], className }: ConfigPanelProps) {
  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="flex flex-col">
        {sections.map((section) => (
          <CollapsibleSection
            key={section.id}
            id={`section-${section.id}`}
            title={section.title}
            icon={section.icon}
            badge={section.badge}
            badgeClassName={section.badgeClassName}
            defaultOpen={section.defaultOpen}
          >
            {section.content}
          </CollapsibleSection>
        ))}
      </div>
    </ScrollArea>
  )
}
