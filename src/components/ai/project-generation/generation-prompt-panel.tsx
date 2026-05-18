'use client'

import { Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface GenerationPromptPanelProps {
  id: string
  label: string
  prompt: string
  onPromptChange: (value: string) => void
  placeholder: string
  description?: string
  isGenerating: boolean
  hasResult: boolean
  onGenerate: () => void
  onClear?: () => void
  disabled?: boolean
  rows?: number
  compact?: boolean
}

export function GenerationPromptPanel({
  id,
  label,
  prompt,
  onPromptChange,
  placeholder,
  description,
  isGenerating,
  hasResult,
  onGenerate,
  onClear,
  disabled = false,
  rows = 4,
  compact = false,
}: GenerationPromptPanelProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Textarea
        id={id}
        value={prompt}
        rows={rows}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={compact ? 'outline' : 'default'}
          onClick={onGenerate}
          disabled={disabled || !prompt.trim()}
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {hasResult ? 'Refine suggestion' : 'Generate suggestion'}
        </Button>
        {hasResult && onClear ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
