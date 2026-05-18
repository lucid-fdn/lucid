# Phase 3C: Advanced Features - Implementation Plan
**Duration:** 2 weeks  
**Status:** Archived historical plan - superseded by Routine Kernel for scheduled work
**Based on:** PHASE_3B_3C_CONSOLIDATED.md

> 2026-05-17 update: workflow-local scheduling is retired. Any references below to `workflow_schedules`, `/api/workflows/[id]/schedules/**`, or workflow schedule UI/actions are historical only. Product automation now goes through Lucid Routines: `contracts/routine.ts`, `/api/routines/**`, `src/lib/routines/*`, `src/components/routines/*`, and `worker/src/routines/*`.

---

## 📋 What We Already Have (Phase 3B Complete)

✅ **Execution System**
- Real-time node execution
- Status indicators (waiting, running, success, error)
- Input/Output data display
- Execution history (persists to DB)

✅ **Pin Data System**
- Pin test data to nodes
- Data persists to `workflow.pin_data` column
- Used during execution
- Visual indicators

✅ **Architecture**
- Centralized constants
- Reusable hooks
- CSS variables theme system
- Industry-standard patterns

---

## 🎯 Phase 3C Goals

### Week 1: Webhooks & Scheduling (Days 1-5)
- Webhook triggers for workflows
- Scheduled executions (cron)
- Workflow variables system

### Week 2: Expressions & Credentials (Days 6-10)
- Expression editor (basic)
- Credentials management
- Version control

---

## 🗓️ Week 1: Webhooks & Scheduling

### Day 1-2: Webhook Triggers

#### 1. Database Schema
```sql
-- Create webhooks table
CREATE TABLE workflow_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  path TEXT UNIQUE NOT NULL,
  method TEXT DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  api_key TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_webhooks_path ON workflow_webhooks(path);
CREATE INDEX idx_webhooks_workflow ON workflow_webhooks(workflow_id);

-- Webhook execution logs
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES workflow_webhooks(id) ON DELETE CASCADE,
  workflow_execution_id UUID REFERENCES workflow_executions(id),
  request_method TEXT,
  request_headers JSONB,
  request_body JSONB,
  response_status INTEGER,
  response_body JSONB,
  executed_at TIMESTAMPTZ DEFAULT now()
);
```

#### 2. API Routes
```typescript
// src/app/api/webhooks/[path]/route.ts
// Handle webhook execution

// src/app/api/workflows/[id]/webhooks/route.ts
// CRUD for webhooks (GET, POST, DELETE)
```

#### 3. Components
```typescript
// src/components/workflow/triggers/webhook-trigger.tsx
- Webhook URL display
- Copy URL button
- API key regeneration
- Test webhook UI
- Enable/disable toggle

// src/components/workflow/triggers/webhook-logs.tsx
- Recent webhook calls
- Request/response details
- Filter by status
```

#### 4. Node Type
```typescript
// Add to src/lib/workflow/node-types.ts
webhook_trigger: {
  label: 'Webhook Trigger',
  category: 'trigger',
  icon: 'Webhook',
  color: '#10b981',
  description: 'Trigger workflow via HTTP webhook'
}
```

**Deliverables:**
- ✅ Webhook table in DB
- ✅ API routes for webhook CRUD
- ✅ Webhook trigger node
- ✅ Webhook settings panel
- ✅ Test webhook UI
- ✅ Webhook logs

---

### Day 3-4: Scheduled Executions

#### 1. Database Schema
```sql
-- Create schedules table
CREATE TABLE workflow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for scheduler
CREATE INDEX idx_schedules_next_run ON workflow_schedules(next_run) WHERE enabled = true;
CREATE INDEX idx_schedules_workflow ON workflow_schedules(workflow_id);
```

#### 2. Scheduler Service
```typescript
// src/lib/scheduler/cron-scheduler.ts
// Using node-cron or BullMQ

interface SchedulerService {
  addSchedule(schedule: Schedule): Promise<void>;
  removeSchedule(scheduleId: string): Promise<void>;
  updateSchedule(schedule: Schedule): Promise<void>;
  getNextRun(cronExpression: string): Date;
}
```

#### 3. API Routes
```typescript
// src/app/api/workflows/[id]/schedules/route.ts
// CRUD for schedules

// src/app/api/scheduler/tick/route.ts
// Called by cron job to check schedules
```

