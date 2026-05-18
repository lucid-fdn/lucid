# Nango Backend Implementation Guide

## Overview

This document outlines the backend implementation needed to support OAuth-powered workflow nodes in LucidMerged. We use **Nango** for OAuth token management and API access.

**Nango Documentation:**
- [Proxy](https://nango.dev/docs/guides/use-cases/proxy) - Make API calls with stored tokens
- [Syncs](https://nango.dev/docs/guides/use-cases/syncs) - Continuously sync data
- [Actions](https://nango.dev/docs/guides/use-cases/actions) - One-off write operations
- [Webhooks](https://nango.dev/docs/guides/use-cases/webhooks) - Receive events from providers

---

## Current State

### What's Working ✅
- OAuth connection flow (connect provider via Nango popup)
- Storing connection references in `user_oauth_connections` table
- Displaying connected accounts in workflow node settings
- Auto-selecting credentials when configuring nodes

### What's Needed 🔧
1. **Dynamic Options** - Fetch user's lists, bases, spreadsheets for dropdowns
2. **User Profile Data** - Show avatar, username for connected accounts
3. **Workflow Execution** - Actually run nodes with real API calls
4. **Webhook Triggers** - Receive events from providers

---

## Priority 1: Dynamic Options (Dropdowns)

### Use Case
When user configures a Twitter "Add Member to List" action, they need a dropdown of their Twitter lists. Same for:
- Airtable: bases, tables
- Google Sheets: spreadsheets, sheets
- Slack: channels, users
- Asana: workspaces, projects

### Recommended Approach: Nango Proxy

**API Endpoint:** `GET /api/oauth/[provider]/resources/[resource]`

```typescript
// /api/oauth/[provider]/resources/[resource]/route.ts
import { Nango } from '@nangohq/node'

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY })

// Provider-specific endpoint mappings
const RESOURCE_ENDPOINTS: Record<string, Record<string, {
  endpoint: string
  method: 'GET' | 'POST'
  transform: (data: any) => Array<{ name: string; value: string }>
}>> = {
  twitter: {
    lists: {
      endpoint: '/2/users/me/owned_lists',
      method: 'GET',
      transform: (data) => data.data?.map((l: any) => ({ 
        name: l.name, 
        value: l.id 
      })) || []
    },
    // Add more Twitter resources...
  },
  airtable: {
    bases: {
      endpoint: '/v0/meta/bases',
      method: 'GET',
      transform: (data) => data.bases?.map((b: any) => ({ 
        name: b.name, 
        value: b.id 
      })) || []
    },
    tables: {
      // Note: Requires baseId parameter
      endpoint: '/v0/meta/bases/:baseId/tables',
      method: 'GET',
      transform: (data) => data.tables?.map((t: any) => ({ 
        name: t.name, 
        value: t.id 
      })) || []
    }
  },
  'google-sheets': {
    spreadsheets: {
      endpoint: '/drive/v3/files?q=mimeType="application/vnd.google-apps.spreadsheet"',
      method: 'GET',
      transform: (data) => data.files?.map((f: any) => ({ 
        name: f.name, 
        value: f.id 
      })) || []
    }
  },
  slack: {
    channels: {
      endpoint: '/conversations.list',
      method: 'GET',
      transform: (data) => data.channels?.map((c: any) => ({ 
        name: `#${c.name}`, 
        value: c.id 
      })) || []
    }
  }
}

export async function GET(
  request: Request,
  { params }: { params: { provider: string; resource: string } }
) {
  const { provider, resource } = params
  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connectionId')
  
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId required' }, { status: 400 })
  }
  
  const resourceConfig = RESOURCE_ENDPOINTS[provider]?.[resource]
  if (!resourceConfig) {
    return NextResponse.json({ error: 'Unknown resource' }, { status: 404 })
  }
  
  try {
    // Use Nango Proxy - handles auth automatically
    const response = await nango.proxy({
      providerConfigKey: provider,
      connectionId: connectionId,
      endpoint: resourceConfig.endpoint,
      method: resourceConfig.method,
    })
    
    const options = resourceConfig.transform(response.data)
    
    return NextResponse.json({ options })
  } catch (error) {
    console.error(`[Nango Proxy] Error fetching ${provider}/${resource}:`, error)
    return NextResponse.json({ 
      error: 'Failed to fetch options',
      options: [] 
    }, { status: 500 })
  }
}
```

### Frontend Usage

```typescript
// Frontend hook already exists: useDynamicOptions
// Update to call the new endpoint:

