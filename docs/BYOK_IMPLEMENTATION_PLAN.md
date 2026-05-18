# BYOK Implementation Plan

**Goal:** Implement centralized BYOK and Lucid-managed inference through TrustGate.

**Status:** Implemented and live-smoked. See `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md` for the latest verification record.
**Estimated Time:** Completed
**Priority:** Completed P1

---

## Current State vs Target State

Current implementation note:

- Assistant routing now supports Auto, Lucid managed, and BYOK only.
- The live source of truth is `policy_config.trustgate.inference_mode`. A typed `ai_assistants.inference_mode` column can be added as an additive projection, but production does not depend on it.
- Provider keys are managed from Settings -> Provider Keys and are synced through TrustGate instead of bypassing it.
- Provider key API responses expose safe metadata only: provider, preview, status, active flag, timestamps, and audit-safe identifiers.
- Provider key add/toggle/delete requires owner/admin access and rolls back local inserts if TrustGate sync fails.
- UI smoke covered invalid key validation, valid key add, active/inactive toggles, deletion, assistant mode persistence, and real chat routing.
- Runtime choice does not bypass TrustGate. Shared, dedicated, and BYO/local runtimes use the same assistant inference policy.
- The public user-facing surface is Settings -> Provider Keys plus Assistant Detail inference mode. Older LucidGateway key lifecycle sections below are retained as historical design context for virtual gateway keys, not as the current assistant routing UX.
- The long implementation sections below are historical design notes. Use the status bullets above and the verification doc as the current source of truth.

### Legacy Baseline (historical)
```
Free       → Managed only (1 auto-key, 20 models, no customization)
Pro        → Custom keys (25 keys, unlimited models, full features)
Enterprise → Unlimited everything
```

### Implemented Direction
```
Free       → BYOK-capable where product policy allows provider keys
Pro        → BYOK + Lucid managed routing controls
Enterprise → BYOK + Lucid managed + custom routing, security, and pricing controls
```

---

## Architecture Overview

### Three-Layer Model

1. **Provider Keys** (NEW)
   - User's actual OpenAI/Anthropic/etc. API keys
   - Stored encrypted in `org_provider_keys` table
   - Managed in Settings → Provider Keys tab

2. **Assistant inference policy** (current)
   - Stored in `policy_config.trustgate.inference_mode`
   - Values are Auto, Lucid managed, and BYOK only
   - Managed from Assistant Detail

   Historical gateway-key work still exists in older sections below, but the current assistant/runtime path does not depend on creating a separate gateway key to choose inference mode.

3. **TrustGate** (integration point)
   - Receives the assistant/org routing mode
   - Uses synced org provider keys for BYOK-only mode
   - Uses Lucid-managed provider routing for Lucid managed mode
   - Chooses the safe available route in Auto mode

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ LucidMerged UI                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Settings → Provider Keys                              │
│  ├─ Add OpenAI Key (encrypted)                         │
│  ├─ Add Anthropic Key (encrypted)                      │
│  └─ Add Groq Key (encrypted)                           │
│                                                         │
│  Assistant Detail                                     │
│  ├─ Mode: Auto                                        │
│  ├─ Mode: Lucid managed                               │
│  └─ Mode: BYOK only                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ TrustGate                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Inference Request                                      │
│  ├─ BYOK only -> use synced org provider key            │
│  ├─ Lucid managed -> use managed provider routing       │
│  └─ Auto -> choose the safe available route             │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          ↓
                  Provider APIs
            (OpenAI, Anthropic, etc.)
```

---

## Phase 1: Database Schema (Migration 055)

### New Table: `org_provider_keys`

```sql
CREATE TYPE provider_type AS ENUM (
  'openai',
  'anthropic',
  'groq',
  'cohere',
  'google',
  'mistral',
  'perplexity'
);

CREATE TABLE org_provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider provider_type NOT NULL,
  encrypted_key TEXT NOT NULL,          -- AES-256-GCM encrypted
  key_name TEXT,                        -- User-friendly name (e.g., "Production OpenAI Key")
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Only one active key per provider per org
  CONSTRAINT unique_active_provider_key 
    UNIQUE (org_id, provider, is_active) 
    WHERE is_active = TRUE
);

-- Indexes
CREATE INDEX idx_org_provider_keys_org ON org_provider_keys(org_id);
CREATE INDEX idx_org_provider_keys_provider ON org_provider_keys(provider);
CREATE INDEX idx_org_provider_keys_active ON org_provider_keys(is_active) WHERE is_active = TRUE;

