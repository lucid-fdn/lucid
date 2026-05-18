# Phase 3: Backend Integration with Proper Architecture

**Status:** Planning
**Priority:** HIGH
**Estimated Time:** 3-5 days

---

## 🚨 Critical Issues to Fix from Phases 1-2B

### What Was Built Wrong

**❌ ALL Client-Side**
- No server-side data fetching
- No initial SSR
- Loading spinners everywhere

**❌ No Auth Integration**
- Didn't use `requireServerAuth()`
- Didn't use `useAuth()` context
- No UUID validation

**❌ No System Integration**
- No toast notifications
- No access control checks
- No proper error handling
- Standalone Zustand stores

**❌ No Cache Management**
- No optimistic updates
- No revalidation
- Manual refetch only

---

## ✅ Existing Systems Found

### 1. Authentication System

**Server-Side:**
```typescript
// src/lib/auth/server-utils.ts
import { requireServerAuth, getServerAuth } from '@/lib/auth/server-utils';

// In pages
const { user } = await requireServerAuth(); // Returns UUID user

// In API routes
const userId = await requireUserId(); // Returns UUID
```

**Client-Side:**
```typescript
// src/contexts/auth-context.tsx
import { useAuth } from '@/contexts/auth-context';

const { user, isAuthenticated } = useAuth(); // user.id is UUID
```

### 2. API Route Pattern

```typescript
// Example: src/app/api/orgs/[id]/invites/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/server-utils';
import { canPerformAction } from '@/lib/access-control/server';

const Schema = z.object({
  // Zod validation
});

export async function POST(req: NextRequest, { params }) {
  try {
    // 1. Auth
    const userId = await requireUserId();
    
    // 2. Parse & validate
    const body = await req.json();
    const data = Schema.parse(body);
    
    // 3. Access control
    const canDo = await canPerformAction(userId, params.id, 'action');
    if (!canDo) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // 4. Database operation
    const result = await supabase.from('table').insert(data);
    
    // 5. Return response
    return NextResponse.json({ success: true, data: result });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

### 3. Toast Notifications

```typescript
// Uses Sonner
import { useToast } from '@/hooks/use-toast';

const toast = useToast();

toast.success('Action completed');
toast.error('Action failed');
toast.info('Information message');
```

**Provider Location:** `src/ui/components/sonner.tsx`

### 4. Form System

**Components:**
- `FormSection` - Card wrapper with header
- `FormField` - Individual field with label/error
- `FormActions` - Submit/cancel buttons
- `FormMessage` - Error/success messages

**Pattern:**
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField, FormActions } from '@/components/forms';

const form = useForm({
  resolver: zodResolver(schema),
});

const onSubmit = async (data) => {
  const result = await serverAction(data);
  if (result.success) {
    toast.success('Saved');
  }
};
```

### 5. Notification System

```typescript
// Bell icon notifications
import { useNotifications, createNotification } from '@/hooks/use-notifications';

// In component
const { notifications, unreadCount, markAsRead } = useNotifications();

// Create notification
await createNotification({
  user_id: userId,
  organization_id: orgId || null,
  title: 'Title',
  message: 'Message',
  type: 'success',
  href: '/link',
});
```

### 6. Access Control

```typescript
// src/lib/access-control/server.ts
import { canPerformAction } from '@/lib/access-control/server';

const canEdit = await canPerformAction(userId, resourceId, 'edit');
if (!canEdit) {
  throw new Error('Forbidden');
}
```

### 7. Data Fetching Pattern

**No SWR/React Query!** Direct Supabase queries with manual refetch:

```typescript
// Server-side initial data
export default async function Page() {
  const { user } = await requireServerAuth();
  const data = await supabase.from('table').select();
  
  return <ClientComponent initialData={data} user={user} />;
}

// Client-side mutations
const refetch = async () => {
  const { data } = await supabase.from('table').select();
  setState(data);
};

const create = async (item) => {
  // Optimistic update
  setState(prev => [...prev, item]);
  
  try {
    await supabase.from('table').insert(item);
    await refetch(); // Revalidate
    toast.success('Created');
  } catch (error) {
    await refetch(); // Rollback
    toast.error('Failed');
  }
};
```

---

