'use client'

import type { UnifiedSkillItem } from '@contracts/unified-skill'
import type { UIMessage } from 'ai'

import { ChatInput, MessageList } from '@/components/ai-chat'
import { ProjectBuilderStepActions } from '@/components/projects/project-builder-step-actions'
import { ProjectBuilderDecisionCard } from '@/components/projects/project-builder-decision-card'
import type { BuilderDecisionCard, GenerationDraft } from '@/lib/ai/project-generation/schemas'
import { getDraftCapabilities } from '@/lib/ai/project-generation/structure'
import { getVisibleBuilderDecisionCards } from '@/lib/builder/state/builder-step-visibility'

export interface ProjectBuilderChatPanelProps {
  messages: UIMessage[]
  input: string
  onInputChange: (value: string) => void
  onSubmit: (value?: string) => void
  onStop?: () => void
  onDecisionSubmit: (message: string) => void
  onDecisionSelect?: (card: BuilderDecisionCard, optionId: string) => void
  onDecisionContinue?: (card: BuilderDecisionCard) => void
  onDecisionSkip?: (card: BuilderDecisionCard) => void
  onDecisionBrowse?: (card: BuilderDecisionCard) => void
  onDecisionApplyInput?: (card: BuilderDecisionCard, value: string) => void
  decisionCards?: BuilderDecisionCard[]
  draft?: GenerationDraft | null
  availableUnifiedSkills?: UnifiedSkillItem[]
  pendingConnectionsCount?: number
  hasSkippedPendingConnections?: boolean
  decisionAnchorMessageId?: string | null
  status?: 'submitted' | 'streaming' | 'ready' | 'error'
  isLoading?: boolean
  progressStatus?: string | null
  onOpenConnectApps?: () => void
  onSkipConnectApps?: () => void
  isReadyToCreate?: boolean
  onCreate?: () => void
  createLabel?: string
  createDisabled?: boolean
}

function hasVisibleMessageContent(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === 'text') {
      return 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0
    }

    return part.type === 'reasoning' || part.type === 'file' || part.type === 'source-url' || part.type.startsWith('tool-') || part.type === 'dynamic-tool'
  })
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => ('text' in part ? part.text : ''))
    .join('')
    .trim()
}

function isLocalBuilderMessage(message: UIMessage): boolean {
  return typeof message.id === 'string' && message.id.startsWith('local-assistant-')
}

const INTRO_MESSAGE: UIMessage = {
  id: 'project-builder-intro',
  role: 'assistant',
  parts: [
    {
      type: 'text',
      text: 'Tell me what you want to build. I will shape the setup, explain what changed, and keep the live configuration updated on the right.',
    },
  ],
}

export function ProjectBuilderChatPanel({
  messages,
  input,
  onInputChange,
  onSubmit,
  onStop,
  onDecisionSubmit,
  onDecisionSelect,
  onDecisionContinue,
  onDecisionSkip,
  onDecisionBrowse,
  onDecisionApplyInput,
  decisionCards = [],
  draft = null,
  availableUnifiedSkills = [],
  pendingConnectionsCount = 0,
  hasSkippedPendingConnections = false,
  decisionAnchorMessageId = null,
  status = 'ready',
  isLoading = false,
  progressStatus = null,
  onOpenConnectApps,
  onSkipConnectApps,
  isReadyToCreate = false,
  onCreate,
  createLabel = 'Create agent',
  createDisabled = false,
}: ProjectBuilderChatPanelProps) {
  const visibleDecisionCards = getVisibleBuilderDecisionCards(decisionCards)
  const showConnectAppsStep = visibleDecisionCards.length === 0
    && pendingConnectionsCount > 0
    && !hasSkippedPendingConnections
  const showFinalCreateStep = visibleDecisionCards.length === 0 && !showConnectAppsStep && isReadyToCreate
  const visibleMessages = messages
    .filter((message) => {
      if (message.role !== 'assistant') return true
      return hasVisibleMessageContent(message)
    })
    .filter((message, index, all) => {
      if (isLocalBuilderMessage(message)) {
        return all.findIndex((candidate) => candidate.id === message.id) === index
      }
      const text = getMessageText(message)
      return all.findIndex((candidate) => (
        candidate.id === message.id
        || (
          !isLocalBuilderMessage(candidate)
          && candidate.role === message.role
          && getMessageText(candidate) === text
          && text.length > 0
        )
      )) === index
    })
  const hasMessages = visibleMessages.length > 0
  const displayMessages = hasMessages ? visibleMessages : [INTRO_MESSAGE]

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {progressStatus ? (
          <div className="px-4 pt-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-foreground/50" />
              {progressStatus}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <MessageList
            messages={displayMessages}
            status={status}
            showSubmittedIndicator={false}
            afterAssistantMessageId={decisionAnchorMessageId}
            afterLastAssistantMessage={visibleDecisionCards.length > 0 || showConnectAppsStep || showFinalCreateStep ? (
              <div className="space-y-3 pt-3">
                {visibleDecisionCards.map((card) => (
                  <ProjectBuilderDecisionCard
                    key={card.kind === 'template_param' ? `${card.kind}-${card.key}` : `${card.kind}-${card.title}`}
                    card={card}
                    onSubmitMessage={onDecisionSubmit}
                    onSelectOption={onDecisionSelect}
                    onContinue={onDecisionContinue}
                    onSkip={onDecisionSkip}
                    onBrowse={onDecisionBrowse}
                    onApplyInput={onDecisionApplyInput}
                    selectedOptionIds={getSelectedOptionIds(card, draft)}
                    availableUnifiedSkills={availableUnifiedSkills}
                    disabled={isLoading}
                  />
                ))}
                {showConnectAppsStep ? (
                  <ProjectBuilderStepActions
                    pendingConnectionsCount={pendingConnectionsCount}
                    onOpenConnectApps={() => onOpenConnectApps?.()}
                    onSkipConnectApps={() => onSkipConnectApps?.()}
                    disabled={isLoading}
                  />
                ) : null}
                {showFinalCreateStep ? (
                  <ProjectBuilderStepActions
                    pendingConnectionsCount={0}
                    onOpenConnectApps={() => onOpenConnectApps?.()}
                    onSkipConnectApps={() => onSkipConnectApps?.()}
                    isReady
                    onCreate={onCreate}
                    createLabel={createLabel}
                    createDisabled={createDisabled}
                    disabled={isLoading}
                  />
                ) : null}
              </div>
            ) : null}
          />
        </div>

        <ChatInput
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          isLoading={isLoading}
          placeholder="Refine the setup, add tools, change tone, or ask for a team..."
          flat
          hideShortcutHint
        />
      </div>
    </div>
  )
}

export const AgentBuilderChat = ProjectBuilderChatPanel
export type AgentBuilderChatProps = ProjectBuilderChatPanelProps

function getSelectedOptionIds(card: BuilderDecisionCard, draft: GenerationDraft | null): string[] {
  if (!draft) return []
  if (card.kind !== 'capability_multi_select') return []
  const capabilities = getDraftCapabilities(draft)

  return card.options
    .filter((option) => (
      option.item_type === 'skill'
        ? capabilities.skills.includes(option.slug)
        : capabilities.plugins.includes(option.slug)
    ))
    .map((option) => option.id)
}