-- RLS Policies
ALTER TABLE org_provider_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own org's keys
CREATE POLICY org_provider_keys_select ON org_provider_keys
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Only org admins can insert/update/delete
CREATE POLICY org_provider_keys_modify ON org_provider_keys
  FOR ALL USING (
    org_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );
```

### Update Table: `org_lucidgateway_keys`

Add new columns to track BYOK vs Managed mode:

```sql
ALTER TABLE org_lucidgateway_keys 
ADD COLUMN inference_mode TEXT DEFAULT 'managed' CHECK (inference_mode IN ('byok', 'managed')),
ADD COLUMN provider_keys_snapshot JSONB; -- Copy of provider keys at creation time
```

---

## Phase 2: Encryption Service

### New File: `src/lib/crypto/encryption.ts`

```typescript
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.PROVIDER_KEYS_ENCRYPTION_KEY! // 32-byte hex string
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

export function encryptProviderKey(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  )
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptProviderKey(encrypted: string): string {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':')
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(ivHex, 'hex')
  )
  
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

// Validate key format before encryption
export function validateProviderKey(provider: string, key: string): boolean {
  const patterns: Record<string, RegExp> = {
    openai: /^sk-[a-zA-Z0-9]{48}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9-_]{95,}$/,
    groq: /^gsk_[a-zA-Z0-9]{52}$/,
    // Add other providers...
  }
  
  const pattern = patterns[provider]
  return pattern ? pattern.test(key) : true // Allow unknown providers
}
```

### Environment Variable

Add to `.env.local`:
```bash
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PROVIDER_KEYS_ENCRYPTION_KEY=<64-char-hex-string>
```

---

## Phase 3: Database Service Layer

### New File: `src/lib/db/provider-keys.ts`

```typescript
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { encryptProviderKey, decryptProviderKey, validateProviderKey } from '@/lib/crypto/encryption'

export type ProviderType = 'openai' | 'anthropic' | 'groq' | 'cohere' | 'google' | 'mistral' | 'perplexity'

export interface ProviderKey {
  id: string
  org_id: string
  provider: ProviderType
  key_name: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  // encrypted_key is never returned to client
}

export interface ProviderKeyWithDecrypted extends ProviderKey {
  decrypted_key: string // Only used server-side
}

export async function addProviderKey(params: {
  orgId: string
  provider: ProviderType
  key: string
  keyName?: string
  userId: string
}): Promise<ProviderKey> {
  const { orgId, provider, key, keyName, userId } = params
  
  // Validate key format
  if (!validateProviderKey(provider, key)) {
    throw new Error(`Invalid ${provider} API key format`)
  }
  
  const encryptedKey = encryptProviderKey(key)
  
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_provider_keys')
    .insert({
      org_id: orgId,
      provider,
      encrypted_key: encryptedKey,
      key_name: keyName,
      created_by: userId,
    })
    .select('id, org_id, provider, key_name, is_active, last_used_at, created_at, updated_at, created_by')
    .single()
  
  if (error) throw error
  return data
}

