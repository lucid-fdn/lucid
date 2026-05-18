# Workflow Integration - Phase 1 Kickoff Guide

**Date:** October 17, 2025  
**Approach:** Option 1 - Separate Route Group  
**Timeline:** Week 1-2 (Setup & Foundation)

---

## Quick Start Checklist

### Prerequisites
- [ ] Review all audit documents
- [ ] Backup current codebase
- [ ] Create feature branch: `feature/workflow-integration`
- [ ] Set up staging environment
- [ ] Install additional dependencies

### Week 1 Goals
- [ ] Set up route group structure
- [ ] Install workflow dependencies
- [ ] Create basic layouts
- [ ] Set up workspace context sharing
- [ ] Add workflow nav link

### Week 2 Goals
- [ ] Set up Zustand stores
- [ ] Create API routes
- [ ] Build workflow list page
- [ ] Implement basic CRUD
- [ ] Add feature flag

---

## Step 1: Install Dependencies

```bash
# Install React Flow and related packages
npm install reactflow@11.10.4

# Install Zustand for state management
npm install zustand@4.4.7

# Install immer for immutable updates
npm install immer@10.0.3

# Install additional workflow utilities
npm install @dnd-kit/core@6.1.0 @dnd-kit/sortable@8.0.0

# Optional: Monaco Editor for code editing
npm install @monaco-editor/react@4.6.0
```

Update `package.json`:
```json
{
  "dependencies": {
    "reactflow": "^11.10.4",
    "zustand": "^4.4.7",
    "immer": "^10.0.3",
    "@monaco-editor/react": "^4.6.0"
  }
}
```

---

## Step 2: Create Feature Flag

```typescript
// lib/feature-flags.ts (CREATE NEW)
export const FEATURE_FLAGS = {
  WORKFLOWS_ENABLED: process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED === 'true',
} as const;

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag];
}
```

Add to `.env.local`:
```bash
# Workflow Feature Flag
NEXT_PUBLIC_WORKFLOWS_ENABLED=true
```

---

## Step 3: Create Route Group Structure

```bash
# Create the (workflow) route group
mkdir -p src/app/\(workflow\)

# Create workspace-scoped structure
mkdir -p src/app/\(workflow\)/\[workspace-slug\]/workflows
mkdir -p src/app/\(workflow\)/\[workspace-slug\]/workflows/new
mkdir -p src/app/\(workflow\)/\[workspace-slug\]/workflows/\[workflowId\]
```

Your structure should look like:
```
src/app/
├── (app)/                        # Existing
├── (workflow)/                   # NEW
│   ├── layout.tsx               # NEW
│   ├── providers.tsx            # NEW
│   ├── error.tsx                # NEW
│   └── [workspace-slug]/        # NEW
│       └── workflows/
│           ├── page.tsx         # List view
│           ├── new/
│           │   └── page.tsx     # Create workflow
│           └── [workflowId]/
│               ├── page.tsx     # Edit workflow
│               └── layout.tsx   # Workflow detail layout
```

---

## Step 4: Create Root Workflow Layout

```tsx
// src/app/(workflow)/layout.tsx (CREATE NEW)
'use client';

import { WorkflowProviders } from './providers';

export default function WorkflowRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkflowProviders>{children}</WorkflowProviders>;
}
```

---

## Step 5: Create Workflow Providers

```tsx
// src/app/(workflow)/providers.tsx (CREATE NEW)
'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

// Create a query client for workflow data
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

export function WorkflowProviders({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Redirect if not authenticated
  if (!isLoading && !isAuthenticated) {
    router.push('/login');
    return null;
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

---

## Step 6: Create Workspace Layout (with shared sidebar)

```tsx
// src/app/(workflow)/[workspace-slug]/workflows/layout.tsx (CREATE NEW)
'use client';

import { WorkspaceSidebar } from '@/components/navigation/workspace-sidebar';
import { UnifiedNavbar } from '@/components/navigation/unified-navbar';
import { useParams } from 'next/navigation';

export default function WorkflowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const workspaceSlug = params['workspace-slug'] as string;

  return (
    <div className="flex h-screen">
      {/* Shared sidebar - same as (app) route group */}
      <WorkspaceSidebar workspaceSlug={workspaceSlug} />
      
      <div className="flex flex-1 flex-col">
        {/* Shared header */}
        <UnifiedNavbar />
        
        {/* Workflow content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## Step 7: Add Workflows Link to Sidebar

```tsx
// src/components/navigation/workspace-sidebar.tsx (UPDATE EXISTING)

import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { Workflow } from 'lucide-react'; // Add this import

// In your navigation items array:
const navItems = [
  { name: 'Dashboard', href: `/${workspace.slug}/dashboard`, icon: LayoutDashboard },
  { name: 'Projects', href: `/${workspace.slug}/projects`, icon: FolderOpen },
  
  // NEW: Add workflows link
  ...(FEATURE_FLAGS.WORKFLOWS_ENABLED
    ? [{ name: 'Workflows', href: `/${workspace.slug}/workflows`, icon: Workflow }]
    : []),
    
  { name: 'Assets', href: `/${workspace.slug}/assets`, icon: Package },
  { name: 'Chat', href: `/${workspace.slug}/chat`, icon: MessageSquare },
  { name: 'Settings', href: `/${workspace.slug}/settings`, icon: Settings },
];
```

---

## Step 8: Create Workflow List Page

```tsx
// src/app/(workflow)/[workspace-slug]/workflows/page.tsx (CREATE NEW)
'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function WorkflowsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params['workspace-slug'] as string;

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">
            Automate your processes with visual workflows
          </p>
        </div>
        
        <Button
          onClick={() => router.push(`/${workspaceSlug}/workflows/new`)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {/* Empty State */}
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Get started by creating your first workflow
          </p>
          <Button
            onClick={() => router.push(`/${workspaceSlug}/workflows/new`)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Workflow
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 9: Create New Workflow Page

```tsx
// src/app/(workflow)/[workspace-slug]/workflows/new/page.tsx (CREATE NEW)
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params['workspace-slug'] as string;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      // TODO: API call will be added in next step
      console.log('Creating workflow:', { name, description });
      
      // For now, just redirect back
      router.push(`/${workspaceSlug}/workflows`);
    } catch (error) {
      console.error('Failed to create workflow:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Workflow</CardTitle>
          <CardDescription>
            Give your workflow a name and description to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workflow Name *</Label>
            <Input
              id="name"
              placeholder="My Awesome Workflow"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="What does this workflow do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              disabled={!name || isCreating}
              className="flex-1"
            >
              {isCreating ? 'Creating...' : 'Create Workflow'}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/${workspaceSlug}/workflows`)}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Step 10: Create Basic Zustand Store

