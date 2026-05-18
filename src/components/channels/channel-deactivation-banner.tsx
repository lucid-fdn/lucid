'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DeactivatedChannel {
  id: string
  channel_type: 'telegram' | 'discord' | 'whatsapp' | 'web'
  is_active: boolean
  metadata?: {
    deactivation_reason?: string
    deactivated_at?: string
    error_code?: string
  }
}

interface ChannelDeactivationBannerProps {
  channels: DeactivatedChannel[]
  assistantId: string
  onReactivated?: () => void
}

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  web: 'Web',
}

export function ChannelDeactivationBanner({
  channels,
  assistantId,
  onReactivated,
}: ChannelDeactivationBannerProps) {
  const deactivated = channels.filter((c) => !c.is_active)

  if (deactivated.length === 0) return null

  return (
    <div className="space-y-2">
      {deactivated.map((channel) => (
        <DeactivatedChannelAlert
          key={channel.id}
          channel={channel}
          assistantId={assistantId}
          onReactivated={onReactivated}
        />
      ))}
    </div>
  )
}

function DeactivatedChannelAlert({
  channel,
  assistantId,
  onReactivated,
}: {
  channel: DeactivatedChannel
  assistantId: string
  onReactivated?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const label = CHANNEL_LABELS[channel.channel_type] || channel.channel_type
  const reason = channel.metadata?.deactivation_reason || 'Unknown error'

  const handleReactivate = async () => {
    if (!botToken.trim()) {
      setError('Bot token is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/assistants/${assistantId}/channels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channel.id,
          botToken: botToken.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reactivate channel')
      }

      setOpen(false)
      setBotToken('')
      onReactivated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {label} channel deactivated
      </AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm">
          {reason}
          {channel.metadata?.deactivated_at && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({new Date(channel.metadata.deactivated_at).toLocaleDateString()})
            </span>
          )}
        </span>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Fix &amp; Reactivate
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reactivate {label} Channel</DialogTitle>
              <DialogDescription>
                Enter new credentials to reactivate this channel. The previous
                credentials were invalid or revoked.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="botToken">Bot Token</Label>
                <Input
                  id="botToken"
                  type="password"
                  placeholder="Enter new bot token..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  disabled={loading}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleReactivate} disabled={loading}>
                {loading ? 'Reactivating...' : 'Reactivate Channel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AlertDescription>
    </Alert>
  )
}