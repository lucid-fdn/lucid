# Phase 3B & 3C: Complete Workflow System

**Status:** Archived historical plan - superseded by Routine Kernel for scheduled work
**Duration:** 4 weeks total  
**Based on:** Original plan + n8n critical features

> 2026-05-17 update: workflow-local scheduling is retired. Any references below to `workflow_schedules`, `/api/workflows/[id]/schedules/**`, or workflow schedule UI/actions are historical only. Product automation now goes through Lucid Routines: `contracts/routine.ts`, `/api/routines/**`, `src/lib/routines/*`, `src/components/routines/*`, and `worker/src/routines/*`.

---

## 🎯 Phase 3B: Node Execution & Pin Data (2 weeks)

### Week 1: Node Execution Panel

**What We're Building:**
A panel that shows real-time execution status, data, and history for each node.

#### Day 1-2: Execution Status UI
- [ ] Create execution store
  ```typescript
  // src/stores/workflow/execution.store.ts
  interface ExecutionStore {
    currentExecution: Execution | null;
    nodeStatuses: Map<string, NodeStatus>; // nodeId -> status
    nodeData: Map<string, { input: any, output: any }>; // nodeId -> data
    executionHistory: Execution[];
  }
  ```
- [ ] Node status indicators on canvas (running, success, error)
- [ ] Status colors (gray → blue → green/red)
- [ ] Animated transitions

#### Day 3-4: Input/Output Data Display
- [ ] **Input Tab:** Show data from connected nodes
  - Display JSON data
  - Syntax highlighting
  - Copy button
  - Expand/collapse
- [ ] **Output Tab:** Show execution results
  - Success/error state
  - Execution time
  - Output data
  - Error messages

#### Day 5: Execution History List
- [ ] Execution history panel
- [ ] List past executions (last 10)
- [ ] Show status, time, duration
- [ ] Click to view details
- [ ] Replay execution button

### Week 2: Pin Data System

#### Day 6-7: Pin Data UI
- [ ] Pin data button on each node (📌 icon)
- [ ] Visual indicator when pinned (badge/color)
- [ ] Pin data editor modal
  ```typescript
  // Modal with JSON editor
  interface PinDataModal {
    nodeId: string;
    currentData: any;
    onSave: (data: any) => void;
  }
  ```
- [ ] JSON validation before save
- [ ] Sample data templates
- [ ] Clear pin data button

#### Day 8-9: Pin Data Integration
- [ ] Store pin data in workflow.pin_data JSONB
- [ ] Use pinned data during execution
  ```typescript
  // In execution logic:
  const data = workflow.pin_data[nodeId] 
    ? workflow.pin_data[nodeId] // Use pinned
    : await executeNode(node);   // Execute normally
  ```
- [ ] Show "using pinned data" indicator during execution
- [ ] Save/load with workflow

#### Day 10: Testing & Polish
- [ ] Test execution panel
- [ ] Test pin data flow
- [ ] Test history
- [ ] Responsive design
- [ ] Performance check

**Deliverables:**
- ✅ Real-time execution status
- ✅ Input/output data display  
- ✅ Execution history
- ✅ Pin data UI
- ✅ Pin data integration

---

## 🚀 Phase 3C: Advanced Features (2 weeks)

### Week 1: Webhooks & Scheduling

#### Day 1-2: Webhook Triggers
- [ ] Webhook URL generation per workflow
  ```typescript
  // API Route: /api/webhooks/[workflowId]
  POST /api/webhooks/{workflowId}/trigger
  ```
- [ ] Webhook trigger node type
- [ ] Test webhook UI
- [ ] Webhook logs
- [ ] Webhook authentication (API key)

#### Day 3-4: Scheduled Executions
- [ ] Schedule trigger node type
- [ ] Cron expression editor
  - Visual cron builder
  - Common presets (daily, weekly, etc.)
  - Test cron expression
- [ ] Schedule manager (backend)
  ```typescript
  // Using node-cron or BullMQ
  cron.schedule(expression, () => {
    executeWorkflow(workflowId);
  });
  ```
- [ ] Active schedules list
- [ ] Enable/disable schedules

#### Day 5: Variables System
- [ ] Workflow variables panel
- [ ] Add/edit/delete variables
- [ ] Variable types (string, number, boolean, secret)
- [ ] Use variables in nodes
  ```typescript
  // In node parameters:
  url: "{{$vars.apiUrl}}"
  ```
- [ ] Variable encryption for secrets

### Week 2: Expressions & Credentials

#### Day 6-7: Expression Editor (Basic)
- [ ] Expression syntax support
  ```typescript
  // Examples:
  {{$json.userId}}
  {{$node["Previous Node"].json.data}}
  {{$now.toISOString()}}
  ```
- [ ] Code editor for expressions (Monaco/CodeMirror)
- [ ] Expression autocomplete (basic)
- [ ] Expression validator
- [ ] Expression tester
- [ ] Built-in functions:
  - `$json` - Current item data
  - `$node` - Access other node data
  - `$now` - Current timestamp
  - `$env` - Environment variables

