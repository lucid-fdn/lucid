# LucidMerged → Lucid-L2 FlowSpec Integration Plan (PRODUCTION-GRADE)

**Date:** October 20, 2025  
**Status:** Ready for Implementation  
**Approach:** Industry-standard integration following LucidMerged patterns

---

## 📋 Executive Summary

### What Changed from V1

**V1 Issues Fixed:**
- ❌ Didn't use centralized auth system
- ❌ Created new Supabase clients instead of using existing
- ❌ No feature flag integration
- ❌ Missing toast notifications
- ❌ Components didn't follow shadcn patterns
- ❌ No form validation
- ❌ Missing cache integration
- ❌ No server-side data fetching
- ❌ No optimistic updates

**V2 Improvements:**
- ✅ Uses `requireServerAuth()` from `lib/auth/server-utils.ts`
- ✅ Uses `createClient()` from `lib/supabase/server.ts`
- ✅ Integrates with `useFeatureFlags()` system
- ✅ Uses `useToast()` for notifications
- ✅ Components use shadcn/ui patterns
- ✅ Zod validation schemas
- ✅ React `cache()` integration
- ✅ Server-side initial data load
- ✅ Optimistic UI updates
- ✅ Production-ready error handling

### Architecture

```
Server (Initial Load)
  ↓ requireServerAuth() - Centralized auth
  ↓ createClient() - Centralized Supabase
  ↓ React cache() - Request deduplication
  ↓ Pass to client as initialData
  
Client (Mutations)
  ↓ useToast() - Notifications
  ↓ Optimistic updates - Instant UI
  ↓ API calls - Backend changes
  ↓ Revalidate - Sync state
```

### Time Estimate

**Core Integration:** 6-8 hours (more complex due to proper patterns)  
**CrewAI Enhancement:** +3 hours  
**Total:** 9-11 hours

---

## 🏗️ Phase 0: Setup (30 minutes)

### 0.1 Environment Variables

**Add to `.env.local`:**
```bash
# Lucid-L2 Integration
LUCID_L2_API_URL=http://localhost:3001
LUCID_L2_ADMIN_KEY=

# Feature Flags
NEXT_PUBLIC_LUCID_L2_ENABLED=true
NEXT_PUBLIC_CREWAI_ENABLED=false  # Phase 2
```

### 0.2 Feature Flags

**Update: `src/lib/features.ts`**

```typescript
export const FEATURES = {
  // ... existing flags
  
  // ==================
  // LUCID-L2 INTEGRATION
  // ==================
  lucidL2Integration: process.env.NEXT_PUBLIC_LUCID_L2_ENABLED === 'true',
  crewAIGeneration: process.env.NEXT_PUBLIC_CREWAI_ENABLED === 'true',
  flowSpecExecution: true,  // Core feature
  workflowVersioning: true, // Track versions
} as const;
```

### 0.3 Database Migration

**Create: `migrations/020_lucid_l2_integration.sql`**

```sql
-- Add Lucid-L2 tracking columns
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS lucid_l2_workflow_id TEXT,
ADD COLUMN IF NOT EXISTS lucid_l2_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lucid_l2_last_error TEXT;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_workflows_lucid_l2_id 
ON workflows(lucid_l2_workflow_id) 
WHERE lucid_l2_workflow_id IS NOT NULL;

-- Execution tracking
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  lucid_l2_execution_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error', 'cancelled')),
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for execution queries
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow 
ON workflow_executions(workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status 
ON workflow_executions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_lucid_l2 
ON workflow_executions(lucid_l2_execution_id) 
WHERE lucid_l2_execution_id IS NOT NULL;

-- RLS Policies
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workflow executions"
  ON workflow_executions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their workflow executions"
  ON workflow_executions FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows WHERE user_id = auth.uid()
    )
  );
```

**Apply migration:**
```bash
supabase db push
```

---

## 💻 Phase 1: Lucid-L2 Client Library (2 hours)