export async function getProviderKeys(orgId: string): Promise<ProviderKey[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_provider_keys')
    .select('id, org_id, provider, key_name, is_active, last_used_at, created_at, updated_at, created_by')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

export async function getProviderKeyDecrypted(
  orgId: string,
  provider: ProviderType
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_provider_keys')
    .select('encrypted_key')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single()
  
  if (error || !data) return null
  
  return decryptProviderKey(data.encrypted_key)
}

export async function deleteProviderKey(id: string, orgId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('org_provider_keys')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
  
  if (error) throw error
}

export async function toggleProviderKey(
  id: string,
  orgId: string,
  isActive: boolean
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('org_provider_keys')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('org_id', orgId)
  
  if (error) throw error
}
```

---

## Phase 4: API Routes

### New File: `src/app/api/orgs/[id]/provider-keys/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { addProviderKey, getProviderKeys } from '@/lib/db/provider-keys'
import { ErrorService } from '@/lib/errors/error-service'
import { z } from 'zod'

const addKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'groq', 'cohere', 'google', 'mistral', 'perplexity']),
  key: z.string().min(10),
  keyName: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId()
    const orgId = params.id
    
    const keys = await getProviderKeys(orgId)
    
    return NextResponse.json({ keys })
  } catch (error) {
    ErrorService.handleError(error, {
      operation: 'getProviderKeys',
      layer: 'api',
    })
    return NextResponse.json({ error: 'Failed to fetch provider keys' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId()
    const orgId = params.id
    const body = await request.json()
    
    const validated = addKeySchema.parse(body)
    
    const key = await addProviderKey({
      orgId,
      provider: validated.provider,
      key: validated.key,
      keyName: validated.keyName,
      userId,
    })
    
    return NextResponse.json({ key })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    
    ErrorService.handleError(error, {
      operation: 'addProviderKey',
      layer: 'api',
    })
    return NextResponse.json({ error: 'Failed to add provider key' }, { status: 500 })
  }
}
```

### New File: `src/app/api/orgs/[id]/provider-keys/[keyId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { deleteProviderKey, toggleProviderKey } from '@/lib/db/provider-keys'
import { ErrorService } from '@/lib/errors/error-service'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; keyId: string } }
) {
  try {
    await requireUserId()
    const { id: orgId, keyId } = params
    
    await deleteProviderKey(keyId, orgId)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.handleError(error, {
      operation: 'deleteProviderKey',
      layer: 'api',
    })
    return NextResponse.json({ error: 'Failed to delete provider key' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; keyId: string } }
) {
  try {
    await requireUserId()
    const { id: orgId, keyId } = params
    const { isActive } = await request.json()
    
    await toggleProviderKey(keyId, orgId, isActive)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.handleError(error, {
      operation: 'toggleProviderKey',
      layer: 'api',
    })
    return NextResponse.json({ error: 'Failed to update provider key' }, { status: 500 })
  }
}
```

---

## Phase 5: Plan Limits Update

### Update: `src/lib/access-control/types.ts`

```typescript
export interface PlanLimits {
  // ... existing fields
  
  // BYOK + Managed Inference
  gatewayKeyBYOK: boolean                    // NEW: BYOK supported
  gatewayKeyManagedInference: boolean        // NEW: Managed inference available
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    // ... existing free tier limits
    
    // Historical Gateway Keys sketch from the original Option B plan.
    gatewayKeysEnabled: true,
    maxGatewayKeys: 5,                       // More keys since BYOK
    gatewayKeyCustomLimits: true,            // Allow customization
    gatewayKeyBudgets: false,
    gatewayKeyRotation: false,
    gatewayKeyAudit: false,
    gatewayKeyTemplates: false,
    gatewayMaxModels: 20,                    // Limited models on free
    
    // BYOK + Managed (NEW)
    gatewayKeyBYOK: true,                    // ✅ BYOK supported
    gatewayKeyManagedInference: false,       // ❌ Managed NOT available
  },
  
  pro: {
    // ... existing pro tier limits
    
    // Historical Gateway Keys sketch from the original Option B plan.
    gatewayKeysEnabled: true,
    maxGatewayKeys: 25,
    gatewayKeyCustomLimits: true,
    gatewayKeyBudgets: true,
    gatewayKeyRotation: false,
    gatewayKeyAudit: true,
    gatewayKeyTemplates: true,
    gatewayMaxModels: Infinity,
    
    // BYOK + Managed (NEW)
    gatewayKeyBYOK: true,                    // ✅ BYOK supported
    gatewayKeyManagedInference: true,        // ✅ Managed ALSO available
  },
  
  enterprise: {
    // ... everything unlimited
    gatewayKeyBYOK: true,
    gatewayKeyManagedInference: true,
  },
}
```

---

## Phase 6: UI Components

### New File: `src/components/settings/provider-keys-settings.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { useFeature } from '@/lib/access-control/hooks'
import { FeatureGate } from '@/components/access-control/feature-gate'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { value: 'groq', label: 'Groq', placeholder: 'gsk_...' },
  // ...
] as const