## 📋 Phase 3 Implementation Plan

### Step 1: Database Schema (Day 1)

**Create workflows table:**
```sql
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB DEFAULT '[]'::jsonb,
  edges JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own workflows"
  ON workflows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create workflows"
  ON workflows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflows"
  ON workflows FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflows"
  ON workflows FOR DELETE
  USING (auth.uid() = user_id);

-- Org members can view org workflows
CREATE POLICY "Org members can view org workflows"
  ON workflows FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );
```

**Create workflow_executions table:**
```sql
CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
```

### Step 2: API Routes (Day 2)

**File:** `src/app/api/workflows/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireUserId } from '@/lib/auth/server-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schema
const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organization_id: z.string().uuid().optional(),
  nodes: z.array(z.any()).default([]),
  edges: z.array(z.any()).default([]),
});

// GET /api/workflows - List workflows
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    
    let query = supabase
      .from('workflows')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (orgId) {
      query = query.eq('organization_id', orgId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[api/workflows] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workflows' },
      { status: 500 }
    );
  }
}

// POST /api/workflows - Create workflow
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const data = CreateWorkflowSchema.parse(body);
    
    // Access control for org workflows
    if (data.organization_id) {
      const { canPerformAction } = await import('@/lib/access-control/server');
      const canCreate = await canPerformAction(userId, data.organization_id, 'createWorkflows');
      if (!canCreate) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }
    
    const { data: workflow, error } = await supabase
      .from('workflows')
      .insert({
        ...data,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({ success: true, data: workflow });
  } catch (error) {
    console.error('[api/workflows] POST error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create workflow' },
      { status: 500 }
    );
  }
}
```

**File:** `src/app/api/workflows/[id]/route.ts`

```typescript
// GET /api/workflows/[id] - Get workflow
// PUT /api/workflows/[id] - Update workflow
// DELETE /api/workflows/[id] - Delete workflow
```

**File:** `src/app/api/workflows/[id]/execute/route.ts`

```typescript
// POST /api/workflows/[id]/execute - Execute workflow
```

### Step 3: Server-Side Data Fetching (Day 2-3)

**Update workflow list page:**

```typescript
// src/app/(workflow)/[workspace-slug]/workflows/page.tsx
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { WorkflowsClient } from './workflows-client';

export default async function WorkflowsPage({ params }: { params: { 'workspace-slug': string } }) {
  // Server-side auth
  const { user } = await requireServerAuth();
  
  // Server-side data fetch
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: workflows } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  
  // Pass to client component
  return <WorkflowsClient initialWorkflows={workflows || []} user={user} />;
}
```

**Create client component:**

```typescript
// src/app/(workflow)/[workspace-slug]/workflows/workflows-client.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function WorkflowsClient({ initialWorkflows, user }) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();
  
  const createWorkflow = async (name: string) => {
    setLoading(true);
    
    // Optimistic update
    const tempWorkflow = {
      id: 'temp',
      name,
      user_id: user.id,
      nodes: [],
      edges: [],
      created_at: new Date().toISOString(),
    };
    setWorkflows(prev => [tempWorkflow, ...prev]);
    
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      const result = await response.json();
      
      if (!result.success) throw new Error(result.error);
      
      // Replace temp with real
      setWorkflows(prev => [result.data, ...prev.filter(w => w.id !== 'temp')]);
      
      toast.success('Workflow created');
      router.push(`/workspace/workflows/${result.data.id}`);
    } catch (error) {
      // Rollback
      setWorkflows(prev => prev.filter(w => w.id !== 'temp'));
      toast.error('Failed to create workflow');
    } finally {
      setLoading(false);
    }
  };
  
  const deleteWorkflow = async (id: string) => {
    // Optimistic delete
    const original = workflows;
    setWorkflows(prev => prev.filter(w => w.id !== id));
    
    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error();
      
      toast.success('Workflow deleted');
    } catch (error) {
      // Rollback
      setWorkflows(original);
      toast.error('Failed to delete workflow');
    }
  };
  
  return (
    <div>
      {/* UI here */}
    </div>
  );
}
```

### Step 4: Canvas Store Integration (Day 3)

**Update canvas store to sync with API:**

