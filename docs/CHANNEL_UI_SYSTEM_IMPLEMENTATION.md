# Channel UI System Implementation Guide

> **Apple/YC Grade Multi-Channel UI System**  
> **Status:** Foundation Complete ✅  
> **Last Updated:** 2026-02-14

## Overview

This document describes the centralized, production-grade multi-channel UI system built for Discord, Slack, and all existing channels. The system follows Apple design principles and YC-grade engineering standards.

---

## 🏗️ Architecture

### Component Hierarchy

```
src/lib/channels/
└── types.ts ..................... Centralized type system & validation

src/components/channels/
├── channel-icon.tsx ............. Reusable channel icons (emoji/Lucide)
├── channel-badge.tsx ............ Status badges with visual indicators
├── channel-deactivation-banner.tsx (existing)
└── [future]
    ├── channel-form-dialog.tsx .. Modal form for creating channels
    ├── channel-list.tsx ......... List view with badges/actions
    └── setup-guides/
        ├── discord-guide.tsx
        └── slack-guide.tsx
```

---

## 📦 What's Built

### 1. Centralized Type System (`src/lib/channels/types.ts`)

**Purpose:** Single source of truth for all channel-related types, validation, and metadata.

**Key Features:**
- ✅ Type-safe channel definitions
- ✅ Validation schemas (Zod)
- ✅ Channel metadata (icons, colors, docs links)
- ✅ Helper functions for required fields
- ✅ Form validation logic

**Example Usage:**

```typescript
import { 
  CHANNEL_TYPES, 
  getChannelMetadata, 
  validateChannelForm 
} from '@/lib/channels/types'

// Get metadata
const discordMeta = getChannelMetadata('discord')
console.log(discordMeta.emoji) // 🎮
console.log(discordMeta.docsUrl) // https://discord.com/developers/docs

// Validate form
const validation = validateChannelForm({
  channelType: 'discord',
  connectionMode: 'byob',
  botToken: 'MTIz...',
  channelId: '123456789',
})
// validation.isValid === true
// validation.errors === []
```

### 2. Channel Icon Component

**Path:** `src/components/channels/channel-icon.tsx`

**Features:**
- Supports emoji (default) and Lucide icon variants
- Accessible (aria-label)
- Consistent sizing and styling

**Example Usage:**

```tsx
import { ChannelIcon } from '@/components/channels/channel-icon'

// Emoji variant (default)
<ChannelIcon type="discord" />
// Renders: 🎮

// Lucide icon variant
<ChannelIcon type="discord" variant="icon" size={20} />
// Renders: <Hash size={20} />
```

### 3. Channel Badge Component

**Path:** `src/components/channels/channel-badge.tsx`

**Features:**
- Visual status indicators (active, error, pending, inactive)
- Automatic color coding
- Optional icon display
- Tailwind-based styling

**Example Usage:**

```tsx
import { ChannelBadge } from '@/components/channels/channel-badge'

// Active Discord channel
<ChannelBadge type="discord" status="active" />
// Renders: 🎮 Discord (green badge)

// Error state
<ChannelBadge type="slack" status="error" showIcon={false} />
// Renders: Slack • Error (red badge)
```

---

## 🎨 Design System Integration

### Color Palette

Each channel type has a defined color from the metadata:

| Channel   | Color Class       | Hex Equivalent |
|-----------|-------------------|----------------|
| Telegram  | `bg-blue-500`     | #3B82F6        |
| WhatsApp  | `bg-green-500`    | #22C55E        |
| Web       | `bg-purple-500`   | #A855F7        |
| Discord   | `bg-indigo-500`   | #6366F1        |
| Slack     | `bg-pink-500`     | #EC4899        |

### Status Colors

| Status   | Background         | Text            | Border               |
|----------|--------------------|-----------------|----------------------|
| Active   | `bg-green-500/10`  | `text-green-700`| `border-green-500/20`|
| Error    | `bg-red-500/10`    | `text-red-700`  | `border-red-500/20`  |
| Pending  | `bg-yellow-500/10` | `text-yellow-700`|`border-yellow-500/20`|
| Inactive | `bg-gray-500/10`   | `text-gray-700` | `border-gray-500/20` |

---

## 🚀 Integration Guide

### Step 1: Create Channel Form Dialog

**File:** `src/components/channels/channel-form-dialog.tsx`

