'use client'

import type { ReactNode } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Trash2 } from 'lucide-react'

export interface ChannelAdminAlias {
  id: string
  alias: string
}

export interface ChannelAdminAgentCard {
  key: string
  name: string
  aliases: string[]
  isDefault?: boolean
  isCurrent?: boolean
  meta?: string | null
  extra?: ReactNode
}

export function ChannelDefaultBadge({
  kind,
}: {
  kind: 'default' | 'override'
}) {
  return kind === 'default' ? (
    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-300">
      Default
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-sky-200">
      Override
    </span>
  )
}

export function ChannelOwnershipCard({
  title,
  description,
  currentTitle = 'Default agent',
  currentLabel,
  actionLabel,
  actionDisabled,
  actionBusy,
  onAction,
  secondaryActionLabel,
  secondaryActionDisabled,
  secondaryActionBusy,
  onSecondaryAction,
  helper,
  isLoading,
  onRefresh,
  children,
}: {
  title: string
  description: string
  currentTitle?: string
  currentLabel: string
  actionLabel: string
  actionDisabled?: boolean
  actionBusy?: boolean
  onAction: () => void
  secondaryActionLabel?: string
  secondaryActionDisabled?: boolean
  secondaryActionBusy?: boolean
  onSecondaryAction?: (() => void) | null
  helper?: string | null
  isLoading?: boolean
  onRefresh?: () => void
  children?: ReactNode
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium text-foreground">{title}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 text-[10px] text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        ) : null}
      </div>
      <div className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2">
        <p className="text-[10px] font-medium text-foreground">{currentTitle}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{currentLabel}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {actionLabel}
        </button>
        {secondaryActionLabel && onSecondaryAction ? (
          <button
            type="button"
            onClick={onSecondaryAction}
            disabled={secondaryActionDisabled}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {secondaryActionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {secondaryActionLabel}
          </button>
        ) : null}
        {helper ? <p className="text-[10px] text-muted-foreground">{helper}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function ChannelAliasManager({
  title = 'Aliases',
  description,
  aliases,
  inputPlaceholder,
  draft,
  onDraftChange,
  onCreate,
  onDelete,
  isSaving,
  deletingAliasId,
  conflictMessage,
}: {
  title?: string
  description?: ReactNode
  aliases: ChannelAdminAlias[]
  inputPlaceholder: string
  draft: string
  onDraftChange: (value: string) => void
  onCreate: () => void
  onDelete: (aliasId: string) => void
  isSaving?: boolean
  deletingAliasId?: string | null
  conflictMessage?: string | null
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] font-medium text-foreground">{title}</p>
        {description ? <p className="text-[10px] text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {aliases.length > 0 ? (
          aliases.map((alias) => (
            <span
              key={alias.id}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 px-2 py-1 text-[10px] text-foreground"
            >
              <span>{alias.alias}</span>
              <button
                type="button"
                onClick={() => onDelete(alias.id)}
                disabled={deletingAliasId === alias.id}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                aria-label={`Delete alias ${alias.alias}`}
              >
                {deletingAliasId === alias.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </span>
          ))
        ) : (
          <p className="text-[10px] text-muted-foreground">No aliases yet.</p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={inputPlaceholder}
          className="h-8 flex-1 rounded-md border border-border/50 bg-background/70 px-2 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={isSaving || draft.trim().length === 0 || Boolean(conflictMessage)}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Add alias
        </button>
      </div>
      {conflictMessage ? <p className="text-[10px] text-amber-200">{conflictMessage}</p> : null}
    </div>
  )
}

export function ChannelAgentRoster({
  title,
  agents,
}: {
  title: string
  agents: ChannelAdminAgentCard[]
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-foreground">{title}</p>
      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.key}
            className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10px] font-medium text-foreground">{agent.name}</p>
              {agent.isDefault ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-emerald-300">
                  Default
                </span>
              ) : null}
              {agent.isCurrent ? (
                <span className="inline-flex items-center rounded-full border border-border/50 bg-background/80 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  This assistant
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {agent.meta ?? (agent.aliases.length > 0 ? `Aliases: ${agent.aliases.join(', ')}` : 'No aliases')}
            </p>
            {agent.extra ? <div className="mt-1">{agent.extra}</div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