#### 4. Components
```typescript
// src/components/workflow/triggers/schedule-trigger.tsx
- Cron expression builder (visual)
- Common presets (daily, weekly, monthly)
- Timezone selector
- Test cron expression
- Enable/disable toggle

// src/components/workflow/triggers/schedule-list.tsx
- Active schedules
- Next run time
- Last run status
- Quick enable/disable
```

#### 5. Cron Expression Builder
```typescript
// src/components/workflow/triggers/cron-builder.tsx
- Minute: 0-59
- Hour: 0-23
- Day of month: 1-31
- Month: 1-12
- Day of week: 0-6

Presets:
- Every hour: "0 * * * *"
- Every day at 9am: "0 9 * * *"
- Every Monday: "0 0 * * 1"
- First of month: "0 0 1 * *"
```

**Deliverables:**
- ✅ Schedules table in DB
- ✅ Scheduler service
- ✅ API routes for schedules
- ✅ Schedule trigger node
- ✅ Cron builder UI
- ✅ Schedule management panel

---

### Day 5: Variables System

#### 1. Database Schema
```sql
-- Create variables table
CREATE TABLE workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'secret')),
  is_secret BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workflow_id, key)
);

-- Index for fast lookup
CREATE INDEX idx_variables_workflow ON workflow_variables(workflow_id);
```

#### 2. API Routes
```typescript
// src/app/api/workflows/[id]/variables/route.ts
// CRUD for variables
```

#### 3. Components
```typescript
// src/components/workflow/variables/variables-panel.tsx
- List all variables
- Add variable button
- Edit variable
- Delete variable
- Variable type selector

// src/components/workflow/variables/variable-editor.tsx
- Key input
- Value input (with type-specific UI)
- Type selector (string, number, boolean, secret)
- Secret toggle (mask value)
```

#### 4. Variable Usage in Nodes
```typescript
// In node parameters, use {{$vars.variableName}}
// Example:
{
  url: "{{$vars.apiUrl}}/users",
  apiKey: "{{$vars.apiKey}}"
}
```

#### 5. Variable Store
```typescript
// src/stores/workflow/variables.store.ts
interface VariablesStore {
  variables: Map<string, Variable>;
  loadVariables(workflowId: string): Promise<void>;
  addVariable(variable: Variable): Promise<void>;
  updateVariable(key: string, value: any): Promise<void>;
  deleteVariable(key: string): Promise<void>;
  getValue(key: string): any;
}
```

**Deliverables:**
- ✅ Variables table in DB
- ✅ API routes for variables
- ✅ Variables panel UI
- ✅ Variable editor
- ✅ Variable usage in nodes ({{$vars.key}})

---

## 🗓️ Week 2: Expressions & Credentials

### Day 6-7: Expression Editor (Basic)

#### 1. Expression Syntax
```typescript
// Supported expressions:
{{$json.userId}}                    // Current item data
{{$node["HTTP Request"].json.data}} // Other node data
{{$now.toISOString()}}              // Current time
{{$vars.apiUrl}}                    // Variables
{{$env.NODE_ENV}}                   // Environment variables

// Built-in functions:
{{$json.name.toUpperCase()}}
{{$json.price * 1.1}}
{{$json.items.length}}
```

#### 2. Expression Resolver
```typescript
// src/lib/expressions/resolver.ts
interface ExpressionResolver {
  resolve(expression: string, context: ExecutionContext): any;
  validate(expression: string): boolean;
  test(expression: string, sampleData: any): any;
}

interface ExecutionContext {
  $json: any;        // Current item
  $node: NodeData;   // All nodes data
  $now: Date;        // Current timestamp
  $vars: Variables;  // Workflow variables
  $env: EnvVars;     // Environment variables
}
```

#### 3. Components
```typescript
// src/components/workflow/expressions/expression-editor.tsx
- Monaco editor (or CodeMirror)
- Syntax highlighting
- Autocomplete (basic)
- Expression validator
- Live preview

// src/components/workflow/expressions/expression-tester.tsx
- Input sample data
- Test expression
- Show result
- Error handling
```

#### 4. Integration
```typescript
// In node execution:
const resolvedParams = resolveExpressions(
  node.data.config,
  executionContext
);
```

**Deliverables:**
- ✅ Expression syntax support
- ✅ Expression resolver
- ✅ Expression editor component
- ✅ Expression tester
- ✅ Integration in node execution

---

### Day 8-9: Credentials Management

