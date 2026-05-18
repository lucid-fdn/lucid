'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Layers3, Search, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TemplateCard } from './template-card'
import { DeployDialog } from './deploy-dialog'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { LucidPack } from '@contracts/lucid-pack'
import {
  CapabilityTemplateCard,
} from './capability-template-card'
import {
  buildTemplateLibraryItems,
  filterTemplateLibraryItems,
  type TemplateLibraryItem,
} from '@/lib/templates/library'
import {
  getBestFirstUtilities,
  getCompatibleTemplateSuggestions,
  getTemplateCategoryStories,
  getTemplateProductStory,
  normalizeCategory,
  type TemplateCombinationSuggestion,
} from '@/lib/templates/product-copy'
import { TemplateCombinationPanel } from './template-combination-panel'

interface TemplateGalleryProps {
  initialTemplates: TemplateCatalogEntry[]
  leadingCards?: React.ReactNode
  detailBasePath?: string
  orgId?: string
  workspaceSlug?: string
  projectId?: string
  title?: string
  description?: string
  allowDeploy?: boolean
  onSelect?: (template: TemplateCatalogEntry) => void
  selectedTemplateId?: string | null
  cardVariant?: 'compact' | 'full'
  capabilityTemplates?: LucidPack[]
  libraryItems?: TemplateLibraryItem[]
  onPreviewCapabilityTemplate?: (pack: LucidPack) => void
  previewLoadingCapabilityId?: string | null
  onTemplateEvent?: (
    eventType: 'gallery_view' | 'detail_view' | 'preview' | 'install' | 'combine_view' | 'combine_click' | 'first_run' | 'repeat_use',
    item: TemplateLibraryItem,
    metadata?: Record<string, unknown>,
  ) => void
}

