/**
 * Channel Form Dialog Component
 * 
 * Modal dialog for creating new channels with dynamic forms based on channel type.
 * Handles validation, error display, and API submission.
 */

'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/ui/components/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import {
  CONNECTABLE_CHANNEL_TYPES,
  type ChannelType,
  type ChannelFormData,
  getChannelMetadata,
  validateChannelForm,
  getRequiredFields,
} from '@/lib/channels/types'
import { LogoIcon } from '@/components/ui/logo-icon'

interface ChannelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ChannelFormData) => Promise<{ success: boolean; error?: string }>
}

export function ChannelFormDialog({ open, onOpenChange, onSubmit }: ChannelFormDialogProps) {
  const [channelType, setChannelType] = useState<ChannelType>('telegram')
  const [formData, setFormData] = useState({
    botToken: '',
    channelId: '',
    phoneNumber: '',
    phoneNumberId: '',
    appSecret: '',
    verifyToken: '',
    businessAccountId: '',
  })
  const [routingConfig, setRoutingConfig] = useState({
    dedicated_channel: false,
    prefix: '',
    respond_on_mention: true,
    thread_support: false,
    ignore_bots: true,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const metadata = getChannelMetadata(channelType)
  const _requiredFields = getRequiredFields(channelType, 'byob')

  const handleSubmit = async () => {
    setError(null)

    const data: ChannelFormData = {
      channelType,
      connectionMode: 'byob',
      ...formData,
      inboundRoutingConfig: routingConfig,
    }

    const validation = validateChannelForm(data)
    if (!validation.isValid) {
      setError(validation.errors.join(', '))
      return
    }

    setIsSubmitting(true)
    try {
      const result = await onSubmit(data)
      if (result.success) {
        // Reset form
        setFormData({
          botToken: '',
          channelId: '',
          phoneNumber: '',
          phoneNumberId: '',
          appSecret: '',
          verifyToken: '',
          businessAccountId: '',
        })
        setRoutingConfig({
          dedicated_channel: false,
          prefix: '',
          respond_on_mention: true,
          thread_support: false,
          ignore_bots: true,
        })
        onOpenChange(false)
      } else {
        setError(result.error || 'Failed to create channel')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Channel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Channel Type Selector */}
          <div>
            <Label>Channel Type</Label>
            <Select value={channelType} onValueChange={(v) => setChannelType(v as ChannelType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a channel type" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {CONNECTABLE_CHANNEL_TYPES.map((type) => {
                  const meta = getChannelMetadata(type)
                  return (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <LogoIcon slug={type} size={16} />
                        <span className="capitalize">{meta.name}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Discord Form */}
          {channelType === 'discord' && (
            <>
              <div>
                <Label>
                  Bot Token <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="password"
                  placeholder="MTIz..."
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  From Discord Developer Portal → Bot → Reset Token
                </p>
              </div>
              <div>
                <Label>
                  Channel ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="123456789012345678"
                  value={formData.channelId}
                  onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Right-click channel → Copy Channel ID
                </p>
              </div>
            </>
          )}

          {/* Telegram Form */}
          {channelType === 'telegram' && (
            <div>
              <Label>
                Bot Token <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                placeholder="123456:ABC-DEF..."
                value={formData.botToken}
                onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                From @BotFather on Telegram
              </p>
            </div>
          )}

          {channelType === 'whatsapp' && (
            <>
              <div>
                <Label>
                  Access Token <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="password"
                  placeholder="EAAG..."
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Phone Number ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="123456789012345"
                  value={formData.phoneNumberId}
                  onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
                />
              </div>
              <div>
                <Label>Business Phone Number</Label>
                <Input
                  placeholder="+1234567890"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  App Secret <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="password"
                  placeholder="Meta app secret"
                  value={formData.appSecret}
                  onChange={(e) => setFormData({ ...formData, appSecret: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  Verify Token <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="lucid-wa-verify-token"
                  value={formData.verifyToken}
                  onChange={(e) => setFormData({ ...formData, verifyToken: e.target.value })}
                />
              </div>
              <div>
                <Label>Business Account ID</Label>
                <Input
                  placeholder="Optional WABA ID"
                  value={formData.businessAccountId}
                  onChange={(e) => setFormData({ ...formData, businessAccountId: e.target.value })}
                />
              </div>
            </>
          )}

          {/* Inbound Routing Config (Discord only) */}
          {channelType === 'discord' && (
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium">Routing Config</h4>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dedicated"
                  checked={routingConfig.dedicated_channel}
                  onCheckedChange={(checked) =>
                    setRoutingConfig({ ...routingConfig, dedicated_channel: !!checked })
                  }
                />
                <label htmlFor="dedicated" className="text-sm cursor-pointer">
                  Dedicated channel (respond to all messages)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mention"
                  checked={routingConfig.respond_on_mention}
                  onCheckedChange={(checked) =>
                    setRoutingConfig({ ...routingConfig, respond_on_mention: !!checked })
                  }
                />
                <label htmlFor="mention" className="text-sm cursor-pointer">
                  Respond when mentioned
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="threads"
                  checked={routingConfig.thread_support}
                  onCheckedChange={(checked) =>
                    setRoutingConfig({ ...routingConfig, thread_support: !!checked })
                  }
                />
                <label htmlFor="threads" className="text-sm cursor-pointer">
                  Enable thread support
                </label>
              </div>

              <div>
                <Label>Command Prefix (optional)</Label>
                <Input
                  placeholder="!lucid or /ask"
                  value={routingConfig.prefix}
                  onChange={(e) => setRoutingConfig({ ...routingConfig, prefix: e.target.value })}
                  maxLength={32}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Respond to messages starting with this prefix
                </p>
              </div>
            </div>
          )}

          {/* Setup Guide Link */}
          <a
            href={metadata.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View {metadata.name} setup guide
          </a>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button onClick={handleSubmit} className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              `Create ${metadata.name} Channel`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