#### 1. Database Schema
```sql
-- Create credentials table
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('api_key', 'basic_auth', 'oauth2', 'custom_headers')),
  data JSONB NOT NULL, -- Encrypted
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_credentials_user ON credentials(user_id);
CREATE INDEX idx_credentials_org ON credentials(organization_id);

-- Credential usage tracking
CREATE TABLE credential_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(credential_id, workflow_id, node_id)
);
```

#### 2. Encryption
```typescript
// src/lib/credentials/encryption.ts
interface CredentialEncryption {
  encrypt(data: any): string;
  decrypt(encrypted: string): any;
}

// Use crypto module
// Store encryption key in environment variable
```

#### 3. API Routes
```typescript
// src/app/api/credentials/route.ts
// List credentials (GET)
// Create credential (POST)

// src/app/api/credentials/[id]/route.ts
// Get credential (GET)
// Update credential (PUT)
// Delete credential (DELETE)

// src/app/api/credentials/[id]/test/route.ts
// Test credential (POST)
```

#### 4. Credential Types
```typescript
// API Key
interface ApiKeyCredential {
  type: 'api_key';
  data: {
    key: string;
    headerName?: string; // Default: 'Authorization'
    prefix?: string;     // Default: 'Bearer '
  };
}

// Basic Auth
interface BasicAuthCredential {
  type: 'basic_auth';
  data: {
    username: string;
    password: string;
  };
}

// OAuth 2.0 (Basic)
interface OAuth2Credential {
  type: 'oauth2';
  data: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

// Custom Headers
interface CustomHeadersCredential {
  type: 'custom_headers';
  data: {
    headers: Record<string, string>;
  };
}
```

#### 5. Components
```typescript
// src/components/workflow/credentials/credentials-list.tsx
- List all credentials
- Add credential button
- Edit credential
- Delete credential
- Test credential
- Show usage count

// src/components/workflow/credentials/credential-modal.tsx
- Credential name input
- Type selector
- Type-specific fields
- Save button
- Test button

// src/components/workflow/credentials/credential-selector.tsx
- Dropdown of available credentials
- Filter by type
- "Add new" option
- Quick test
```

#### 6. Integration in Nodes
```typescript
// In HTTP node:
{
  url: "https://api.example.com/users",
  credential: "credential-uuid", // Selected credential
  // Credential auto-injected in request
}
```

**Deliverables:**
- ✅ Credentials table in DB
- ✅ Encryption/decryption
- ✅ API routes for credentials
- ✅ Credential types (4 types)
- ✅ Credentials list UI
- ✅ Credential editor modal
- ✅ Credential selector in nodes
- ✅ Test credential functionality

---

### Day 10: Version Control

#### 1. Database Schema
```sql
-- Create versions table
CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name TEXT,
  description TEXT,
  data JSONB NOT NULL, -- Full workflow snapshot
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workflow_id, version)
);

-- Index for versions
CREATE INDEX idx_versions_workflow ON workflow_versions(workflow_id, version DESC);
```

#### 2. API Routes
```typescript
// src/app/api/workflows/[id]/versions/route.ts
// List versions (GET)
// Create version (POST)

// src/app/api/workflows/[id]/versions/[versionId]/route.ts
// Get version (GET)
// Restore version (POST /restore)

// src/app/api/workflows/[id]/export/route.ts
// Export as JSON (GET)

// src/app/api/workflows/[id]/import/route.ts
// Import from JSON (POST)
```

#### 3. Components
```typescript
// src/components/workflow/versions/version-list.tsx
- List all versions
- Version number & timestamp
- Created by
- Description
- Restore button
- Compare button (basic)

// src/components/workflow/versions/create-version-modal.tsx
- Version name input
- Description textarea
- Save button

// src/components/workflow/versions/version-diff.tsx (Basic)
- Side-by-side comparison
- Highlight changes in nodes/edges
- Show added/removed nodes
```

#### 4. Auto-versioning Logic
```typescript
// Auto-save version on:
- Manual "Save Version" click
- Before major changes (optional)
- Daily snapshots (optional)

// Version naming:
- v1, v2, v3... (auto-increment)
- Custom name option
```

#### 5. Export/Import
```typescript
// Export format:
{
  version: "1.0",
  workflow: {
    id: "uuid",
    name: "My Workflow",
    nodes: [...],
    edges: [...],
    pin_data: {...},
    variables: [...],
    credentials: [], // Excluded for security
    settings: {...}
  },
  metadata: {
    exportedAt: "2025-01-15T10:00:00Z",
    exportedBy: "user@example.com"
  }
}
```

