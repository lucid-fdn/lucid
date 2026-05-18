'use client'

import { Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHANNEL_METADATA, CONNECTABLE_CHANNEL_TYPES, type ChannelType } from '@/lib/channels/types'
import { LogoIcon } from '@/components/ui/logo-icon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface AddChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelType: string
  onChannelTypeChange: (v: string) => void
  connectionMode: 'byob' | 'hosted'
  onConnectionModeChange: (v: 'byob' | 'hosted') => void
  supportsHostedMode: string[]
  botToken: string
  onBotTokenChange: (v: string) => void
  phoneNumber: string
  onPhoneNumberChange: (v: string) => void
  // Teams credentials
  teamsAppId?: string
  onTeamsAppIdChange?: (v: string) => void
  teamsAppPassword?: string
  onTeamsAppPasswordChange?: (v: string) => void
  teamsTenantId?: string
  onTeamsTenantIdChange?: (v: string) => void
  isCreating: boolean
  onCreateChannel: () => void
  onOneClickConnect: (channelType: string) => void
}

export function AddChannelDialog({
  open,
  onOpenChange,
  channelType,
  onChannelTypeChange,
  connectionMode,
  onConnectionModeChange,
  supportsHostedMode,
  botToken,
  onBotTokenChange,
  phoneNumber,
  onPhoneNumberChange,
  teamsAppId = '',
  onTeamsAppIdChange,
  teamsAppPassword = '',
  onTeamsAppPasswordChange,
  teamsTenantId = 'common',
  onTeamsTenantIdChange,
  isCreating,
  onCreateChannel,
  onOneClickConnect,
}: AddChannelDialogProps) {
  const isHosted = connectionMode === 'hosted' && supportsHostedMode.includes(channelType)
  const supportsHosted = supportsHostedMode.includes(channelType)

  const isByobDisabled =
    connectionMode === 'byob' && (
      (['telegram', 'discord'].includes(channelType) && !botToken.trim()) ||
      (channelType === 'whatsapp' && !phoneNumber.trim()) ||
      (channelType === 'msteams' && (!teamsAppId.trim() || !teamsAppPassword.trim()))
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border text-foreground max-w-sm p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-sm font-medium text-foreground">Add channel</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
            Connect a messaging platform to this agent
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Platform tiles */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2.5">Platform</p>
            <div className="grid grid-cols-5 gap-1.5">
              {CONNECTABLE_CHANNEL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChannelTypeChange(type)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg border transition-all duration-120',
                    channelType === type
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-primary/50 hover:bg-accent',
                  )}
                >
                  <LogoIcon slug={type} size={22} />
                  <span className={cn(
                    'text-[9px] font-medium',
                    channelType === type ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {CHANNEL_METADATA[type].name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Mode toggle — only if hosted is supported */}
          {supportsHosted && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2.5">Mode</p>
              <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border">
                <button
                  type="button"
                  onClick={() => onConnectionModeChange('byob')}
                  className={cn(
                    'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-120',
                    connectionMode === 'byob'
                      ? 'bg-accent text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Bring your own bot
                </button>
                <button
                  type="button"
                  onClick={() => onConnectionModeChange('hosted')}
                  className={cn(
                    'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-120',
                    connectionMode === 'hosted'
                      ? 'bg-accent text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  One-click
                </button>
              </div>
            </div>
          )}

          {/* Credentials */}
          {connectionMode === 'byob' && (
            <div className="space-y-4">
              {(channelType === 'telegram' || channelType === 'discord') && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Bot token</label>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => onBotTokenChange(e.target.value)}
                    placeholder={
                      channelType === 'telegram' ? '123456789:ABCdef...'
                      : 'MTIz...'
                    }
                    className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors duration-120 font-mono"
                  />
                  {channelType === 'telegram' && (
                    <p className="text-[10px] text-muted-foreground">
                      Get this from{' '}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors duration-120"
                      >
                        @BotFather <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </p>
                  )}
                </div>
              )}
              {channelType === 'whatsapp' && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Phone number</label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => onPhoneNumberChange(e.target.value)}
                    placeholder="+1234567890"
                    className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors duration-120 font-mono"
                  />
                </div>
              )}
              {channelType === 'msteams' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-widest">App ID</label>
                    <input
                      type="text"
                      value={teamsAppId}
                      onChange={(e) => onTeamsAppIdChange?.(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors duration-120 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-widest">App password</label>
                    <input
                      type="password"
                      value={teamsAppPassword}
                      onChange={(e) => onTeamsAppPasswordChange?.(e.target.value)}
                      placeholder="Client secret from Azure AD"
                      className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors duration-120 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-widest">Tenant ID</label>
                    <input
                      type="text"
                      value={teamsTenantId}
                      onChange={(e) => onTeamsTenantIdChange?.(e.target.value)}
                      placeholder="common"
                      className="w-full h-8 px-3 rounded-md border border-border bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors duration-120 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Register your bot at{' '}
                    <a
                      href="https://dev.botframework.com/bots/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors duration-120"
                    >
                      Azure Bot Service <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </p>
                </div>
              )}
            </div>
          )}

          {connectionMode === 'hosted' && (
            <p className="text-[11px] text-muted-foreground">
              We&apos;ll handle the bot setup for you — just authorize and go.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={isHosted ? () => onOneClickConnect(channelType) : onCreateChannel}
            disabled={isCreating || (!isHosted && isByobDisabled)}
            className="w-full h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-120 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isHosted ? 'Connect with one-click' : 'Connect'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