const fetchOptions = async () => {
  const res = await fetch(
    `/api/oauth/${provider}/resources/${resource}?connectionId=${credentialId}`
  )
  const data = await res.json()
  return data.options
}
```

### Cascading Dropdowns

Some resources depend on parent selections (e.g., Airtable tables require baseId):

```typescript
// Request with parent parameter
GET /api/oauth/airtable/resources/tables?connectionId=xxx&baseId=app123abc

// Backend handles parameter substitution
endpoint: '/v0/meta/bases/:baseId/tables'
// Becomes: '/v0/meta/bases/app123abc/tables'
```

---

## Priority 2: User Profile Data

### Use Case
Show avatar and display name in credential selector dropdown:
```
┌─────────────────────────────────┐
│ [👤] @johndoe                   │
│ [👤] @company_account           │
│ + Connect another account       │
└─────────────────────────────────┘
```

### Recommended Approach: Store on Sync + Return from API

**Database Schema Update:**
```sql
ALTER TABLE user_oauth_connections
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT;
```

**Update Sync Endpoint:** `/api/oauth/[provider]/sync`

```typescript
// After syncing connection, fetch profile data
export async function POST(req, { params }) {
  const { provider } = params
  const { privyUserId } = await req.json()
  
  // Get connection from Nango
  const connection = await nango.getConnection(provider, privyUserId)
  
  // Fetch profile using Nango Proxy
  let profile = { avatarUrl: null, displayName: null, username: null, email: null }
  
  try {
    const profileEndpoints: Record<string, string> = {
      twitter: '/2/users/me?user.fields=profile_image_url,name,username',
      google: '/oauth2/v2/userinfo',
      slack: '/users.identity',
      github: '/user',
      // Add more...
    }
    
    if (profileEndpoints[provider]) {
      const profileData = await nango.proxy({
        providerConfigKey: provider,
        connectionId: privyUserId,
        endpoint: profileEndpoints[provider],
        method: 'GET',
      })
      
      profile = normalizeProfile(provider, profileData.data)
    }
  } catch (e) {
    console.warn('[Sync] Could not fetch profile:', e)
  }
  
  // Upsert to database with profile data
  const { error } = await supabase
    .from('user_oauth_connections')
    .upsert({
      privy_user_id: privyUserId,
      provider: provider,
      provider_account_name: profile.username,
      provider_account_email: profile.email,
      avatar_url: profile.avatarUrl,
      display_name: profile.displayName,
      connected_at: new Date().toISOString(),
    }, {
      onConflict: 'privy_user_id,provider'
    })
  
  return NextResponse.json({
    success: true,
    provider,
    profile // Return profile for immediate UI update
  })
}

// Normalize different provider response formats
function normalizeProfile(provider: string, data: any) {
  switch (provider) {
    case 'twitter':
      return {
        username: data.data?.username,
        displayName: data.data?.name,
        avatarUrl: data.data?.profile_image_url,
        email: null
      }
    case 'google':
      return {
        username: data.email?.split('@')[0],
        displayName: data.name,
        avatarUrl: data.picture,
        email: data.email
      }
    case 'slack':
      return {
        username: data.user?.name,
        displayName: data.user?.real_name,
        avatarUrl: data.user?.image_72,
        email: data.user?.email
      }
    case 'github':
      return {
        username: data.login,
        displayName: data.name,
        avatarUrl: data.avatar_url,
        email: data.email
      }
    default:
      return { username: null, displayName: null, avatarUrl: null, email: null }
  }
}
```

**Update GET Connections Endpoint:** `/api/oauth/connections`

```typescript
// Return profile data with connections
const { data: connections } = await supabase
  .from('user_oauth_connections')
  .select('id, provider, provider_account_name, provider_account_email, avatar_url, display_name, connected_at')
  .eq('privy_user_id', privyUserId)

return NextResponse.json({
  connections: connections.map(c => ({
    id: c.id,
    provider: c.provider,
    username: c.provider_account_name,
    email: c.provider_account_email,
    avatarUrl: c.avatar_url,
    displayName: c.display_name,
    connectedAt: c.connected_at
  }))
})
```

---

## Priority 3: Workflow Execution (Actions)

### Use Case
User clicks "Run" on workflow → Execute each node with real API calls.

### Recommended Approach: Nango Actions

```typescript
// /api/workflows/execute/route.ts

export async function POST(req) {
  const { workflowId, nodes } = await req.json()
  
  const results = []
  
  for (const node of nodes) {
    const result = await executeNode(node)
    results.push(result)
    
    // Pass output to next node
    // ...
  }
  
  return NextResponse.json({ results })
}

