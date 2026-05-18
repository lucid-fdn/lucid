'use client'

import Link from 'next/link'
import * as React from 'react'
import {
  BarChart3,
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  Headphones,
  Megaphone,
  Search,
  UserRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CapabilityAvatarStack } from '@/components/ui/capability-avatar-stack'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ProjectCardShell } from '@/components/projects/project-card-shell'
import { CanvasGridSurface } from '@/components/ui/canvas-grid-surface'
import { LogoIcon } from '@/components/ui/logo-icon'
import {
  createCapabilityRegistryIndex,
  getTemplateCapabilityRefs,
  resolveCapabilityIconItems,
} from '@/lib/capabilities/icon-resolver'
import { cn } from '@/lib/utils'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

interface TemplateCardProps {
  template: TemplateCatalogEntry
  onDeploy?: (template: TemplateCatalogEntry) => void
  detailHref?: string
  canDeploy?: boolean
  onSelect?: (template: TemplateCatalogEntry) => void
  isSelected?: boolean
  hideDescription?: boolean
  variant?: 'compact' | 'full'
  availableUnifiedSkills?: UnifiedSkillItem[]
  onView?: () => void
}

type TemplatePreviewSlot =
  | { type: 'label'; value: string }
  | { type: 'fallback'; key: string; icon: ComponentType<{ className?: string }> }

function getTemplateLabelSlots(template: TemplateCatalogEntry): TemplatePreviewSlot[] {
  if (template.spec.kind !== 'team') return []
  return template.spec.members.slice(0, 4).map((member) => ({
    type: 'label',
    value: member.role.slice(0, 2).toUpperCase(),
  }))
}

function getTemplateFallbackSlots(template: TemplateCatalogEntry): TemplatePreviewSlot[] {
  const haystack = [
    template.slug,
    template.name,
    template.category,
    template.description ?? '',
    ...(template.tags ?? []),
  ].join(' ').toLowerCase()

  const primary = haystack.match(/\b(support|helpdesk|customer)\b/)
    ? Headphones
    : haystack.match(/\b(sales|prospect|revenue|outreach|crm)\b/)
      ? BriefcaseBusiness
      : haystack.match(/\b(marketing|brand|social|content|growth)\b/)
        ? Megaphone
        : haystack.match(/\b(research|intel|monitor|analysis)\b/)
          ? Search
          : haystack.match(/\b(brief|executive|ceo|report)\b/)
            ? BarChart3
            : haystack.match(/\b(contract|legal|document)\b/)
              ? FileText
              : UserRound

  return [
    { type: 'fallback', key: 'primary', icon: primary },
    { type: 'fallback', key: template.kind, icon: template.kind === 'team' ? BriefcaseBusiness : UserRound },
    { type: 'fallback', key: template.category, icon: FolderKanban },
  ]
}

function getPreviewGridClass(slotCount: number) {
  if (slotCount <= 3) return 'grid-cols-3'
  return 'grid-cols-4'
}

function getTemplateMeta(template: TemplateCatalogEntry) {
  if (template.spec.kind === 'team') {
    return {
      label: 'team',
      dot: 'bg-emerald-400',
      text: 'text-muted-foreground',
      summary: `${template.spec.members.length} roles`,
    }
  }

  return {
    label: 'agent',
    dot: 'bg-sky-400',
    text: 'text-muted-foreground',
    summary: `${(template.spec.plugins ?? []).length} integrations`,
  }
}

