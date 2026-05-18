'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { ModelIcon } from '@/components/icons/model-icon'

const LUCID_AUTO_MODEL_ID = 'lucid-auto'

interface Model {
  id: string
  modelId?: string
  passportId?: string
  name: string
  provider: string
  category: string
  description?: string
}

interface ModelGroup {
  provider: string
  models: Model[]
}

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
  initialModels?: ModelGroup[]
  orgId?: string
}

function isGenericProxyModelId(modelId: string) {
  const normalized = modelId.toLowerCase().trim()
  return normalized === 'llmproxy' || normalized === 'proxy' || normalized === 'router' || normalized === 'trustgate'
}

function deriveProxyAlias(modelName: string, description?: string): string | undefined {
  const text = `${modelName} ${description || ''}`.toLowerCase()
  if (text.includes('gpt-4o')) return 'gpt-4o'
  if (text.includes('gpt-4')) return 'gpt-4'
  if (text.includes('gpt-3.5')) return 'gpt-3.5-turbo'
  if (text.includes('claude') && text.includes('sonnet')) return 'claude-3-sonnet'
  return undefined
}

function getCanonicalModelId(model: Model) {
  if (isGenericProxyModelId(model.id)) {
    const preferredModelId = model.modelId && !isGenericProxyModelId(model.modelId)
      ? model.modelId
      : undefined
    const alias = deriveProxyAlias(model.name, model.description)
    return preferredModelId || alias || model.passportId || model.modelId || model.id
  }
  return model.id
}

export function ModelSelector({ value, onChange, disabled, initialModels, orgId }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelGroup[]>(initialModels || [])
  const [isLoading, setIsLoading] = useState(!initialModels)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialModels && initialModels.length > 0) return

    async function fetchModels() {
      try {
        setIsLoading(true)
        const params = new URLSearchParams({ grouped: 'true' })
        if (orgId) params.set('orgId', orgId)
        const response = await fetch(`/api/ai/models?${params}`)
        if (!response.ok) throw new Error('Failed to fetch models')
        const data = await response.json()
        setModels(data.groups || [])
      } catch (err) {
        console.error('[ModelSelector] Error:', err)
        setError('Failed to load models')
        setModels([
          {
            provider: 'Meta',
            models: [
              { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', provider: 'Meta', category: 'chat' },
              { id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B', provider: 'Meta', category: 'chat' },
            ],
          },
          {
            provider: 'Mistral',
            models: [
              { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', provider: 'Mistral', category: 'chat' },
            ],
          },
          {
            provider: 'DeepSeek',
            models: [
              { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'DeepSeek', category: 'reasoning' },
            ],
          },
        ])
      } finally {
        setIsLoading(false)
      }
    }

    fetchModels()
  }, [initialModels, orgId])

  useEffect(() => {
    if (isLoading) return
    const allModels = models.flatMap((g) => g.models)
    if (allModels.length === 0) return
    const hasCurrent = value === LUCID_AUTO_MODEL_ID || allModels.some((m) => getCanonicalModelId(m) === value)
    if (!hasCurrent) {
      onChange(getCanonicalModelId(allModels[0]))
    }
  }, [isLoading, models, value, onChange])

  useEffect(() => {
    if (open) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const isLucidAuto = value === LUCID_AUTO_MODEL_ID
  const currentModel = useMemo(() => {
    if (isLucidAuto) return undefined
    return models.flatMap((g) => g.models).find((m) => getCanonicalModelId(m) === value)
  }, [models, value, isLucidAuto])

  const displayLabel = isLucidAuto
    ? 'Lucid Auto'
    : currentModel?.name || value.split('/').pop() || 'Select model'

  const selectModel = useCallback((modelId: string) => {
    onChange(modelId)
    setOpen(false)
  }, [onChange])

  const query = search.toLowerCase().trim()
  const filteredGroups = useMemo(() => {
    if (!query) return models
    return models
      .map((group) => ({
        ...group,
        models: group.models.filter((m) =>
          m.name.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          m.category.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.models.length > 0)
  }, [models, query])

  const showLucidAuto = !query || 'lucid auto smart best'.includes(query)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="w-full justify-between"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading models...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <ModelIcon
                model={isLucidAuto ? 'lucid-auto' : getCanonicalModelId(currentModel || { id: value, name: value, provider: '', category: '' })}
                provider={currentModel?.provider}
                size={20}
              />
              <span className="truncate text-sm">{displayLabel}</span>
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        className={cn(
          "w-[var(--radix-popover-trigger-width)] p-0 rounded-md border bg-popover text-popover-foreground shadow-md outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        )}
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={() => setOpen(false)}
      >
        {/* Search input */}
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Model list */}
        <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
          {/* Lucid Auto */}
          {showLucidAuto && (
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Lucid</div>
          )}
          {showLucidAuto && (
            <div
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
                'hover:bg-accent hover:text-accent-foreground',
                isLucidAuto && 'bg-accent/50',
              )}
              onPointerDown={(e) => { e.preventDefault(); selectModel(LUCID_AUTO_MODEL_ID) }}
            >
              <ModelIcon model="lucid-auto" size={20} className="mr-2 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="truncate">Lucid Auto</span>
                <span className="text-xs text-muted-foreground truncate">
                  Auto-picks the best model for each query
                </span>
              </div>
              <Check
                className={cn(
                  'ml-2 h-4 w-4 shrink-0',
                  isLucidAuto ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
          )}

          {/* Provider groups */}
          {filteredGroups.map((group) => (
            <div key={group.provider}>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group.provider}</div>
              {group.models.map((model) => {
                const canonicalId = getCanonicalModelId(model)
                const isSelected = !isLucidAuto && canonicalId === value

                return (
                  <div
                    key={`${group.provider}:${model.id}`}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
                      'hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent/50',
                    )}
                    onPointerDown={(e) => { e.preventDefault(); selectModel(canonicalId) }}
                  >
                    <ModelIcon
                      model={canonicalId}
                      provider={model.provider}
                      size={20}
                      className="mr-2 shrink-0"
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{model.name}</span>
                      {model.description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {model.description}
                        </span>
                      )}
                    </div>
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </div>
                )
              })}
            </div>
          ))}

          {/* No results */}
          {!showLucidAuto && filteredGroups.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">No model found.</div>
          )}

          {error && (
            <div className="p-2 text-xs text-destructive">
              {error} — Using fallback models
            </div>
          )}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  )
}
