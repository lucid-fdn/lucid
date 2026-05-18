'use client'

import * as React from 'react'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoIcon } from '@/components/ui/logo-icon'
import {
  createCapabilityRegistryIndex,
  resolveCapabilityIconItem,
} from '@/lib/capabilities/icon-resolver'
import type { BuilderDecisionCard } from '@/lib/ai/project-generation/schemas'

interface ProjectBuilderDecisionCardProps {
  card: BuilderDecisionCard
  onSubmitMessage: (message: string) => void
  onSelectOption?: (card: BuilderDecisionCard, optionId: string) => void
  onContinue?: (card: BuilderDecisionCard) => void
  onSkip?: (card: BuilderDecisionCard) => void
  onBrowse?: (card: BuilderDecisionCard) => void
  onApplyInput?: (card: BuilderDecisionCard, value: string) => void
  selectedOptionIds?: string[]
  availableUnifiedSkills?: UnifiedSkillItem[]
  disabled?: boolean
}

export function ProjectBuilderDecisionCard({
  card,
  onSubmitMessage,
  onSelectOption,
  onContinue,
  onSkip,
  onBrowse,
  onApplyInput,
  selectedOptionIds = [],
  availableUnifiedSkills = [],
  disabled = false,
}: ProjectBuilderDecisionCardProps) {
  const [value, setValue] = React.useState('')
  const capabilityRegistry = React.useMemo(
    () => createCapabilityRegistryIndex(availableUnifiedSkills),
    [availableUnifiedSkills],
  )
  const handleSkip = React.useCallback(() => {
    if (onSkip) {
      onSkip(card)
      return
    }
    onSubmitMessage('Skip this for now.')
  }, [card, onSkip, onSubmitMessage])

  if (card.kind === 'template_param') {
    return (
      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{card.label}</p>
          <p className="text-xs text-muted-foreground">{card.reason}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`decision-${card.key}`} className="sr-only">
            {card.label}
          </Label>
          <Input
            id={`decision-${card.key}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={card.placeholder || card.reason}
            disabled={disabled}
          />
        </div>
        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleSkip}
              disabled={disabled}
            >
              Skip
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!value.trim()) return
                if (onApplyInput) {
                  onApplyInput(card, value.trim())
                } else {
                  onSubmitMessage(`Set ${card.label} to ${value.trim()}.`)
                }
                setValue('')
              }}
              disabled={disabled || !value.trim()}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (card.kind === 'capability_multi_select') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {card.options.map((option) => {
            const selected = selectedOptionIds.includes(option.id)
            const iconItem = resolveCapabilityIconItem({
              id: option.id,
              slug: option.slug,
              item_type: option.item_type,
              label: option.label,
              category: option.category,
            }, capabilityRegistry)

            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={selected ? 'secondary' : 'outline'}
                className="h-auto rounded-full px-3 py-2"
                onClick={() => onSelectOption?.(card, option.id)}
                disabled={disabled}
              >
                <span className="flex items-center gap-2">
                  {iconItem ? (
                    <LogoIcon
                      slug={iconItem.slug}
                      category={iconItem.category}
                      alwaysOn={iconItem.alwaysOn}
                      section={iconItem.section}
                      size={16}
                    />
                  ) : null}
                  <span>{selected ? 'Added' : 'Add'} {option.label}</span>
                </span>
              </Button>
            )
          })}
          {card.browse_action_label ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto rounded-full px-3 py-2"
              onClick={() => onBrowse?.(card)}
              disabled={disabled}
            >
              {card.browse_action_label}
            </Button>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleSkip}
            disabled={disabled}
          >
            Skip
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onContinue?.(card)}
            disabled={disabled}
          >
            Continue
          </Button>
        </div>
      </div>
    )
  }

  if (card.kind === 'configuration_panel') {
    if (card.panel === 'tasks' && card.suggested_schedule) {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
            <p className="text-sm font-medium text-foreground">
              {card.suggested_schedule.description || 'Suggested schedule'}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {summarizeTaskPrompt(card.suggested_schedule.prompt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {card.apply_action_label ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelectOption?.(card, 'apply-suggested')}
                disabled={disabled}
              >
                {card.apply_action_label}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onSelectOption?.(card, card.panel)}
              disabled={disabled}
            >
              {card.action_label}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleSkip}
              disabled={disabled}
            >
              Skip
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onSelectOption?.(card, card.panel)}
            disabled={disabled}
          >
            {card.action_label}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleSkip}
            disabled={disabled}
          >
            Skip
          </Button>
      </div>
    )
  }

  if (card.kind === 'clarification_select') {
    return (
      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{card.title}</p>
          {card.description ? (
            <p className="text-xs text-muted-foreground">{card.description}</p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {card.options.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="outline"
              className="h-auto items-start justify-start rounded-xl px-3 py-3 text-left"
              onClick={() => onSelectOption?.(card, option.id)}
              disabled={disabled}
            >
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                {option.description ? (
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleSkip}
            disabled={disabled}
          >
            Skip
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{card.title}</p>
        {card.description ? (
          <p className="text-xs text-muted-foreground">{card.description}</p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {card.options.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="outline"
            className="h-auto items-start justify-start rounded-xl px-3 py-3 text-left"
            onClick={() => {
              if (onSelectOption) {
                onSelectOption(card, option.id)
                return
              }

              if (card.kind === 'runtime_mode') {
                onSubmitMessage(`Use ${option.id} runtime.`)
                return
              }

              if (card.kind === 'team_mode') {
                onSubmitMessage(option.id === 'team' ? 'Keep this as a team.' : 'Convert this into a single agent.')
              }
            }}
            disabled={disabled}
          >
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">{option.label}</span>
              {option.description ? (
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              ) : null}
            </span>
          </Button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleSkip}
          disabled={disabled}
        >
          Skip
        </Button>
      </div>
    </div>
  )
}

function summarizeTaskPrompt(prompt: string | undefined): string {
  const normalized = prompt?.trim() ?? ''
  if (!normalized) return 'Lucid prepared a suggested recurring task for this setup.'
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137).trimEnd()}...` : firstSentence
}