```typescript
// src/stores/workflow/canvas.store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface CanvasState {
  workflowId: string | null;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  
  // Actions
  setWorkflowId: (id: string) => void;
  loadWorkflow: (workflow: any) => void;
  saveWorkflow: () => Promise<void>;
  addNode: (node: Node) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  // ... other actions
}

export const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set, get) => ({
      workflowId: null,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isDirty: false,
      isSaving: false,
      
      setWorkflowId: (id) => set({ workflowId: id }),
      
      loadWorkflow: (workflow) => set({
        workflowId: workflow.id,
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        isDirty: false,
      }),
      
      saveWorkflow: async () => {
        const state = get();
        if (!state.workflowId || !state.isDirty) return;
        
        set({ isSaving: true });
        
        try {
          const response = await fetch(`/api/workflows/${state.workflowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodes: state.nodes,
              edges: state.edges,
            }),
          });
          
          if (!response.ok) throw new Error();
          
          set({ isDirty: false });
        } catch (error) {
          console.error('Failed to save workflow:', error);
          throw error;
        } finally {
          set({ isSaving: false });
        }
      },
      
      addNode: (node) => set((state) => {
        state.nodes.push(node);
        state.isDirty = true;
      }),
      
      updateNode: (id, updates) => set((state) => {
        const node = state.nodes.find(n => n.id === id);
        if (node) {
          Object.assign(node, updates);
          state.isDirty = true;
        }
      }),
      
      // ... other actions
    })),
    { name: 'canvas-store' }
  )
);
```

### Step 5: Editor Page Server-Side (Day 3-4)

**Update editor to fetch workflow server-side:**

```typescript
// src/app/(workflow)/[workspace-slug]/workflows/[workflowId]/page.tsx
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { WorkflowEditor } from './workflow-editor';

export default async function WorkflowEditorPage({
  params,
}: {
  params: { 'workspace-slug': string; workflowId: string };
}) {
  const { user } = await requireServerAuth();
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Fetch workflow
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', params.workflowId)
    .eq('user_id', user.id)
    .single();
  
  if (error || !workflow) {
    notFound();
  }
  
  return <WorkflowEditor initialWorkflow={workflow} user={user} />;
}
```

**Create client editor:**

```typescript
// src/app/(workflow)/[workspace-slug]/workflows/[workflowId]/workflow-editor.tsx
'use client';

import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { useToast } from '@/hooks/use-toast';
import { WorkflowCanvas } from '@/components/workflow/canvas/workflow-canvas';
import { NodePalette } from '@/components/workflow/palette/node-palette';
import { NodeConfigPanel } from '@/components/workflow/config/node-config-panel';