### 1.1 TypeScript Types

**Create: `src/lib/lucid-l2/types.ts`**

```typescript
// FlowSpec Types (Lucid-L2 API contract)
export interface FlowSpec {
  name: string;
  description?: string;
  trigger: TriggerNode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables?: Record<string, any>;
}

export interface TriggerNode {
  type: 'webhook' | 'cron' | 'manual';
  config: Record<string, any>;
}

export interface FlowNode {
  id: string;
  type: string;
  params: Record<string, any>;
  position?: { x: number; y: number };
}

export interface FlowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface FlowExecutionContext {
  tenantId: string;
  variables?: Record<string, any>;
  input?: any;
}

export interface FlowExecutionResult {
  success: boolean;
  executionId?: string;
  workflowId?: string;
  data?: any;
  error?: string;
}

export interface CreateWorkflowResponse {
  workflowId: string;
  workflowUrl: string;
}

export interface ExecutionHistoryItem {
  id: string;
  executionId: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt: string;
  finishedAt?: string;
  output?: any;
  error?: string;
}
```

### 1.2 API Client

**Create: `src/lib/lucid-l2/client.ts`**

```typescript
import 'server-only'; // ⚠️ SERVER-SIDE ONLY
import { cache } from 'react';
import type {
  FlowSpec,
  FlowExecutionContext,
  FlowExecutionResult,
  CreateWorkflowResponse,
  ExecutionHistoryItem,
} from './types';

export class LucidL2Client {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl = process.env.LUCID_L2_API_URL || 'http://localhost:3001';
    this.apiKey = process.env.LUCID_L2_API_KEY;
    
    if (!this.baseUrl) {
      throw new Error('LUCID_L2_API_URL environment variable not set');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    console.log('[Lucid-L2 Client] Request:', { 
      method: options.method || 'GET',
      url,
      hasBody: !!options.body 
    });

    const response = await fetch(url, {
      ...options,
      headers,
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('[Lucid-L2 Client] Error:', {
        status: response.status,
        statusText: response.statusText,
        error,
      });
      throw new Error(error.message || `API Error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Lucid-L2 Client] Success:', { endpoint, hasData: !!data });
    return data;
  }

  // Create workflow in Lucid-L2's n8n
  async createWorkflow(flowspec: FlowSpec): Promise<CreateWorkflowResponse> {
    return this.request('/flowspec/create', {
      method: 'POST',
      body: JSON.stringify(flowspec),
    });
  }

  // Execute workflow
  async executeWorkflow(
    workflowId: string,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    return this.request('/flowspec/execute', {
      method: 'POST',
      body: JSON.stringify({ workflowId, context }),
    });
  }

  // Get execution history
  async getExecutionHistory(
    workflowId: string,
    limit: number = 10
  ): Promise<ExecutionHistoryItem[]> {
    return this.request(`/flowspec/history/${workflowId}?limit=${limit}`);
  }

  // Update workflow
  async updateWorkflow(
    workflowId: string,
    flowspec: FlowSpec
  ): Promise<void> {
    return this.request(`/flowspec/update/${workflowId}`, {
      method: 'PUT',
      body: JSON.stringify(flowspec),
    });
  }

  // Delete workflow
  async deleteWorkflow(workflowId: string): Promise<void> {
    return this.request(`/flowspec/delete/${workflowId}`, {
      method: 'DELETE',
    });
  }

  // List workflows
  async listWorkflows(): Promise<any[]> {
    return this.request('/flowspec/list');
  }

  // AI-Powered Planning (CrewAI)
  async planWorkflowWithAI(
    goal: string,
    context?: Record<string, any>,
    constraints?: string[]
  ): Promise<{
    flowspec: FlowSpec;
    reasoning: string;
    estimated_complexity: string;
  }> {
    return this.request('/agents/plan', {
      method: 'POST',
      body: JSON.stringify({ goal, context, constraints }),
    });
  }

  // Plan and execute in one call
  async accomplishGoal(
    goal: string,
    context?: Record<string, any>
  ): Promise<FlowExecutionResult> {
    return this.request('/agents/accomplish', {
      method: 'POST',
      body: JSON.stringify({ goal, context }),
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request('/system/status');
  }
}

// Singleton with React cache for request deduplication
export const getLucidL2Client = cache(() => {
  return new LucidL2Client();
});
```

### 1.3 FlowSpec Converter

**Create: `src/lib/lucid-l2/converter.ts`**

```typescript
import type { Node, Edge } from 'reactflow';
import type { FlowSpec, FlowNode, FlowEdge, TriggerNode } from './types';

/**
 * Convert React Flow format to FlowSpec DSL
 * 
 * Storage: React Flow JSON (in Supabase)
 * Transport: FlowSpec DSL (to Lucid-L2)
 */
export function reactFlowToFlowSpec(
  workflowName: string,
  nodes: Node[],
  edges: Edge[],
  variables?: Record<string, any>
): FlowSpec {
  // Find trigger node (required)
  const triggerNode = nodes.find(n => 
    n.type === 'trigger' || 
    n.data?.nodeType === 'trigger'
  );

  if (!triggerNode) {
    throw new Error('Workflow must have a trigger node');
  }

  // Convert trigger
  const trigger: TriggerNode = {
    type: triggerNode.data?.triggerType || 'manual',
    config: triggerNode.data?.config || {},
  };

  // Convert nodes (exclude trigger)
  const flowNodes: FlowNode[] = nodes
    .filter(n => n.id !== triggerNode.id)
    .map(node => ({
      id: node.id,
      type: node.type || 'action',
      params: node.data?.parameters || node.data || {},
      position: node.position,
    }));

  // Convert edges
  const flowEdges: FlowEdge[] = edges.map(edge => ({
    from: edge.source,
    to: edge.target,
    condition: edge.data?.condition,
  }));

  return {
    name: workflowName,
    description: `Workflow created from LucidMerged`,
    trigger,
    nodes: flowNodes,
    edges: flowEdges,
    variables,
  };
}

/**
 * Convert FlowSpec DSL back to React Flow format
 * Used for displaying AI-generated workflows
 */
export function flowSpecToReactFlow(
  flowspec: FlowSpec
): { nodes: Node[]; edges: Edge[] } {
  // Convert trigger to node
  const triggerNode: Node = {
    id: 'trigger',
    type: 'trigger',
    position: { x: 100, y: 100 },
    data: {
      nodeType: 'trigger',
      triggerType: flowspec.trigger.type,
      config: flowspec.trigger.config,
    },
  };

  // Convert flow nodes
  const nodes: Node[] = [
    triggerNode,
    ...flowspec.nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      position: node.position || { 
        x: 250 + (index * 150), 
        y: 100 
      },
      data: {
        ...node.params,
        nodeType: node.type,
      },
    })),
  ];

  // Convert edges
  const edges: Edge[] = flowspec.edges.map((edge, index) => ({
    id: `e${index}`,
    source: edge.from,
    target: edge.to,
    data: edge.condition ? { condition: edge.condition } : undefined,
  }));

  return { nodes, edges };
}
```

### 1.4 Export Index

**Create: `src/lib/lucid-l2/index.ts`**

```typescript
// Server-side only exports
export { LucidL2Client, getLucidL2Client } from './client';
export { reactFlowToFlowSpec, flowSpecToReactFlow } from './converter';
export type * from './types';
```

---

## 🔌 Phase 2: API Routes (Production Pattern) (2-3 hours)

### 2.1 Save Workflow Route

**Update: `src/app/api/workflows/[id]/save/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { getLucidL2Client, reactFlowToFlowSpec } from '@/lib/lucid-l2';
import { isFeatureEnabled } from '@/lib/features';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 1. Centralized auth check
    const { userId } = await requireServerAuth();
    
    // 2. Centralized Supabase client
    const supabase = await createClient();

    // 3. Get workflow from database
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // 4. Permission check
    if (workflow.user_id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 5. Feature flag check
    if (!isFeatureEnabled('lucidL2Integration')) {
      return NextResponse.json(
        { error: 'Lucid-L2 integration is disabled' },
        { status: 503 }
      );
    }

    // 6. Convert React Flow to FlowSpec
    const flowspec = reactFlowToFlowSpec(
      workflow.name,
      workflow.nodes || [],
      workflow.edges || [],
      workflow.variables
    );

    // 7. Sync with Lucid-L2
    const lucidL2 = getLucidL2Client();
    let lucidL2WorkflowId = workflow.lucid_l2_workflow_id;
    let lucidL2Error: string | null = null;

    try {
      if (lucidL2WorkflowId) {
        // Update existing
        await lucidL2.updateWorkflow(lucidL2WorkflowId, flowspec);
      } else {
        // Create new
        const result = await lucidL2.createWorkflow(flowspec);
        lucidL2WorkflowId = result.workflowId;
      }
    } catch (error: any) {
      console.error('[save-workflow] Lucid-L2 error:', error);
      lucidL2Error = error.message;
      // Continue - don't block save if Lucid-L2 fails
    }

    // 8. Update database with sync status
    const { error: updateError } = await supabase
      .from('workflows')
      .update({
        lucid_l2_workflow_id: lucidL2WorkflowId,
        lucid_l2_synced_at: lucidL2Error ? null : new Date().toISOString(),
        lucid_l2_last_error: lucidL2Error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      workflowId: id,
      lucidL2WorkflowId,
      lucidL2Synced: !lucidL2Error,
      lucidL2Error,
      message: lucidL2Error 
        ? 'Workflow saved (Lucid-L2 sync failed)' 
        : 'Workflow saved and synced',
    });
  } catch (error: any) {
    console.error('[save-workflow] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save workflow' },
      { status: 500 }
    );
  }
}
```

### 2.2 Execute Workflow Route

**Update: `src/app/api/workflows/[id]/execute/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { getLucidL2Client } from '@/lib/lucid-l2';
import { isFeatureEnabled } from '@/lib/features';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { input } = body;

    // 1. Centralized auth
    const { userId } = await requireServerAuth();
    
    // 2. Centralized Supabase
    const supabase = await createClient();

    // 3. Get workflow
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // 4. Permission check
    if (workflow.user_id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 5. Feature flag check
    if (!isFeatureEnabled('flowSpecExecution')) {
      return NextResponse.json(
        { error: 'Workflow execution is disabled' },
        { status: 503 }
      );
    }

    // 6. Check if workflow is synced with Lucid-L2
    if (!workflow.lucid_l2_workflow_id) {
      return NextResponse.json(
        { 
          error: 'Workflow not deployed',
          message: 'Please save the workflow first to deploy it to Lucid-L2'
        },
        { status: 400 }
      );
    }

    // 7. Create execution record (pending)
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: id,
        status: 'pending',
        input,
      })
      .select()
      .single();

    if (execError || !execution) {
      throw new Error('Failed to create execution record');
    }

    // 8. Execute via Lucid-L2
    const lucidL2 = getLucidL2Client();
    
    try {
      const result = await lucidL2.executeWorkflow(
        workflow.lucid_l2_workflow_id,
        {
          tenantId: userId,
          variables: workflow.variables,
          input,
        }
      );

      // 9. Update execution record with Lucid-L2 execution ID
      await supabase
        .from('workflow_executions')
        .update({
          lucid_l2_execution_id: result.executionId,
          status: 'running',
        })
        .eq('id', execution.id);

      return NextResponse.json({
        success: true,
        executionId: execution.id,
        lucidL2ExecutionId: result.executionId,
        status: 'running',
        message: 'Workflow execution started',
      });
    } catch (error: any) {
      // Update execution record with error
      await supabase
        .from('workflow_executions')
        .update({
          status: 'error',
          error: error.message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', execution.id);

      throw error;
    }
  } catch (error: any) {
    console.error('[execute-workflow] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute workflow' },
      { status: 500 }
    );
  }
}
```

### 2.3 Get Execution Status Route

**Update: `src/app/api/workflows/[id]/executions/[executionId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { getLucidL2Client } from '@/lib/lucid-l2';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; executionId: string } }
) {
  try {
    const { id, executionId } = params;

    // 1. Centralized auth
    const { userId } = await requireServerAuth();
    
    // 2. Centralized Supabase
    const supabase = await createClient();

    // 3. Get execution
    const { data: execution, error: fetchError } = await supabase
      .from('workflow_executions')
      .select('*, workflows(*)')
      .eq('id', executionId)
      .eq('workflow_id', id)
      .single();

    if (fetchError || !execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // 4. Permission check
    if (execution.workflows.user_id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 5. If execution is still running, check Lucid-L2 for updates
    if (
      execution.status === 'running' && 
      execution.lucid_l2_execution_id &&
      execution.workflows.lucid_l2_workflow_id
    ) {
      try {
        const lucidL2 = getLucidL2Client();
        const history = await lucidL2.getExecutionHistory(
          execution.workflows.lucid_l2_workflow_id,
          50
        );

        // Find matching execution
        const lucidL2Execution = history.find((exec: any) => 
          exec.id === execution.lucid_l2_execution_id || 
          exec.executionId === execution.lucid_l2_execution_id
        );

        if (lucidL2Execution && lucidL2Execution.status !== 'running') {
          // Update our database
          const duration = lucidL2Execution.finishedAt 
            ? new Date(lucidL2Execution.finishedAt).getTime() - 
              new Date(execution.started_at).getTime()
            : null;

          await supabase
            .from('workflow_executions')
            .update({
              status: lucidL2Execution.status,
              output: lucidL2Execution.output,
              error: lucidL2Execution.error,
              finished_at: lucidL2Execution.finishedAt,
              duration_ms: duration,
              updated_at: new Date().toISOString(),
            })
            .eq('id', executionId);

          // Return updated data
          return NextResponse.json({
            id: execution.id,
            workflowId: id,
            status: lucidL2Execution.status,
            input: execution.input,
            output: lucidL2Execution.output,
            error: lucidL2Execution.error,
            startedAt: execution.started_at,
            finishedAt: lucidL2Execution.finishedAt,
            durationMs: duration,
          });
        }
      } catch (error) {
        console.error('[get-execution] Lucid-L2 sync error:', error);
        // Continue with database data if Lucid-L2 fails
      }
    }

    // 6. Return execution from database
    return NextResponse.json({
      id: execution.id,
      workflowId: id,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      error: execution.error,
      startedAt: execution.started_at,
      finishedAt: execution.finished_at,
      durationMs: execution.duration_ms,
    });
  } catch (error: any) {
    console.error('[get-execution] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get execution status' },
      { status: 500 }
    );
  }
}
```

---

## 🎨 Phase 3: Frontend Hook (Industry Standard) (1-2 hours)

### 3.1 Workflow Actions Hook

**Update: `src/hooks/use-workflow-actions.ts`**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useFeatureFlags } from '@/lib/features';

export function useWorkflowActions(workflowId: string) {
  const router = useRouter();
  const { toast } = useToast();
  const flags = useFeatureFlags();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Save workflow to Lucid-L2
   * Uses optimistic UI pattern
   */
  const saveWorkflow = useCallback(async () => {
    if (!flags.lucidL2Integration) {
      toast({
        title: 'Feature Disabled',
        description: 'Lucid-L2 integration is currently disabled',
        variant: 'destructive',
      });
      return;
    }

    try {
      setI
