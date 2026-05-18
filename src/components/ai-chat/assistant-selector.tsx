'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Bot, MessageSquare } from 'lucide-react'

interface AgentOption {
  id: string
  name: string
}

interface AgentSelectorProps {
  value: string | null
  onChange: (assistantId: string | null) => void
  agents: AgentOption[]
  disabled?: boolean
}

export function AgentSelector({
  value,
  onChange,
  agents,
  disabled,
}: AgentSelectorProps) {
  if (agents.length === 0) return null

  return (
    <Select
      value={value || '__chat__'}
      onValueChange={(v) => onChange(v === '__chat__' ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="w-[180px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__chat__">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Chat mode
          </span>
        </SelectItem>
        {agents.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              {a.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Backward-compatible alias while the rest of the app still imports the old symbol.
export const AssistantSelector = AgentSelector