```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHANNEL_TYPES, type ChannelType, getRequiredFields } from '@/lib/channels/types'
import { ChannelIcon } from './channel-icon'

interface ChannelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: any) => Promise<void>
}

export function ChannelFormDialog({ open, onOpenChange, onSubmit }: ChannelFormDialogProps) {
  const [channelType, setChannelType] = useState<ChannelType>('telegram')
  const [formData, setFormData] = useState({
    botToken: '',
    signingSecret: '',
    channelId: '',
  })

  const required = getRequiredFields(channelType, 'byob')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Channel Type Selector */}
          <div>
            <Label>Channel Type</Label>
            <Select value={channelType} onValueChange={(v) => setChannelType(v as ChannelType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <ChannelIcon type={type} />
                      <span className="capitalize">{type}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Discord Form */}
          {channelType === 'discord' && (
            <>
              <div>
                <Label>Bot Token *</Label>
                <Input
                  type="password"
                  placeholder="MTIz..."
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                />
              </div>
              <div>
                <Label>Channel ID *</Label>
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

          {/* Slack Form */}
          {channelType === 'slack' && (
            <>
              <div>
                <Label>Bot Token *</Label>
                <Input
                  type="password"
                  placeholder="xoxb-..."
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                />
              </div>
              <div>
                <Label>Signing Secret *</Label>
                <Input
                  type="password"
                  placeholder="abc123..."
                  value={formData.signingSecret}
                  onChange={(e) => setFormData({ ...formData, signingSecret: e.target.value })}
                />
              </div>
              <div>
                <Label>Channel ID *</Label>
                <Input
                  placeholder="C1234567890"
                  value={formData.channelId}
                  onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
                />
              </div>
            </>
          )}

          <Button onClick={() => onSubmit({ channelType, ...formData })} className="w-full">
            Create Channel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 2: Integrate into Assistant Detail Page

**Example integration in assistant detail page:**

```tsx
'use client'

import { useState } from 'react'
import { ChannelBadge } from '@/components/channels/channel-badge'
import { ChannelFormDialog } from '@/components/channels/channel-form-dialog'
import { Button } from '@/components/ui/button'