export function WorkflowEditor({ initialWorkflow, user }) {
  const { loadWorkflow, saveWorkflow, isDirty, isSaving } = useCanvasStore();
  const toast = useToast();
  
  // Load workflow on mount
  useEffect(() => {
    loadWorkflow(initialWorkflow);
  }, [initialWorkflow, loadWorkflow]);
  
  // Auto-save on changes
  useEffect(() => {
    if (!isDirty) return;
    
    const timer = setTimeout(async () => {
      try {
        await saveWorkflow();
        toast.success('Workflow saved');
      } catch (error) {
        toast.error('Failed to save workflow');
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [isDirty, saveWorkflow, toast]);
  
  const handleManualSave = async () => {
    try {
      await saveWorkflow();
      toast.success('Workflow saved');
    } catch (error) {
      toast.error('Failed to save');
    }
  };
  
  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Toolbar with save button */}
      <div className="border-b p-3 flex items-center justify-between">
        <div>
          <h2>{initialWorkflow.name}</h2>
          {isSaving && <span>Saving...</span>}
          {isDirty && !isSaving && <span>Unsaved changes</span>}
        </div>
        <Button onClick={handleManualSave} disabled={!isDirty || isSaving}>
          Save
        </Button>
      </div>
      
      {/* Canvas */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette />
        <div className="flex-1">
          <WorkflowCanvas />
        </div>
        <NodeConfigPanel />
      </div>
    </div>
  );
}
```

### Step 6: Notifications Integration (Day 4)

**Add workflow notifications:**

```typescript
// When workflow executes
await createNotification({
  user_id: userId,
  organization_id: workflow.organization_id,
  title: 'Workflow executed',
  message: `${workflow.name} completed successfully`,
  type: 'success',
  href: `/workspace/workflows/${workflow.id}`,
});

// When workflow fails
await createNotification({
  user_id: userId,
  organization_id: workflow.organization_id,
  title: 'Workflow failed',
  message: `${workflow.name} encountered an error`,
  type: 'error',
  href: `/workspace/workflows/${workflow.id}`,
});
```

### Step 7: Access Control (Day 4-5)

**Add workflow permissions:**

```typescript
// src/lib/access-control/workflow-permissions.ts
export async function canEditWorkflow(userId: string, workflowId: string): Promise<boolean> {
  const supabase = createClient(...);
  
  const { data: workflow } = await supabase
    .from('workflows')
    .select('user_id, organization_id')
    .eq('id', workflowId)
    .single();
  
  if (!workflow) return false;
  
  // Owner can edit
  if (workflow.user_id === userId) return true;
  
  // Org admin can edit
  if (workflow.organization_id) {
    return canPerformAction(userId, workflow.organization_id, 'editWorkflows');
  }
  
  return false;
}
```

---

## 📊 Summary of Changes

### Database
- ✅ `workflows` table with RLS
- ✅ `workflow_executions` table
- ✅ Indexes for performance

### API Routes
- ✅ `GET /api/workflows` - List
- ✅ `POST /api/workflows` - Create
- ✅ `GET /api/workflows/[id]` - Get
- ✅ `PUT /api/workflows/[id]` - Update
- ✅ `DELETE /api/workflows/[id]` - Delete
- ✅ `POST /api/workflows/[id]/execute` - Execute

### Frontend
- ✅ Server-side data fetching
- ✅ Client components with optimistic updates
- ✅ Toast notifications
- ✅ Auto-save functionality
- ✅ Access control checks
- ✅ Error handling

### Integration
- ✅ Auth system (requireServerAuth, useAuth)
- ✅ Notification system (createNotification)
- ✅ Access control (canPerformAction)
- ✅ Form system (if needed)
- ✅ Toast system (useToast)

---

## ✅ Checklist

**Day 1:**
- [ ] Create database migrations
- [ ] Run migrations on dev
- [ ] Test RLS policies

**Day 2:**
- [ ] Create API routes
- [ ] Test API routes with Postman
- [ ] Add Zod schemas

**Day 3:**
- [ ] Update workflow list page (server-side)
- [ ] Create client component with optimistic updates
- [ ] Update editor page (server-side)
- [ ] Integrate canvas store with API

**Day 4:**
- [ ] Add auto-save functionality
- [ ] Add notifications
- [ ] Add access control
- [ ] Test everything

**Day 5:**
- [ ] Polish UI
- [ ] Add loading states
- [ ] Error boundaries
- [ ] Documentation

---

## 🎯 Success Criteria

- [ ] Workflows persist to database
- [ ] Server-side rendering works
- [ ] Optimistic updates work
- [ ] Toast notifications show
- [ ] Access control enforced
- [ ] Auto-save works
- [ ] No auth errors (UUID validation)
- [ ] No RLS violations
- [ ] Production-ready code

---

## 📚 Reference

**Key Files:**
- Auth: `src/lib/auth/server-utils.ts`
- API Example: `src/app/api/orgs/[id]/invites/route.ts`
- Notifications: `src/hooks/use-notifications.tsx`
- Toast: `src/hooks/use-toast.ts`
- Architecture: `docs/COMPLETE_ARCHITECTURE_MASTER.md`

**Pattern Examples:**
- Server Component: Any page in `src/app/(studio)/`
- API Route: `src/app/api/orgs/[id]/invites/route.ts`
- Client Mutations: `src/components/settings/*`
- Forms: `src/components/settings/profile-form.tsx`

---

## 🚀 Ready to Start Phase 3!

With this plan, Phase 3 will:
- ✅ Follow your existing patterns
- ✅ Integrate all systems properly
- ✅ Use server-side rendering
- ✅ Have proper auth/access control
- ✅ Include notifications
- ✅ Be production-ready

**Let's build it right!** 🎯
