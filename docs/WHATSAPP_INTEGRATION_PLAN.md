# WhatsApp Integration Implementation Plan

## Overview
Integrate WhatsApp Business API as a channel for AI assistants in LucidMerged, reusing existing infrastructure.

## Prerequisites (Already Built)
- ✅ Worker system (Sprints 1-3)
- ✅ Telegram channel (similar architecture)
- ✅ ChannelOutput interface
- ✅ Message processing pipeline
- ✅ Memory system
- ✅ Streaming delivery

## What We're Building

### 1. WhatsApp Business API Connector (~300 lines)
- Webhook handler for incoming messages
- Message sending via Cloud API
- Status tracking (read receipts, delivery)

### 2. Database Schema Updates (~50 lines SQL)
- Add WhatsApp connection fields to `ai_assistants`
- Store verification tokens and credentials

### 3. Frontend UI (~200 lines)
- Channel management page
- WhatsApp connection flow
- QR code pairing (if using WhatsApp Web approach)
- Status indicators

### 4. API Routes (~100 lines)
- Webhook endpoint for WhatsApp
- Connection management
- Status updates

## Implementation Steps

### Phase 1: Database Schema
```sql
-- Add WhatsApp fields to ai_assistants
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ;

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_assistants_whatsapp_phone 
  ON ai_assistants(whatsapp_phone_number_id) 
  WHERE whatsapp_connected = true;
```

### Phase 2: WhatsApp Connector
```typescript
// worker/src/channels/whatsapp/WhatsAppBusinessAPI.ts
export class WhatsAppBusinessAPI implements ChannelAdapter {
  async sendMessage(to: string, text: string): Promise<void>
  async handleWebhook(event: WhatsAppWebhookEvent): Promise<void>
  async getStatus(messageId: string): Promise<MessageStatus>
}
```

### Phase 3: Webhook Handler
```typescript
// src/app/api/webhooks/whatsapp/route.ts
// Verify webhook (Meta requirement)
// Parse incoming messages
// Insert into assistant_inbound_events
// Existing worker processes automatically
```

### Phase 4: Frontend
```typescript
// src/app/(app)/[workspace-slug]/assistant/channels/page.tsx
// List connected channels (WhatsApp, Telegram)
// Add WhatsApp connection flow
// Display status and metrics
```

## Timeline
- Day 1: Database + WhatsApp connector
- Day 2: Webhook handler + testing
- Day 3: Frontend UI
- Day 4: Integration testing
- Day 5: Production deployment

Total: **5 days** (vs. 4 weeks for separate product)