function formatCategoryLabel(category: string): string {
  return category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getCategoryBadgeClass(category: string): string {
  switch (category.toLowerCase()) {
    case 'marketing':
    case 'growth':
    case 'content':
    case 'social':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'sales':
    case 'prospecting':
    case 'revenue':
      return 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300'
    case 'support':
    case 'success':
    case 'operations':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'engineering':
    case 'dev':
    case 'product':
      return 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
    case 'strategy':
    case 'research':
    case 'finance':
      return 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

export function TemplateCard({
  template,
  onDeploy,
  detailHref,
  canDeploy = false,
  onSelect,
  isSelected = false,
  hideDescription = false,
  variant = 'full',
  availableUnifiedSkills = [],
  onView,
}: TemplateCardProps) {
  const capabilityRegistry = React.useMemo(
    () => createCapabilityRegistryIndex(availableUnifiedSkills),
    [availableUnifiedSkills],
  )
  const capabilitySlots = React.useMemo(
    () => resolveCapabilityIconItems(getTemplateCapabilityRefs(template), capabilityRegistry).slice(0, 7),
    [capabilityRegistry, template],
  )
  const fallbackSlots = React.useMemo(() => {
    if (capabilitySlots.length > 0) return []
    const labels = getTemplateLabelSlots(template)
    return labels.length > 0 ? labels : getTemplateFallbackSlots(template)
  }, [capabilitySlots.length, template])
  const visibleSlots = capabilitySlots.length > 0 ? capabilitySlots : fallbackSlots
  const meta = getTemplateMeta(template)
  const isSelectable = !!onSelect
  const showMenu = !!detailHref || (!!canDeploy && !!onDeploy)
  const isCompact = variant === 'compact'

  return (
    <ProjectCardShell
      title={template.name}
      compact={isCompact}
      role={isSelectable ? 'button' : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={isSelectable ? () => onSelect(template) : undefined}
      onKeyDown={isSelectable ? ((event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(template)
        }
      }) : undefined}
      badge={(
        <Badge variant="outline" className={cn("h-4 px-1.25 text-[8px] font-medium", getCategoryBadgeClass(template.category))}>
          {formatCategoryLabel(template.category)}
        </Badge>
      )}
      description={hideDescription ? undefined : template.description ?? undefined}
      className={cn(
        'shadow-none',
        isSelectable && 'cursor-pointer',
        isSelected && 'border-primary ring-1 ring-primary/30',
      )}
      menu={showMenu ? (
        <>
          {detailHref ? (
            <DropdownMenuItem asChild>
              <Link href={detailHref} onClick={onView}>View</Link>
            </DropdownMenuItem>
          ) : null}
          {canDeploy && onDeploy ? (
            <DropdownMenuItem onClick={() => onDeploy(template)}>
              Deploy
            </DropdownMenuItem>
          ) : null}
        </>
      ) : undefined}
      footer={canDeploy && onDeploy ? (
        <>
          <div />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => onDeploy(template)}>
              Deploy
            </Button>
          </div>
        </>
      ) : undefined}
      contentClassName={isCompact ? "-mt-3 pt-0" : "-mt-1 pt-1"}
      background={!isCompact ? (
        <>
          <CanvasGridSurface rounded />
          <div className="absolute inset-x-0 top-0 z-[1] h-[70%] bg-gradient-to-b from-background/95 via-background/55 to-transparent" />
        </>
      ) : undefined}
    >
      {isCompact ? (
        <div className="flex items-center justify-between gap-2.5">
          {capabilitySlots.length > 0 ? (
            <CapabilityAvatarStack
              items={capabilitySlots}
              avatarClassName="!size-6"
              iconSize={12}
              max={4}
              className="opacity-100"
            />
          ) : (
            <div className="flex items-center">
              {fallbackSlots.slice(0, 4).map((slot, index, stack) => {
              const FallbackIcon = slot.type === 'fallback' ? slot.icon : null
              return (
                <div
                  key={slot.type === 'label' ? slot.value : slot.key}
                  className={cn(
                    "relative flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-background dark:border-white/10",
                    index > 0 && "-ml-1.5",
                  )}
                  style={{ zIndex: stack.length - index }}
                >
                  {slot.type === 'label' ? (
                    <span className="text-[8px] font-medium text-muted-foreground">
                      {slot.value}
                    </span>
                  ) : FallbackIcon ? (
                    <FallbackIcon className="h-3 w-3 text-muted-foreground" />
                  ) : null}
                </div>
              )
            })}
            </div>
          )}
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            <span className="truncate text-[9px] capitalize text-muted-foreground">
              {meta.label}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[135px] flex-col justify-between pt-2">
          <div className="flex flex-1 items-center justify-center pt-3">
            {visibleSlots.length > 0 ? (
              <div className={cn('grid w-fit gap-[10px]', getPreviewGridClass(visibleSlots.length))}>
                {capabilitySlots.length > 0 ? (
                  capabilitySlots.map((slot) => (
                    <div
                      key={slot.slug}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 transition-colors group-hover:bg-accent/50 dark:border-white/10"
                    >
                      <LogoIcon
                        slug={slot.slug}
                        category={slot.category}
                        alwaysOn={slot.alwaysOn}
                        section={slot.section}
                        size={18}
                        className="h-[18px] w-[18px] object-contain"
                      />
                    </div>
                  ))
                ) : (
                  fallbackSlots.map((slot) => {
                    const FallbackIcon = slot.type === 'fallback' ? slot.icon : null
                    return slot.type === 'label' ? (
                    <div
                      key={slot.value}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 text-xs font-medium text-muted-foreground dark:border-white/10"
                    >
                      {slot.value}
                    </div>
                  ) : FallbackIcon ? (
                    <div
                      key={slot.key}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 text-muted-foreground transition-colors group-hover:bg-accent/50 dark:border-white/10"
                    >
                      <FallbackIcon className="h-4 w-4" />
                    </div>
                  ) : null
                  })
                )}
              </div>
            ) : (
              <div className="grid w-fit grid-cols-3 gap-[10px]">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-background/95 text-muted-foreground dark:border-white/10"
                  >
                    <FolderKanban className="h-4 w-4" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 pt-4">
            <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
            <span className={cn('truncate capitalize text-xs', meta.text)}>
              {meta.label} | {meta.summary}
            </span>
          </div>
        </div>
      )}
    </ProjectCardShell>
  )
}