async function executeNode(node: WorkflowNode) {
  const { provider, action, parameters, credentialId } = node.data
  
  // Map node action to Nango action or proxy call
  switch (node.type) {
    case 'twitter-post':
      return await nango.proxy({
        providerConfigKey: 'twitter',
        connectionId: credentialId,
        endpoint: '/2/tweets',
        method: 'POST',
        data: { text: parameters.text }
      })
    
    case 'slack-message':
      return await nango.proxy({
        providerConfigKey: 'slack',
        connectionId: credentialId,
        endpoint: '/chat.postMessage',
        method: 'POST',
        data: {
          channel: parameters.channelId,
          text: parameters.message
        }
      })
    
    // Add more node types...
  }
}
```

**Alternative: Define Nango Actions**

For complex operations, define them in Nango:

```typescript
// nango-integrations/twitter/actions/post-tweet.ts
export default async function postTweet(nango: NangoAction, input: { text: string }) {
  const response = await nango.post('/2/tweets', { text: input.text })
  return response.data
}
```

Then trigger from your API:
```typescript
const result = await nango.triggerAction('twitter', 'post-tweet', credentialId, { text: 'Hello!' })
```

---

## Priority 4: Webhook Triggers (Later)

### Use Case
Workflow starts when external event happens (new tweet, new row in Airtable, etc.)

### Recommended Approach: Nango Webhooks

```typescript
// 1. Register webhook subscription when workflow is activated
await nango.registerWebhook({
  providerConfigKey: 'twitter',
  connectionId: credentialId,
  webhookUrl: `https://app.lucid.com/api/webhooks/nango`,
  events: ['tweet.created']
})

// 2. Handle incoming webhooks
// /api/webhooks/nango/route.ts
export async function POST(req) {
  const event = await req.json()
  
  // Find workflows triggered by this event
  const workflows = await findWorkflowsByTrigger(event.provider, event.type)
  
  // Execute each workflow
  for (const workflow of workflows) {
    await executeWorkflow(workflow.id, event.data)
  }
  
  return NextResponse.json({ received: true })
}
```

---

## Alternative: Nango Syncs for Frequently Accessed Data

If users frequently access the same data (e.g., always selecting from same Airtable bases), consider using **Syncs** instead of Proxy:

### Benefits of Syncs:
- ✅ Faster (data cached in Nango)
- ✅ No rate limit issues
- ✅ Handles pagination automatically
- ✅ Data stays fresh (continuous sync)

### Setup Sync in Nango Dashboard:

```yaml
# nango-integrations/airtable/syncs/bases.yaml
sync_name: airtable-bases
endpoint: GET /v0/meta/bases
schedule: every 5 minutes
output_schema:
  - id: string
  - name: string
```

### Query Synced Data:

```typescript
// Instead of proxy call, query Nango's synced data
const bases = await nango.listRecords({
  providerConfigKey: 'airtable',
  connectionId: credentialId,
  model: 'airtable-bases'
})
```

---

## Environment Variables Required

```bash
# .env.local
NANGO_SECRET_KEY=nango_secret_xxx
NANGO_PUBLIC_KEY=nango_public_xxx
NANGO_HOST=https://api.nango.dev  # or self-hosted URL
```

---

## Summary: Implementation Order

| Priority | Feature | Nango Feature | Effort | Impact |
|----------|---------|---------------|--------|--------|
| 1 | Dynamic Options | **Proxy** | Low | High - enables node config |
| 2 | User Profiles | **Proxy** + DB | Low | Medium - better UX |
| 3 | Workflow Execution | **Proxy/Actions** | Medium | High - makes workflows work |
| 4 | Webhook Triggers | **Webhooks** | Medium | Medium - enables triggers |
| Future | Cached Data | **Syncs** | Medium | Performance at scale |

---

## Questions for Backend

1. Should we use Nango's managed service or self-host?
2. Are there specific providers that need priority? (Twitter, Airtable, Google Sheets, Slack?)
3. For workflow execution, should we use Proxy (simple) or define Nango Actions (more structured)?
4. Do we need real-time webhook support immediately, or can triggers wait?

---

## Frontend Expectations

The frontend (`useDynamicOptions` hook) expects:

```typescript
// GET /api/oauth/{provider}/resources/{resource}?connectionId={id}
// Response:
{
  "options": [
    { "name": "Display Name", "value": "api_id" },
    { "name": "Another Option", "value": "another_id" }
  ]
}

// GET /api/oauth/connections
// Response:
{
  "connections": [
    {
      "id": "uuid",
      "provider": "twitter",
      "username": "@johndoe",
      "email": null,
      "avatarUrl": "https://...",
      "displayName": "John Doe",
      "connectedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```
