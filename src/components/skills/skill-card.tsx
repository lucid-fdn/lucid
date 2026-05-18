'use client'

import { Loader2, Power, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusSwitch } from '@/ui/components/status-switch'
import { LogoIcon } from '@/components/ui/logo-icon'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/animate-ui/primitives/radix/tooltip'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

// =============================================================================
// HEALTH INDICATOR
// =============================================================================

function HealthIndicator({ item }: { item: UnifiedSkillItem }) {
  if (!item.health_status || item.health_status === 'healthy') return null

  if (item.health_status === 'expiring') {
    return (
      <span className="flex items-center gap-1" title={item.health_message ?? undefined}>
        <BreathingDot color="bg-amber-500" animate size="xs" />
        <span className="text-[10px] text-amber-500">{item.health_message}</span>
      </span>
    )
  }

  if (item.health_status === 'expired' || item.health_status === 'error') {
    return (
      <span className="flex items-center gap-1" title={item.health_message ?? undefined}>
        <BreathingDot color="bg-red-500" size="xs" />
        <span className="text-[10px] text-red-400">
          {item.health_status === 'expired' ? 'Connection expired' : 'Connection error'}
        </span>
      </span>
    )
  }

  return null
}

// =============================================================================
// SKILL CARD — marketplace row
// =============================================================================

interface SkillCardProps {
  item: UnifiedSkillItem
  variant: 'installed' | 'browse'
  activationBlockedReason?: string | null
  capProjectionLabel?: string | null
  onToggle?: (item: UnifiedSkillItem, active: boolean) => void
  onInstall?: (item: UnifiedSkillItem) => void
  onUninstall?: (item: UnifiedSkillItem) => void
  onConfigure?: (item: UnifiedSkillItem) => void
  onConnect?: (item: UnifiedSkillItem) => void
  onDisconnect?: (item: UnifiedSkillItem) => void
  isBusy?: boolean
  deferConnectionUntilSelected?: boolean
}

export function SkillCard({
  item,
  variant,
  activationBlockedReason,
  capProjectionLabel,
  onToggle,
  onInstall,
  onUninstall,
  onConfigure,
  onConnect,
  onDisconnect,
  isBusy,
  deferConnectionUntilSelected = false,
}: SkillCardProps) {
  const isConnectedIntegration = item.auth_provider && item.connection_status === 'connected'
  const needsSetup = item.auth_provider && item.connection_status === 'setup_required'
  const activationBlocked = Boolean(activationBlockedReason)

  // Primary status: one clear signal per row
  const statusDot = isConnectedIntegration ? 'bg-emerald-400'
    : needsSetup ? 'bg-amber-500/50'
    : item.is_active ? 'bg-emerald-400'
    : 'bg-muted-foreground/30'

  const statusLabel = isConnectedIntegration ? 'Connected'
    : needsSetup ? 'Setup required'
    : item.is_active ? 'Active'
    : item.installed ? 'Inactive'
    : null
  const connectionLabel = item.connection_account_label
    ?? item.connection_options?.find((option) => option.id === item.selected_connection_row_id)?.account_label
    ?? null

  return (
    <div className="flex items-start gap-4 px-2 py-3.5 border-b border-border/50 last:border-b-0 group -mx-1 rounded-lg hover:bg-accent/50 hover:ring-1 hover:ring-border transition-all duration-120">
      {/* Logo — bare, no container */}
      <div className="shrink-0 flex items-center justify-center mt-0.5 w-8">
        <LogoIcon
          slug={item.slug}
          category={item.category}
          alwaysOn={item.always_on}
          section={item.section}
          size={28}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + primary status badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-foreground font-medium truncate">{item.name}</span>
          {statusLabel && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusDot)} />
              <span className={cn(
                'text-[10px]',
                isConnectedIntegration ? 'text-emerald-500' : needsSetup ? 'text-amber-600/70' : 'text-muted-foreground',
              )}>
                {statusLabel}
              </span>
            </span>
          )}
        </div>

        {/* Row 2: Description */}
        {item.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {item.description}
          </p>
        )}

        {/* Row 3: Health + metadata */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <HealthIndicator item={item} />
          {isConnectedIntegration && connectionLabel ? (
            <span className="text-[10px] text-muted-foreground">
              Connected as {connectionLabel}
            </span>
          ) : null}
          {isConnectedIntegration && !connectionLabel && (item.connection_count ?? 0) > 1 ? (
            <span className="text-[10px] text-muted-foreground">
              {item.connection_count} accounts available
            </span>
          ) : null}
          {capProjectionLabel && (
            <span className="text-[10px] text-muted-foreground">
              {capProjectionLabel}
            </span>
          )}
          {activationBlocked && (
            <span className="text-[10px] text-amber-500/80">
              {activationBlockedReason}
            </span>
          )}
          {item.update_available && (
            <span className="text-[10px] text-amber-500/70">Update available</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0 mt-1">
        {variant === 'installed' ? (
          <>
            {/* Not connected yet → Connect button */}
            {item.auth_provider && item.connection_status === 'setup_required' && (
              deferConnectionUntilSelected ? (
                <span className="text-[11px] text-amber-600/70">Needs connection</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onConnect?.(item)}
                  disabled={isBusy}
                  className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-120 disabled:opacity-50"
                >
                  {isBusy ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Connecting
                    </span>
                  ) : 'Connect'}
                </button>
              )
            )}

            {/* Connected integration → toggle + configure + disconnect */}
            {item.connection_status === 'connected' && (
              <>
                <StatusSwitch
                  checked={item.is_active ?? false}
                  onCheckedChange={(checked) => onToggle?.(item, checked)}
                  disabled={isBusy || (activationBlocked && !item.is_active)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onConfigure?.(item)}
                      className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-all duration-120 opacity-0 group-hover:opacity-100"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent >Configure</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onDisconnect?.(item)}
                      disabled={isBusy}
                      className="p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-accent transition-all duration-120 opacity-0 group-hover:opacity-100 disabled:opacity-30"
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent >Disconnect</TooltipContent>
                </Tooltip>
              </>
            )}

            {/* Non-integration installed item → toggle + configure + remove */}
            {!item.auth_provider && !item.always_on && item.installed && (
              <>
                <StatusSwitch
                  checked={item.is_active ?? false}
                  onCheckedChange={(checked) => onToggle?.(item, checked)}
                  disabled={isBusy}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onConfigure?.(item)}
                      className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-all duration-120 opacity-0 group-hover:opacity-100"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent >Configure</TooltipContent>
                </Tooltip>
                {item.removable && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onUninstall?.(item)}
                        disabled={isBusy}
                        className="p-1 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-accent transition-all duration-120 opacity-0 group-hover:opacity-100 disabled:opacity-30"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent >Remove</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Browse variant */}
            {item.installed && item.connection_status === 'connected' ? (
              <span className="text-[11px] text-emerald-500">Connected</span>
            ) : item.installed ? (
              <span className="text-[11px] text-muted-foreground">Installed</span>
            ) : item.auth_provider && !deferConnectionUntilSelected ? (
              <button
                type="button"
                onClick={() => onInstall?.(item)}
                disabled={isBusy}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-120 disabled:opacity-50"
              >
                {isBusy ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Connecting
                  </span>
                ) : 'Connect'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onInstall?.(item)}
                disabled={isBusy || activationBlocked}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium border border-border text-muted-foreground hover:border-border/80 hover:text-foreground transition-all duration-120 disabled:opacity-50"
              >
                {isBusy ? 'Adding…' : 'Add'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