export function AssistantChannelsTab({ assistantId }: { assistantId: string }) {
  const [showDialog, setShowDialog] = useState(false)
  const [channels, setChannels] = useState([])

  const handleCreateChannel = async (data: any) => {
    const res = await fetch(`/api/assistants/${assistantId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const { channel } = await res.json()
      setChannels([...channels, channel])
      setShowDialog(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Channels</h3>
        <Button onClick={() => setShowDialog(true)}>Add Channel</Button>
      </div>

      {/* Channel List */}
      <div className="space-y-2">
        {channels.map((ch) => (
          <div key={ch.id} className="flex items-center justify-between p-3 border rounded-lg">
            <ChannelBadge type={ch.channel_type} status={ch.is_active ? 'active' : 'inactive'} />
            <div className="text-xs text-muted-foreground">
              Created {new Date(ch.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      <ChannelFormDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSubmit={handleCreateChannel}
      />
    </div>
  )
}
```

---

## 📚 Setup Guides (To Be Created)

### Discord Setup Guide Content

```markdown
## Discord Bot Setup

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" → Name your bot
   - Navigate to "Bot" tab → Click "Reset Token" → Copy token

2. **Enable Privileged Intents**
   - In Bot settings, enable "Message Content Intent"
   - Save changes

3. **Invite Bot to Server**
   - Go to OAuth2 → URL Generator
   - Select scopes: `bot`
   - Select permissions: `Send Messages`, `Read Message History`
   - Copy URL → Open in browser → Add to your server

4. **Get Channel ID**
   - Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
   - Right-click the channel → Copy Channel ID

5. **Configure in Lucid**
   - Paste Bot Token
   - Paste Channel ID
   - Click Create Channel
```

### Slack Setup Guide Content

```markdown
## Slack App Setup

1. **Create Slack App**
   - Go to [Slack API](https://api.slack.com/apps)
   - Click "Create New App" → "From scratch"
   - Name your app + select workspace

2. **Configure OAuth Scopes**
   - Go to OAuth & Permissions
   - Add Bot Token Scopes:
     - `chat:write`
     - `channels:history`
     - `channels:read`
     - `groups:history`

3. **Install to Workspace**
   - Click "Install to Workspace"
   - Copy Bot User OAuth Token (starts with `xoxb-`)

4. **Get Signing Secret**
   - Go to Basic Information
   - Copy Signing Secret

5. **Get Channel ID**
   - Right-click channel in Slack → View channel details
   - Copy ID from URL (e.g., `C1234567890`)

6. **Configure Webhook**
   - After creating channel in Lucid, copy webhook URL
   - Go to Event Subscriptions in Slack
   - Paste webhook URL
   - Subscribe to events: `message.channels`, `message.groups`
```

---

## ✅ Validation & Error Handling

The type system includes comprehensive validation:

```typescript
// Client-side validation (before API call)
import { validateChannelForm } from '@/lib/channels/types'

const validation = validateChannelForm(formData)
if (!validation.isValid) {
  console.error(validation.errors)
  // Show errors to user
}

// API automatically validates via Zod schemas (already implemented)
```

---

## 🎯 Next Steps

### Immediate (Required for Full UI Integration)

1. **Create `channel-form-dialog.tsx`** (see Step 1 above)
2. **Create `channel-list.tsx`** - Reusable list view component
3. **Integrate into assistant detail page** (see Step 2 above)
4. **Create setup guide components** (`setup-guides/discord-guide.tsx`, `setup-guides/slack-guide.tsx`)

### Future Enhancements

- **Inline editing** of channel config (prefix, thread support, etc.)
- **Real-time status monitoring** (WebSocket/polling for channel health)
- **Advanced routing config UI** (dedicated channel mode, custom filters)
- **Channel analytics** (message counts, response times)
- **Multi-channel orchestration** (route to multiple channels based on rules)

---

## 📐 Code Quality Standards

This implementation follows:

✅ **Apple Design Principles**
- Clean, minimal UI
- Consistent spacing (4px grid)
- Clear visual hierarchy
- Accessible (ARIA labels, keyboard navigation)

✅ **YC Engineering Standards**
- Centralized, DRY code
- Type-safe (TypeScript + Zod)
- Reusable components
- Comprehensive validation
- Clear documentation

✅ **LucidMerged Patterns**
- shadcn/ui primitives
- Server Components where possible
- Zod validation on client & server
- `@/` import aliases
- Tailwind CSS utilities

---

## 🧪 Testing Checklist

### Unit Tests (To Be Created)

```typescript
// tests/components/channel-badge.test.tsx
import { render } from '@testing-library/react'
import { ChannelBadge } from '@/components/channels/channel-badge'

describe('ChannelBadge', () => {
  it('renders Discord badge correctly', () => {
    const { getByText } = render(<ChannelBadge type="discord" />)
    expect(getByText('Discord')).toBeInTheDocument()
  })

  it('shows error status', () => {
    const { getByText } = render(<ChannelBadge type="slack" status="error" />)
    expect(getByText('Error')).toBeInTheDocument()
  })
})
```

### Integration Tests

1. ✅ API validation (already tested via existing tests)
2. ⏳ Form submission flow
3. ⏳ Channel creation → webhook URL generation
4. ⏳ Error state display

---

## 📖 API Reference

### `ChannelIcon`

```typescript
interface ChannelIconProps {
  type: ChannelType
  variant?: 'emoji' | 'icon'  // Default: 'emoji'
  className?: string
  size?: number              // For icon variant, default: 16
}
```

### `ChannelBadge`

```typescript
interface ChannelBadgeProps {
  type: ChannelType
  status?: ChannelStatus     // Default: 'active'
  showIcon?: boolean         // Default: true
  className?: string
}
```

### Helper Functions

```typescript
// Get metadata
getChannelMetadata(type: ChannelType): ChannelMetadata

// Check hosted support
supportsHostedMode(type: ChannelType): boolean

// Get required form fields
getRequiredFields(type: ChannelType, mode: ConnectionMode): string[]

// Validate form data
validateChannelForm(data: ChannelFormData): { isValid: boolean; errors: string[] }
```

---

## 🎨 Example Layouts

### Channel Card Layout

```tsx
<div className="flex items-center justify-between p-4 border rounded-lg">
  <div className="flex items-center gap-3">
    <ChannelIcon type="discord" variant="icon" size={24} />
    <div>
      <div className="font-medium">Discord Bot</div>
      <div className="text-sm text-muted-foreground">#general</div>
    </div>
  </div>
  <ChannelBadge type="discord" status="active" showIcon={false} />
</div>
```

### Compact List View

```tsx
<div className="space-y-1">
  {channels.map((ch) => (
    <div key={ch.id} className="flex items-center gap-2 p-2 hover:bg-accent rounded">
      <ChannelBadge type={ch.type} status={ch.status} />
      <span className="text-sm flex-1">{ch.name}</span>
    </div>
  ))}
</div>
```

---

## 🚨 Important Notes

1. **Backend is 100% ready** - API validation, webhook routes, worker processors all complete
2. **Type system is centralized** - Always import from `@/lib/channels/types`
3. **Components are framework-agnostic** - Can be used in any page/layout
4. **Secrets are encrypted** - Never expose bot tokens in UI (use type="password")
5. **Validation runs twice** - Client (UX) + Server (security)

---

## 📞 Support & Maintenance

For questions or enhancements:
- Review existing patterns in `src/components/ui/`
- Follow shadcn/ui component structure
- Use Zod for validation
- Document new components in this file

**Last Updated:** 2026-02-14  
**Next Review:** After first UI integration