**Deliverables:**
- ✅ Versions table in DB
- ✅ API routes for versions
- ✅ Version list UI
- ✅ Create version modal
- ✅ Restore version
- ✅ Export workflow as JSON
- ✅ Import workflow from JSON
- ✅ Basic diff viewer

---

## 🗄️ Database Migration Script

```sql
-- Phase 3C Complete Schema
-- Run this migration to add all Phase 3C tables

-- Webhooks
CREATE TABLE workflow_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  path TEXT UNIQUE NOT NULL,
  method TEXT DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  api_key TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhooks_path ON workflow_webhooks(path);
CREATE INDEX idx_webhooks_workflow ON workflow_webhooks(workflow_id);

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES workflow_webhooks(id) ON DELETE CASCADE,
  workflow_execution_id UUID REFERENCES workflow_executions(id),
  request_method TEXT,
  request_headers JSONB,
  request_body JSONB,
  response_status INTEGER,
  response_body JSONB,
  executed_at TIMESTAMPTZ DEFAULT now()
);

-- Schedules
CREATE TABLE workflow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schedules_next_run ON workflow_schedules(next_run) WHERE enabled = true;
CREATE INDEX idx_schedules_workflow ON workflow_schedules(workflow_id);

-- Variables
CREATE TABLE workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'secret')),
  is_secret BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workflow_id, key)
);

CREATE INDEX idx_variables_workflow ON workflow_variables(workflow_id);

-- Credentials
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('api_key', 'basic_auth', 'oauth2', 'custom_headers')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credentials_user ON credentials(user_id);
CREATE INDEX idx_credentials_org ON credentials(organization_id);

CREATE TABLE credential_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(credential_id, workflow_id, node_id)
);

-- Versions
CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  name TEXT,
  description TEXT,
  data JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workflow_id, version)
);

CREATE INDEX idx_versions_workflow ON workflow_versions(workflow_id, version DESC);

-- Enable RLS
ALTER TABLE workflow_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Basic)
-- Add appropriate policies based on your auth setup
```

---

## 📊 Implementation Checklist

### Week 1: Webhooks & Scheduling
- [ ] **Day 1-2: Webhooks**
  - [ ] Create database tables
  - [ ] Build API routes
  - [ ] Create webhook trigger node
  - [ ] Build webhooks settings panel
  - [ ] Add test webhook UI
  - [ ] Implement webhook logs

- [ ] **Day 3-4: Schedules**
  - [ ] Create database tables
  - [ ] Build scheduler service
  - [ ] Create API routes
  - [ ] Build cron expression builder
  - [ ] Create schedule trigger node
  - [ ] Add schedule management panel

- [ ] **Day 5: Variables**
  - [ ] Create database table
  - [ ] Build API routes
  - [ ] Create variables panel
  - [ ] Build variable editor
  - [ ] Implement variable usage in nodes

### Week 2: Expressions & Credentials
- [ ] **Day 6-7: Expressions**
  - [ ] Define expression syntax
  - [ ] Build expression resolver
  - [ ] Create expression editor
  - [ ] Add expression tester
  - [ ] Integrate in node execution

- [ ] **Day 8-9: Credentials**
  - [ ] Create database tables
  - [ ] Implement encryption
  - [ ] Build API routes
  - [ ] Create credentials list UI
  - [ ] Build credential editor
  - [ ] Add credential selector
  - [ ] Implement test functionality

- [ ] **Day 10: Version Control**
  - [ ] Create database table
  - [ ] Build API routes
  - [ ] Create version list UI
  - [ ] Add create version modal
  - [ ] Implement restore
  - [ ] Build export/import
  - [ ] Add basic diff viewer

---

## 🎯 Success Criteria

### Phase 3C Complete When:
- [ ] Can trigger workflow via webhook
- [ ] Can schedule workflow execution with cron
- [ ] Can use variables in node parameters
- [ ] Can use expressions in parameters (basic)
- [ ] Can store and use credentials securely
- [ ] Can save and restore workflow versions
- [ ] Can export/import workflows as JSON

---

## 🚀 After Phase 3C

You'll have a **fully-featured workflow automation platform** with:

✅ Complete workflow builder
✅ Real-time execution with pin data
✅ Webhook triggers
✅ Scheduled executions
✅ Variables & expressions (basic)
✅ Secure credentials management
✅ Version control & export/import

**This covers ~85% of n8n's core functionality!**

Ready to start Week 1? 🎯