```typescript
// src/stores/workflow/workflows.store.ts (CREATE NEW)
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface Workflow {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  nodes: any[];
  connections: any[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowsState {
  // State
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setWorkflows: (workflows: Workflow[]) => void;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  removeWorkflow: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorkflowsStore = create<WorkflowsState>()(
  devtools(
    immer((set) => ({
      // Initial state
      workflows: [],
      currentWorkflow: null,
      isLoading: false,
      error: null,

      // Actions
      setWorkflows: (workflows) => set({ workflows }),
      
      setCurrentWorkflow: (workflow) => set({ currentWorkflow: workflow }),
      
      addWorkflow: (workflow) =>
        set((state) => {
          state.workflows.push(workflow);
        }),
      
      updateWorkflow: (id, updates) =>
        set((state) => {
          const index = state.workflows.findIndex((w) => w.id === id);
          if (index !== -1) {
            state.workflows[index] = { ...state.workflows[index], ...updates };
          }
          if (state.currentWorkflow?.id === id) {
            state.currentWorkflow = { ...state.currentWorkflow, ...updates };
          }
        }),
      
      removeWorkflow: (id) =>
        set((state) => {
          state.workflows = state.workflows.filter((w) => w.id !== id);
          if (state.currentWorkflow?.id === id) {
            state.currentWorkflow = null;
          }
        }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
    })),
    { name: 'workflows-store' }
  )
);

// Selectors
export const selectAllWorkflows = (state: WorkflowsState) => state.workflows;
export const selectCurrentWorkflow = (state: WorkflowsState) => state.currentWorkflow;
export const selectIsLoading = (state: WorkflowsState) => state.isLoading;
```

---

## Step 11: Create Error Boundary

```tsx
// src/app/(workflow)/error.tsx (CREATE NEW)
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function WorkflowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Workflow error:', error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="text-center max-w-md">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-6">
          {error.message || 'An error occurred while loading the workflow'}
        </p>
        <div className="flex gap-2 justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 12: Test Your Setup

### 1. Start the development server
```bash
npm run dev
```

### 2. Navigate to workflows
```
http://localhost:3000/{your-workspace-slug}/workflows
```

### 3. Verify:
- [ ] Sidebar shows "Workflows" link
- [ ] Clicking "Workflows" loads the page
- [ ] Same sidebar visible
- [ ] Can navigate back to Dashboard
- [ ] "New Workflow" button works
- [ ] Can navigate to create page

---

## What You Should See

```
✓ Sidebar with Workflows link (feature-flagged)
✓ Empty workflow list page
✓ "Create Workflow" button
✓ Create workflow form
✓ Navigation works seamlessly
✓ Same UI/UX as rest of app
```

---

## Next Steps (Week 2)

Once Phase 1 is complete:

1. **API Routes**
   - Create `/api/workflows` endpoints
   - Connect to Supabase
   - Add CRUD operations

2. **Canvas Integration**
   - Install React Flow
   - Create canvas component
   - Add node types

3. **State Management**
   - Expand Zustand stores
   - Add canvas store
   - Add execution store

4. **Testing**
   - Write unit tests
   - Test navigation flows
   - Test error scenarios

---

## Troubleshooting

### Issue: "Cannot find module '@/components/navigation/workspace-sidebar'"
**Solution:** Make sure your existing sidebar component is exported properly

### Issue: Feature flag not working
**Solution:** Restart dev server after adding env variable

### Issue: Route not found
**Solution:** Check parentheses in folder names: `(workflow)` not `workflow`

### Issue: Layout not applying
**Solution:** Ensure layout.tsx is in correct folder and properly exported

---

## Success Criteria for Week 1-2

- [ ] Route group structure created
- [ ] Dependencies installed
- [ ] Feature flag working
- [ ] Sidebar shows Workflows link
- [ ] Can navigate to workflows page
- [ ] Can navigate to create page
- [ ] Basic Zustand store created
- [ ] Error boundary in place
- [ ] No impact on existing features
- [ ] All existing routes still work

---

## Getting Help

If you encounter issues:
1. Check the console for errors
2. Verify all file paths
3. Ensure env variables are set
4. Restart dev server
5. Review the audit documents

---

## Ready to Start?

```bash
# 1. Create feature branch
git checkout -b feature/workflow-integration

# 2. Install dependencies
npm install reactflow zustand immer

# 3. Create folder structure
mkdir -p src/app/\(workflow\)/\[workspace-slug\]/workflows

# 4. Start coding!
```

**Let's build this! 🚀**
