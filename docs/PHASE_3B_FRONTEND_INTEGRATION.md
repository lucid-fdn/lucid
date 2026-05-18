# Phase 3B: Frontend Integration & UX Polish

**Status:** 🚀 Starting Now  
**Date:** October 17, 2025  
**Duration:** Days 5-7 (Frontend Integration)  
**Prerequisites:** ✅ Phase 3A Complete (Backend + API Routes)

---

## 🎯 Objective

Integrate the backend API with the frontend UI, adding:
- Server-side data fetching (SSR)
- Client-side mutations with optimistic updates
- Auto-save functionality
- Toast notifications
- Execution UI with real-time feedback
- Pin Data UI for testing nodes
- Proper error handling and loading states

---

## 📋 Implementation Checklist

### Day 5: Server-Side Pages & Client Components

- [ ] **Update workflows list page (SSR)**
  - [ ] Fetch workflows server-side
  - [ ] Pass to client component
  - [ ] Add loading skeleton
  
- [ ] **Create workflows-client.tsx**
  - [ ] Display workflow cards
  - [ ] Create workflow button
  - [ ] Delete workflow with confirmation
  - [ ] Optimistic updates
  - [ ] Toast notifications
  
- [ ] **Update workflow editor page (SSR)**
  - [ ] Fetch workflow server-side
  - [ ] Handle 404 cases
  - [ ] Pass to client editor
  
- [ ] **Create workflow-editor.tsx**
  - [ ] Initialize canvas with workflow data
  - [ ] Save button with loading state
  - [ ] Auto-save on changes (debounced)
  - [ ] Execute button
  - [ ] Status indicators

### Day 6: Store Integration & Auto-Save

- [ ] **Update canvas store**
  - [ ] Add workflow ID state
  - [ ] Add saveWorkflow() method
  - [ ] Add isDirty tracking
  - [ ] Add isSaving state
  - [ ] Integrate with API
  
- [ ] **Implement auto-save**
  - [ ] 2-second debounce on changes
  - [ ] Show saving indicator
  - [ ] Handle save errors
  - [ ] Retry logic
  
- [ ] **Update workflows store**
  - [ ] Add fetchWorkflows() method
  - [ ] Add createWorkflow() method
  - [ ] Add deleteWorkflow() method
  - [ ] Add executeWorkflow() method
  - [ ] Optimistic updates

### Day 7: Execution UI & Polish

- [ ] **Execution button & UI**
  - [ ] Execute button in toolbar
  - [ ] Execution progress indicator
  - [ ] Show execution results
  - [ ] Error display
  - [ ] Success feedback
  
- [ ] **Toast integration**
  - [ ] Save success/error
  - [ ] Execute started
  - [ ] Execute complete
  - [ ] Execute failed
  
- [ ] **Loading states**
  - [ ] Skeleton loaders
  - [ ] Button loading states
  - [ ] Canvas loading overlay
  
- [ ] **Error handling**
  - [ ] API error messages
  - [ ] Network errors
  - [ ] 404 handling
  - [ ] Permission errors

---

## 🏗️ Implementation Details

### 1. Workflows List Page (Server-Side)

**File:** `src/app/(workflow)/[workspace-slug]/workflows/page.tsx`

```typescript
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { WorkflowsClient } from './workflows-client';

export default async function WorkflowsPage({
  params,
}: {
  params: { 'workspace-slug': string };
}) {
  // Server-side auth (auto-redirect if not authenticated)
  const { user } = await requireServerAuth();
  
  // Server-side data fetch
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  
  if (error) {
    console.error('[workflows-page] Failed to fetch workflows:', error);
  }
  
  return (
    <WorkflowsClient 
      initialWorkflows={workflows || []} 
      user={user}
      workspaceSlug={params['workspace-slug']}
    />
  );
}
```

### 2. Workflows Client Component