export function ProviderKeysSettings({ orgId }: { orgId: string }) {
  const [provider, setProvider] = useState<string>('openai')
  const [key, setKey] = useState('')
  const [keyName, setKeyName] = useState('')
  
  const byokEnabled = useFeature('gatewayKeyBYOK')
  
  if (!byokEnabled) {
    return (
      <div className="text-sm text-muted-foreground">
        BYOK is not available on your plan.
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Provider API Keys</h3>
        <p className="text-sm text-muted-foreground">
          Add your own API keys to use with LucidGateway (BYOK mode)
        </p>
      </div>
      
      {/* Add Key Form */}
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder={PROVIDERS.find(p => p.value === provider)?.placeholder}
            />
          </div>
          
          <div>
            <Label>Key Name (optional)</Label>
            <Input
              value={keyName}
              onChange={e => setKeyName(e.target.value)}
              placeholder="e.g., Production OpenAI Key"
            />
          </div>
          
          <Button onClick={() => handleAddKey()}>
            Add Provider Key
          </Button>
        </div>
      </Card>
      
      {/* Existing Keys List */}
      <div>
        <h4 className="font-medium mb-2">Your Provider Keys</h4>
        {/* ... list of existing keys with delete/toggle buttons */}
      </div>
    </div>
  )
}
```

### Update: `src/components/settings/gateway-keys-settings.tsx`

Add inference mode toggle when creating gateway keys:

```typescript
// Add to create key form
<div>
  <Label>Inference Mode</Label>
  <Select value={inferenceMode} onValueChange={setInferenceMode}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {byokEnabled && (
        <SelectItem value="byok">
          BYOK (Use your provider keys)
        </SelectItem>
      )}
      {managedEnabled && (
        <SelectItem value="managed">
          Managed (Use LucidMerged's keys)
        </SelectItem>
      )}
    </SelectContent>
  </Select>
</div>
```

---

## Phase 7: TrustGate Integration

### Historical Gateway Key Creation Sketch

Modify `POST /api/orgs/[id]/lucidgateway-keys/route.ts`:

```typescript
// Historical gateway-key sketch. Current assistant routing stores mode in
// policy_config.trustgate.inference_mode and routes through TrustGate.
const providerKeysSnapshot = inferenceMode === 'byok' 
  ? await getProviderKeysSnapshot(orgId)  // Fetch + decrypt all provider keys
  : null

const response = await fetch(`${LUCIDGATEWAY_PROXY_URL}/key/generate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${LUCIDGATEWAY_MASTER_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name,
    max_budget,
    models,
    metadata,
    inference_mode: inferenceMode,        // NEW
    provider_keys: providerKeysSnapshot,  // NEW: send encrypted keys
  }),
})
```

### TrustGate Changes (External)

The external gateway contract is:

1. Accept provider-key sync/disable commands from the Lucid control plane.
2. Route assistant inference from `policy_config.trustgate.inference_mode`.
3. Never require plaintext provider keys in browser responses or assistant payloads.
4. Keep BYOK and Lucid-managed metering distinguishable.

---

## Phase 8: Testing Checklist

- [x] Provider-key API returns safe metadata only.
- [x] Provider key validation rejects invalid OpenAI key format from UI.
- [x] Valid OpenAI key add path was live-smoked.
- [x] Active/inactive toggle was live-smoked.
- [x] Delete path was live-smoked.
- [x] TrustGate sync failure returns an operator-safe error and rolls back local add.
- [x] Assistant modes Auto, Lucid managed, and BYOK only were live-smoked for persistence.
- [x] Real chat routing was live-smoked from the assistant UI.
- [x] Root typecheck/build and worker typecheck/build passed after implementation.
- [ ] Continue provider-specific live validation as more providers are enabled in TrustGate.

---

## Rollout Plan

### Step 1: Database + Backend (Non-Breaking)
- Deploy migration 055
- Deploy encryption service
- Deploy provider keys API routes
- **No UI changes yet** → existing users unaffected

### Step 2: UI (Behind Feature Flag)
- Deploy provider keys settings UI
- Deploy inference mode toggle in gateway keys
- Enable for internal testing only

### Step 3: TrustGate Integration
- Deploy TrustGate provider-key sync and inference-mode routing
- Test BYOK flow end-to-end

### Step 4: Gradual Rollout
- Enable for Free tier first (BYOK only)
- Monitor for issues
- Enable for Pro tier (BYOK + Managed)
- Full launch

---

## Security Considerations

1. **Encryption at Rest**: All provider keys encrypted with AES-256-GCM
2. **Encryption Key Rotation**: Document process for rotating `PROVIDER_KEYS_ENCRYPTION_KEY`
3. **Audit Trail**: Log all provider key additions/deletions
4. **Rate Limiting**: Prevent brute-force key validation attempts
5. **Key Validation**: Validate format before accepting (prevent injection)
6. **RLS Policies**: Prevent cross-org key access
7. **Snapshot Immutability**: Gateway keys store snapshot of provider keys at creation time (immune to later changes)

---

## Current Open Items

1. **Provider coverage:** OpenAI was live-smoked. Keep provider-specific live checks for Anthropic, Groq, Google, Mistral, Perplexity, DeepSeek, Together, Fireworks, Cohere, and OpenRouter as TrustGate enables each provider.
2. **Billing UX:** BYOK and Lucid-managed usage are distinguishable in routing; customer-facing credit/package copy still needs final product packaging.
3. **Typed projection:** `policy_config.trustgate.inference_mode` is canonical today. Add or backfill typed assistant columns only as a non-breaking projection.

---

## Success Metrics

- [x] Workspace users can manage provider keys through Settings -> Provider Keys.
- [x] Assistants can switch between Auto, Lucid managed, and BYOK only.
- [x] Provider-key client responses never include plaintext or encrypted keys.
- [x] Root and worker typecheck/build passed after the BYOK/TrustGate changes.
- [ ] Track gateway success rate and provider-specific latency from production telemetry.