export function TemplateGallery({
  initialTemplates,
  leadingCards,
  detailBasePath,
  orgId,
  workspaceSlug,
  projectId,
  title = 'Templates',
  description = 'Start with pre-built setups from Lucid and the community.',
  allowDeploy = false,
  onSelect,
  selectedTemplateId,
  cardVariant = 'full',
  capabilityTemplates = [],
  libraryItems,
  onPreviewCapabilityTemplate,
  previewLoadingCapabilityId = null,
  onTemplateEvent,
}: TemplateGalleryProps) {
  const [searchInput, setSearchInput] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [deployTarget, setDeployTarget] = useState<TemplateCatalogEntry | null>(null)
  const [deployOpen, setDeployOpen] = useState(false)
  const deferredSearch = useDeferredValue(searchInput)

  const resolvedLibraryItems = useMemo(() => {
    return libraryItems ?? buildTemplateLibraryItems({
      templates: initialTemplates,
      capabilityPacks: capabilityTemplates,
    })
  }, [capabilityTemplates, initialTemplates, libraryItems])

  const categoryFilters = useMemo(() => {
    return Array.from(new Set(resolvedLibraryItems.map((item) => item.category))).sort()
  }, [resolvedLibraryItems])
  const categoryStories = useMemo(() => getTemplateCategoryStories(resolvedLibraryItems), [resolvedLibraryItems])
  const firstUtilities = useMemo(() => getBestFirstUtilities(resolvedLibraryItems), [resolvedLibraryItems])
  const primaryUtility = firstUtilities[0] ?? resolvedLibraryItems[0] ?? null
  const combinationSuggestions = useMemo(() => {
    return primaryUtility
      ? getCompatibleTemplateSuggestions(primaryUtility, resolvedLibraryItems, 3)
      : []
  }, [primaryUtility, resolvedLibraryItems])

  const filteredLibraryItems = useMemo(() => {
    return filterTemplateLibraryItems(resolvedLibraryItems, {
      search: deferredSearch,
    }).filter((item) => {
      return selectedCategories.length === 0 || selectedCategories.includes(item.category)
    })
  }, [deferredSearch, resolvedLibraryItems, selectedCategories])

  const hasResults = filteredLibraryItems.length > 0 || Boolean(leadingCards)

  function resetFilters(): void {
    setSearchInput('')
    setSelectedCategories([])
  }

  function handleDeploy(template: TemplateCatalogEntry): void {
    const item = resolvedLibraryItems.find((candidate) => candidate.slug === template.slug)
    if (item) onTemplateEvent?.('preview', item, { surface: 'gallery_card_deploy' })
    setDeployTarget(template)
    setDeployOpen(true)
  }

  function toggleValue(current: string[], value: string, next: (items: string[]) => void): void {
    next(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  function selectCategoryStory(storyKey: string): void {
    const matchingCategory = categoryFilters.find((category) => normalizeCategory(category) === storyKey)
    setSelectedCategories([matchingCategory ?? storyKey])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-4 px-6 py-5">
        {(title || description) ? (
          <div className="flex flex-col gap-1">
            {title ? <h1 className="text-xl font-semibold text-foreground">{title}</h1> : null}
            {description ? (
              <p className="text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <span>
                      Category: <span className="text-muted-foreground">{selectedCategories.length > 0 ? selectedCategories.length : 'All'}</span>
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuCheckboxItem
                    checked={selectedCategories.length === 0}
                    onCheckedChange={() => setSelectedCategories([])}
                  >
                    All
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {categoryFilters.map((category) => (
                    <DropdownMenuCheckboxItem
                      key={category}
                      checked={selectedCategories.includes(category)}
                      onCheckedChange={() => toggleValue(selectedCategories, category, setSelectedCategories)}
                    >
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search templates"
                className="pl-9"
                aria-label="Search templates"
              />
            </div>
          </div>

          {primaryUtility ? (
            <TemplateGalleryHero
              primary={primaryUtility}
              firstUtilities={firstUtilities}
              categoryStories={categoryStories}
              detailBasePath={detailBasePath}
              combinationSuggestions={combinationSuggestions}
              onSelectCategory={selectCategoryStory}
              onTemplateEvent={onTemplateEvent}
            />
          ) : null}
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[min(68vh,720px)]">
        <div className="px-6 py-5">
        {!hasResults ? (
          <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 text-center">
            <p className="text-base font-medium text-foreground">No templates match your filters.</p>
            <p className="text-sm text-muted-foreground">
              Adjust the kind, category, or search query and try again.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {leadingCards}
            {filteredLibraryItems.map((item) => {
              if (item.type === 'agent' || item.type === 'team') {
                return (
                  <TemplateCard
                    key={item.id}
                    template={item.template}
                    variant={cardVariant}
                    onDeploy={handleDeploy}
                    detailHref={detailBasePath ? `${detailBasePath}/${item.slug}` : undefined}
                    canDeploy={allowDeploy}
                    onSelect={onSelect}
                    isSelected={selectedTemplateId === item.id}
                    onView={() => onTemplateEvent?.('detail_view', item, { surface: 'gallery_card' })}
                  />
                )
              }
              const pack = item.pack
              if (!pack) return null
              return (
                <CapabilityTemplateCard
                  key={item.id}
                  pack={pack}
                  onPreview={(pack) => {
                    onTemplateEvent?.('preview', item, { surface: 'gallery_card' })
                    ;(onPreviewCapabilityTemplate ?? (() => undefined))(pack)
                  }}
                  isLoading={previewLoadingCapabilityId === pack.id}
                />
              )
            })}
          </div>
        )}
        </div>
      </ScrollArea>

      {allowDeploy && orgId && workspaceSlug ? (
        <DeployDialog
          template={deployTarget}
          orgId={orgId}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open={deployOpen}
          onOpenChange={(open) => {
            setDeployOpen(open)
            if (!open) {
              setDeployTarget(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function TemplateGalleryHero({
  primary,
  firstUtilities,
  categoryStories,
  detailBasePath,
  combinationSuggestions,
  onSelectCategory,
  onTemplateEvent,
}: {
  primary: TemplateLibraryItem
  firstUtilities: TemplateLibraryItem[]
  categoryStories: ReturnType<typeof getTemplateCategoryStories>
  detailBasePath?: string
  combinationSuggestions: TemplateCombinationSuggestion[]
  onSelectCategory: (category: string) => void
  onTemplateEvent?: TemplateGalleryProps['onTemplateEvent']
}) {
  const story = getTemplateProductStory(primary)
  const primaryHref = detailBasePath ? `${detailBasePath}/${primary.slug}` : null

  useEffect(() => {
    if (combinationSuggestions.length === 0) return
    onTemplateEvent?.('combine_view', primary, {
      surface: 'gallery_hero',
      suggestion_slugs: combinationSuggestions.map((suggestion) => suggestion.slug),
    })
  }, [combinationSuggestions, onTemplateEvent, primary])

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <Card className="overflow-hidden border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.38))] shadow-none">
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  <Sparkles data-icon="inline-start" />
                  {story.eyebrow}
                </Badge>
                <Badge variant="outline">{primary.type}</Badge>
                <Badge variant="outline">{primary.category}</Badge>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  Start with {primary.name}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {story.promise} {story.timeToValue}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['First action', story.firstAction],
                  ['Expected output', story.expectedOutput],
                  ['Proof', story.proof[0] ?? 'Mission Control evidence'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-background/70 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm leading-5 text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
              {primaryHref ? (
                <Button asChild onClick={() => onTemplateEvent?.('detail_view', primary, { surface: 'hero_primary' })}>
                  <Link href={primaryHref}>
                    Preview first utility
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(story.examplePrompts[0] ?? '')
                  onTemplateEvent?.('first_run', primary, {
                    surface: 'hero_example_prompt',
                    prompt: story.examplePrompts[0],
                    copied: true,
                  })
                }}
              >
                Copy first prompt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <Card className="border-border/70 shadow-none">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Best first utilities</p>
            </div>
            <div className="space-y-2">
              {firstUtilities.slice(0, 4).map((item, index) => {
                const href = detailBasePath ? `${detailBasePath}/${item.slug}` : null
                const row = (
                  <>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.name}</span>
                    <Badge variant="outline">{item.type}</Badge>
                  </>
                )
                return href ? (
                  <Link
                    key={item.slug}
                    href={href}
                    onClick={() => onTemplateEvent?.('detail_view', item, { surface: 'best_first_utilities' })}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    {row}
                  </Link>
                ) : (
                  <div key={item.slug} className="flex items-center gap-2 rounded-lg border px-3 py-2">{row}</div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        <TemplateCombinationPanel
          compact
          basePath={detailBasePath}
          suggestions={combinationSuggestions}
          onSuggestionClick={(suggestion) => {
            const item = firstUtilities.find((candidate) => candidate.slug === suggestion.slug)
            if (item) onTemplateEvent?.('combine_click', item, { source_template_slug: primary.slug, surface: 'gallery_hero' })
          }}
        />
      </div>

      <div className="lg:col-span-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {categoryStories.map((story) => (
            <button
              key={story.key}
              type="button"
              className="rounded-xl border bg-card/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
              onClick={() => onSelectCategory(story.key)}
            >
              <p className="text-sm font-medium text-foreground">{story.label}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{story.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
