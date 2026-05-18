'use client'

import { Handle, Position } from 'reactflow'
import { X } from 'lucide-react'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentBuilderAnimatedSurface } from '@/components/agent-builder/agent-builder-animated-surface'
import { AgentBuilderStartStep } from '@/components/agent-builder/steps'
import { AssistantNodeCard, type AssistantNodeData } from '@/components/assistants/assistant-canvas-node'
import { cn } from '@/lib/utils'

export interface DraftAgentNodeData {
  label: string
  status?: string
  lifecycleState?: 'draft' | 'reviewing' | 'building' | 'deploying' | 'created' | 'failed'
  createdAgentId?: string | null
  createdCrewId?: string | null
  startedAt?: number
  prompt?: string
  promptValue?: string
  isSubmitting?: boolean
  deployment?: {
    phase: 'deploying' | 'connecting' | 'creating' | 'failed'
    startedAt?: number
  }
  featuredTemplates?: TemplateCatalogEntry[]
  availableUnifiedSkills?: UnifiedSkillItem[]
  onPromptChange?: (value: string) => void
  onSubmitPrompt?: () => void
  onOpenBuilder?: () => void
  onStartFresh?: () => void
  onUploadSpec?: () => void
  onSelectTemplate?: (template: TemplateCatalogEntry) => void
  onBrowseAllTemplates?: () => void
  onCancel?: () => void
}

export function DraftAgentCanvasNode({ data, selected }: { data: DraftAgentNodeData; selected?: boolean }) {
  if (data.lifecycleState && data.lifecycleState !== 'draft' && data.lifecycleState !== 'reviewing') {
    return <AgentBuilderLifecycleNode data={data} selected={selected} />
  }

  return (
    <div
      className={cn(
        'group relative w-[1040px] rounded-[28px] transition',
        selected && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
      )}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />

      {data.onCancel ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="nodrag nopan absolute -right-3 -top-3 z-10 h-8 w-8 rounded-full border border-border/70 bg-background/95 shadow-lg opacity-80 hover:opacity-100"
          onClick={data.onCancel}
          aria-label="Cancel agent builder"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}

      <AgentBuilderAnimatedSurface sharedLayout className="max-h-[680px]">
        <ScrollArea className="relative" style={{ maxHeight: 680 }}>
          <AgentBuilderStartStep
            prompt={data.promptValue ?? ''}
            onPromptChange={data.onPromptChange ?? (() => undefined)}
            onPromptSubmit={data.onSubmitPrompt ?? data.onOpenBuilder ?? (() => undefined)}
            isSubmitting={data.isSubmitting}
            featuredTemplates={data.featuredTemplates ?? []}
            availableUnifiedSkills={data.availableUnifiedSkills ?? []}
            onStartFresh={data.onStartFresh ?? data.onOpenBuilder ?? (() => undefined)}
            onUploadSpec={data.onUploadSpec ?? data.onOpenBuilder ?? (() => undefined)}
            onSelectTemplate={data.onSelectTemplate ?? (() => data.onOpenBuilder?.())}
            onBrowseAllTemplates={data.onBrowseAllTemplates ?? data.onOpenBuilder ?? (() => undefined)}
            inputId={`agent-builder-prompt-${data.label.replace(/\W+/g, '-').toLowerCase()}`}
          />
        </ScrollArea>
      </AgentBuilderAnimatedSurface>
    </div>
  )
}

export const AgentBuilderDraftNode = DraftAgentCanvasNode
export type AgentBuilderDraftNodeData = DraftAgentNodeData

function AgentBuilderLifecycleNode({ data }: { data: DraftAgentNodeData; selected?: boolean }) {
  const phase = data.lifecycleState === 'failed' || data.deployment?.phase === 'failed'
    ? 'failed'
    : data.deployment?.phase === 'connecting'
      ? 'connecting'
      : data.deployment?.phase === 'creating' || data.lifecycleState === 'created'
        ? 'creating'
        : 'deploying'
  const assistantNodeData: AssistantNodeData = {
    label: data.label || 'Agent',
    status: phase === 'failed' ? 'paused' : 'active',
    model: 'deploying',
    engine: 'openclaw',
    channels: [],
    updatedAt: new Date(data.startedAt ?? Date.now()).toISOString(),
    feedEvents: [],
    deployment: {
      phase,
      startedAt: data.startedAt,
    },
  }

  return (
    <div className="group relative transition">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <AssistantNodeCard id={data.createdAgentId ?? data.createdCrewId ?? data.label ?? 'draft-agent'} data={assistantNodeData} selected={false} />
    </div>
  )
}
