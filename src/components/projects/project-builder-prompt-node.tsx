'use client'

import { ArrowUp, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/ui/components/prompt-input'
import { cn } from '@/lib/utils'

interface ProjectBuilderPromptNodeProps {
  value: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  isLoading?: boolean
  placeholder?: string
  className?: string
  inputId?: string
}

export function ProjectBuilderPromptNode({
  value,
  onValueChange,
  onSubmit,
  isLoading = false,
  placeholder = 'Describe what you want to build',
  className,
  inputId = 'builder-generation-prompt',
}: ProjectBuilderPromptNodeProps) {
  return (
    <PromptInput
      value={value}
      onValueChange={onValueChange}
      isLoading={isLoading}
      onSubmit={onSubmit}
      maxHeight={180}
      className={cn(
        'nodrag nowheel w-full border-border/70 bg-muted shadow-none focus-within:border-border/70 focus-within:shadow-none',
        className,
      )}
    >
      <PromptInputTextarea
        id={inputId}
        className="min-h-[44px] !bg-transparent px-3 pt-3 text-base leading-6 text-foreground placeholder:text-muted-foreground/70"
        placeholder={placeholder}
      />
      <PromptInputActions className="justify-end px-2 pb-2 pt-2">
        <PromptInputAction tooltip="Generate setup">
          <Button
            type="button"
            size="icon"
            aria-label="Generate setup"
            className="h-8 w-8 rounded-full"
            onClick={(event) => {
              event.stopPropagation()
              onSubmit()
            }}
            disabled={isLoading || !value.trim()}
          >
            {isLoading ? (
              <Square className="size-4 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </PromptInputAction>
      </PromptInputActions>
    </PromptInput>
  )
}