#### Day 8-9: Credentials Management
- [ ] Credentials store (database table)
  ```sql
  CREATE TABLE credentials (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'api_key', 'oauth', 'basic_auth'
    data JSONB NOT NULL, -- Encrypted
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [ ] Credential types:
  - API Key
  - OAuth 2.0 (basic)
  - Basic Auth (username/password)
  - Custom headers
- [ ] Credentials UI:
  - List credentials
  - Create credential modal
  - Edit credential
  - Delete credential
  - Test credential
- [ ] Use credentials in nodes
  - Credential selector dropdown
  - Auto-inject in HTTP requests

#### Day 10: Version Control (Git Integration)
- [ ] Export workflow as JSON
- [ ] Import workflow from JSON
- [ ] Workflow versions table
  ```sql
  CREATE TABLE workflow_versions (
    id UUID PRIMARY KEY,
    workflow_id UUID REFERENCES workflows(id),
    version INTEGER NOT NULL,
    data JSONB NOT NULL,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [ ] Save version on major changes
- [ ] Version history list
- [ ] Restore from version
- [ ] Compare versions (basic diff)

**Deliverables:**
- ✅ Webhook triggers
- ✅ Scheduled executions
- ✅ Variables & expressions
- ✅ Credentials management
- ✅ Version control

---

## 📋 Implementation Order

### Phase 3B (Weeks 1-2)

**Priority 1: Execution Panel**
1. Create execution store
2. Add node status indicators
3. Build Input/Output tabs
4. Add execution history list

**Priority 2: Pin Data**
5. Pin data button & modal
6. JSON editor
7. Store in database
8. Use during execution

### Phase 3C (Weeks 3-4)

**Priority 1: Triggers**
1. Webhook trigger
2. Schedule trigger
3. Variables system

**Priority 2: Advanced**
4. Expression editor (basic)
5. Credentials system
6. Version control

---

## 🎯 Success Criteria

### Phase 3B Complete When:
- [ ] Can execute workflow and see real-time status
- [ ] Can view input/output data for each node
- [ ] Can see execution history
- [ ] Can pin test data to nodes
- [ ] Pinned data is used during execution

### Phase 3C Complete When:
- [ ] Can trigger workflow via webhook
- [ ] Can schedule workflow execution
- [ ] Can use variables in nodes
- [ ] Can use expressions in parameters
- [ ] Can store and use credentials
- [ ] Can save and restore workflow versions

---

## 🏗️ Key Components to Build

### Execution Panel Component
```typescript
// src/components/workflow/execution/execution-panel.tsx
- ExecutionStatus
- NodeInputData
- NodeOutputData  
- ExecutionHistory
- ExecutionDetails
```

### Pin Data Components
```typescript
// src/components/workflow/pin-data/
- PinDataButton
- PinDataModal
- PinDataEditor
- PinDataIndicator
```

### Advanced Features
```typescript
// src/components/workflow/triggers/
- WebhookTrigger
- ScheduleTrigger
- ManualTrigger

// src/components/workflow/variables/
- VariablesPanel
- VariableEditor

// src/components/workflow/expressions/
- ExpressionEditor
- ExpressionTester

// src/components/workflow/credentials/
- CredentialsList
- CredentialModal
- CredentialSelector
```

---

## 📊 Database Changes Needed

### Phase 3B
```sql
-- Already have from Phase 3A ✅
workflows (with pin_data JSONB)
workflow_executions
node_execution_data
```

### Phase 3C
```sql
-- New tables needed:

-- Webhooks
CREATE TABLE workflow_webhooks (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  path TEXT UNIQUE NOT NULL,
  method TEXT DEFAULT 'POST',
  api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Schedules
CREATE TABLE workflow_schedules (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  active BOOLEAN DEFAULT true,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Variables
CREATE TABLE workflow_variables (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  key TEXT NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string',
  is_secret BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workflow_id, key)
);

-- Credentials
CREATE TABLE credentials (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL, -- Encrypted
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workflow Versions
CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  version INTEGER NOT NULL,
  data JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🚀 After Phase 3C

You'll have a **production-ready workflow automation platform** with:

✅ Complete workflow builder
✅ Real-time execution
✅ Pin data for testing
✅ Execution history
✅ Webhook triggers
✅ Scheduled executions
✅ Variables & expressions
✅ Credentials management
✅ Version control

**This covers ~80% of n8n's core functionality!**

---

## 📈 Remaining Features (Phase 4+)

**Lower Priority:**
- More node types (20+)
- Advanced expressions
- Error workflows
- Subworkflows
- Templates
- Collaboration features
- Advanced credentials (OAuth flows)
- Monitoring & metrics
- Multi-environment

**Total Time:** 8-12 additional weeks

---

## ✅ Summary

**Phase 3B (2 weeks):**
1. Node Execution Panel ✅
2. Pin Data UI ✅
3. Execution History ✅

**Phase 3C (2 weeks):**
1. Webhooks ✅
2. Scheduled executions ✅
3. Variables & expressions ✅
4. Credentials management ✅
5. Version control ✅

**Total:** 4 weeks to complete core workflow system

**Ready to start Phase 3B?** 🚀