**File:** `src/app/(workflow)/[workspace-slug]/workflows/workflows-client.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Play, Trash2 } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/alert-dialog';

interface WorkflowsClientProps {
  initialWorkflows: any[];
  user: any;
  workspaceSlug: string;
}

export function WorkflowsClient({ 
  initialWorkflows, 
  user,
  workspaceSlug 
}: WorkflowsClientProps) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const router = useRouter();
  
  const createWorkflow = async () => {
    setIsCreating(true);
    
    const tempWorkflow = {
      id: 'temp',
      name: 'Untitled Workflow',
      user_id: user.id,
      nodes: [],
      edges: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    // Optimistic update
    setWorkflows(prev => [tempWorkflow, ...prev]);
    
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Untitled Workflow',
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Replace temp with real workflow
      setWorkflows(prev => [
        result.data,
        ...prev.filter(w => w.id !== 'temp')
      ]);
      
      toast.success('Workflow created');
      
      // Navigate to editor
      router.push(`/${workspaceSlug}/workflows/${result.data.id}`);
    } catch (error) {
      // Rollback on error
      setWorkflows(prev => prev.filter(w => w.id !== 'temp'));
      toast.error('Failed to create workflow');
      console.error('[workflows-client] Create error:', error);
    } finally {
      setIsCreating(false);
    }
  };
  
  const deleteWorkflow = async (id: string) => {
    const originalWorkflows = workflows;
    
    // Optimistic delete
    setWorkflows(prev => prev.filter(w => w.id !== id));
    setDeleteId(null);
    
    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      toast.success('Workflow deleted');
    } catch (error) {
      // Rollback on error
      setWorkflows(originalWorkflows);
      toast.error('Failed to delete workflow');
      console.error('[workflows-client] Delete error:', error);
    }
  };
  
  const executeWorkflow = async (id: string, name: string) => {
    try {
      toast.loading('Starting workflow...', { id: 'execute' });
      
      const response = await fetch(`/api/workflows/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      toast.success(`${name} execution started`, { id: 'execute' });
    } catch (error) {
      toast.error('Failed to execute workflow', { id: 'execute' });
      console.error('[workflows-client] Execute error:', error);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">
            Create and manage your automation workflows
          </p>
        </div>
        <Button 
          onClick={createWorkflow}
          disabled={isCreating}
        >
          <Plus className="h-4 w-4 mr-2" />
          {isCreating ? 'Creating...' : 'New Workflow'}
        </Button>
      </div>
      
      {/* Workflows Grid */}
      {workflows.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">
            No workflows yet. Create your first workflow to get started.
          </p>
          <Button onClick={createWorkflow} disabled={isCreating}>
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <Card
              key={workflow.id}
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/${workspaceSlug}/workflows/${workflow.id}`)}
            >
              <div className="space-y-4">
                {/* Workflow Info */}
                <div>
                  <h3 className="font-semibold">{workflow.name}</h3>
                  {workflow.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {workflow.description}
                    </p>
                  )}
                </div>
                
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{workflow.nodes?.length || 0} nodes</span>
                  <span>•</span>
                  <span>
                    {new Date(workflow.updated_at).toLocaleDateString()}
                  </span>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      executeWorkflow(workflow.id, workflow.name);
                    }}
                    disabled={workflow.id === 'temp'}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Execute
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(workflow.id);
                    }}
                    disabled={workflow.id === 'temp'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              workflow and all its execution history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteWorkflow(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

### 3. Workflow Editor Page (Server-Side)

**File:** `src/app/(workflow)/[workspace-slug]/workflows/[workflowId]/page.tsx`

```typescript
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
  
  // Validate UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(params.workflowId)) {
    notFound();
  }
  
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
  
  return (
    <WorkflowEditor 
      initialWorkflow={workflow}
      user={user}
      workspaceSlug={params['workspace-slug']}
    />
  );
}
```

### 4. Workflow Editor Client Component

**File:** `src/app/(workflow)/[workspace-slug]/workflows/[workflowId]/workflow-editor.tsx`

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Play, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/ui/components/button';
import { toast } from 'sonner';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { WorkflowCanvas } from '@/components/workflow/canvas/workflow-canvas';
import { NodePalette } from '@/components/workflow/palette/node-palette';
import { NodeConfigPanel } from '@/components/workflow/config/node-config-panel';

interface WorkflowEditorProps {
  initialWorkflow: any;
  user: any;
  workspaceSlug: string;
}

export function WorkflowEditor({ 
  initialWorkflow, 
  user,
  workspaceSlug 
}: WorkflowEditorProps) {
  const router = useRouter();
  const { 
    nodes, 
    edges, 
    setNodes, 
    setEdges,
  } = useCanvasStore();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date(initialWorkflow.updated_at));
  
  // Load workflow on mount
  useEffect(() => {
    setNodes(initialWorkflow.nodes || []);
    setEdges(initialWorkflow.edges || []);
  }, [initialWorkflow, setNodes, setEdges]);
  
  // Track changes
  useEffect(() => {
    const hasChanges = JSON.stringify({ nodes, edges }) !== 
                       JSON.stringify({ 
                         nodes: initialWorkflow.nodes || [],
                         edges: initialWorkflow.edges || []
                       });
    setIsDirty(hasChanges);
  }, [nodes, edges, initialWorkflow]);
  
  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!isDirty || isSaving) return;
    
    const timer = setTimeout(async () => {
      await saveWorkflow(true); // auto-save
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [isDirty, isSaving, nodes, edges]);
  
  const saveWorkflow = useCallback(async (isAutoSave = false) => {
    setIsSaving(true);
    
    try {
      const response = await fetch(`/api/workflows/${initialWorkflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes,
          edges,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      setLastSaved(new Date());
      setIsDirty(false);
      
      if (!isAutoSave) {
        toast.success('Workflow saved');
      }
    } catch (error) {
      toast.error('Failed to save workflow');
      console.error('[workflow-editor] Save error:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [initialWorkflow.id, nodes, edges]);
  
  const executeWorkflow = async () => {
    // Save first if dirty
    if (isDirty) {
      try {
        await saveWorkflow();
      } catch (error) {
        toast.error('Please save the workflow first');
        return;
      }
    }
    
    setIsExecuting(true);
    
    try {
      toast.loading('Starting workflow...', { id: 'execute' });
      
      const response = await fetch(`/api/workflows/${initialWorkflow.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      toast.success('Workflow execution started', { id: 'execute' });
    } catch (error) {
      toast.error('Failed to execute workflow', { id: 'execute' });
      console.error('[workflow-editor] Execute error:', error);
    } finally {
      setIsExecuting(false);
    }
  };
  
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Toolbar */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${workspaceSlug}/workflows`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h2 className="font-semibold">{initialWorkflow.name}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : isDirty ? (
                  <span>Unsaved changes</span>
                ) : (
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveWorkflow(false)}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={executeWorkflow}
              disabled={isExecuting || isDirty}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Canvas Area */}
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

---

## 🎯 Success Criteria

### Functionality
- [ ] Workflows list loads with SSR
- [ ] Create workflow works with optimistic update
- [ ] Delete workflow works with confirmation
- [ ] Editor loads workflow from database
- [ ] Auto-save works (2-second debounce)
- [ ] Manual save works
- [ ] Execute button works
- [ ] Toast notifications appear correctly
- [ ] Loading states show appropriately
- [ ] Errors are handled gracefully

### UX
- [ ] No loading spinners on initial load (SSR)
- [ ] Optimistic updates feel instant
- [ ] Save indicators are clear
- [ ] Execute provides feedback
- [ ] Errors are user-friendly
- [ ] Back navigation works
- [ ] Responsive on mobile

### Performance
- [ ] Initial page load < 1s
- [ ] Save operation < 500ms
- [ ] No unnecessary re-renders
- [ ] Debounced auto-save doesn't lag

---

## 📊 Testing Plan

### Manual Testing
1. **List Page:**
   - Visit /workspace/workflows
   - See existing workflows (SSR - no spinner)
   - Click "New Workflow"
   - See optimistic create
   - Navigate to editor

2. **Editor:**
   - See workflow load instantly
   - Add a node
   - See "Unsaved changes"
   - Wait 2 seconds
   - See "Saving..."
   - See "Saved [time]"

3. **Execute:**
   - Click Execute
   - See toast "Starting workflow..."
   - Wait 1 second
   - See toast "Workflow execution started"
   - Check bell icon for notification

4. **Delete:**
   - Go back to list
   - Click delete icon
   - See confirmation dialog
   - Confirm
   - See optimistic delete
   - See toast "Workflow deleted"

### Error Testing
1. Network offline → See error toast
2. Invalid workflow ID → 404 page
3. Save fails → Rollback + error toast
4. Delete fails → Rollback + error toast
5. Execute fails → Error toast

---

## 🚀 Ready to Start Phase 3B!

**What we'll build:**
1. ✅ Server-side pages (instant load)
2. ✅ Client components (optimistic updates)
3. ✅ Auto-save (2-second debounce)
4. ✅ Execution UI (toast feedback)
5. ✅ Loading states (spinners, indicators)
6. ✅ Error handling (user-friendly)

**Timeline:**
- Day 5: Pages & Components (4-6 hours)
- Day 6: Store Integration & Auto-Save (4-6 hours)
- Day 7: Polish & Testing (4-6 hours)

**Let's build it!** 🎯
