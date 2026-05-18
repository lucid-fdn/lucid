'use client'

import { useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'

interface Model {
  id: string
  name: string
  provider: string
  category: string
}

interface ModelGroup {
  provider: string
  models: Model[]
}

interface MultiModelSelectorProps {
  value: string[]
  onChange: (modelIds: string[]) => void
  disabled?: boolean
  /** Server-prefetched model groups — skips client fetch when provided */
  initialModels?: ModelGroup[]
}

export function MultiModelSelector({ value, onChange, disabled, initialModels }: MultiModelSelectorProps) {
  const [models, setModels] = useState<ModelGroup[]>(initialModels || [])
  const [isLoading, setIsLoading] = useState(!initialModels)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (initialModels && initialModels.length > 0) return

    async function fetchModels() {
      try {
        setIsLoading(true)
        const response = await fetch('/api/ai/models?grouped=true')
        if (!response.ok) throw new Error('Failed to fetch models')
        const data = await response.json()
        setModels(data.groups || [])
      } catch (err) {
        console.error('[MultiModelSelector] Error:', err)
        setModels([
          {
            provider: 'OpenAI',
            models: [
              { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', category: 'chat' },
              { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', category: 'chat' },
            ],
          },
          {
            provider: 'Anthropic',
            models: [
              { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic', category: 'chat' },
              { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', category: 'chat' },
            ],
          },
        ])
      } finally {
        setIsLoading(false)
      }
    }

    fetchModels()
  }, [initialModels])

  const toggleModel = (modelId: string) => {
    if (value.includes(modelId)) {
      onChange(value.filter((id) => id !== modelId))
    } else {
      onChange([...value, modelId])
    }
  }

  const removeModel = (modelId: string) => {
    onChange(value.filter((id) => id !== modelId))
  }

  const allModels = models.flatMap((g) => g.models)
  const selectedModels = value.map((id) => allModels.find((m) => m.id === id)).filter(Boolean) as Model[]

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled || isLoading}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading models...</span>
              </div>
            ) : (
              <span className="text-muted-foreground">
                {value.length === 0
                  ? 'Select models...'
                  : `${value.length} model${value.length !== 1 ? 's' : ''} selected`}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <ScrollArea className="h-[300px]">
            <div className="p-4 space-y-4">
              {models.map((group) => (
                <div key={group.provider}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    {group.provider}
                  </div>
                  <div className="space-y-1">
                    {group.models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => toggleModel(model.id)}
                      >
                        <div
                          className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
                            value.includes(model.id)
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground'
                          }`}
                        >
                          {value.includes(model.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary">
                            {model.provider.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm truncate">{model.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Selected models as badges */}
      {selectedModels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedModels.map((model) => (
            <Badge key={model.id} variant="secondary" className="gap-1">
              <span className="text-xs">{model.name}</span>
              <button
                type="button"
                onClick={() => removeModel(model.id)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}