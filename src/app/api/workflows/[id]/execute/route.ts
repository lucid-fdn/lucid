/**
 * Workflow Execute Endpoint
 * POST /api/workflows/:id/execute
 * 
 * Executes a workflow via Lucid-L2
 * Uses production patterns: requireServerAuth(), createClient(), isFeatureEnabled()
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { getLucidL2Client } from '@/lib/lucid-l2';
import { isFeatureEnabled } from '@/lib/features';
import { ErrorService } from '@/lib/errors/error-service';
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements';
import { incrementUsage } from '@/lib/plans';
import { checkWorkflowAccess } from '@/lib/workflows/access';
import { summarizeError } from '@/lib/logging/safe-log';

export const dynamic = 'force-dynamic'

type WorkflowVariableRow = {
  key: string
  value: string | null
  type: string | null
}

function coerceWorkflowVariableValue(row: WorkflowVariableRow): unknown {
  const value = row.value ?? ''
  switch (row.type) {
    case 'number': {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : value
    }
    case 'boolean':
      return value === 'true' || value === '1'
    default:
      return value
  }
}

async function loadWorkflowVariables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workflowId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('workflow_variables')
    .select('key, value, type')
    .eq('workflow_id', workflowId)

  if (error) throw error

  return (data ?? []).reduce<Record<string, unknown>>((variables, row) => {
    if (typeof row.key === 'string' && row.key.length > 0) {
      variables[row.key] = coerceWorkflowVariableValue(row as WorkflowVariableRow)
    }
    return variables
  }, {})
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const workflowId = (await params).id;
    const body = await request.json();
    const { input } = body;

    // 1. Centralized auth check
    const { userId } = await requireServerAuth();
    
    // 2. Centralized Supabase client
    const supabase = await createClient();

    // 3. Feature flag check
    if (!isFeatureEnabled('flowSpecExecution')) {
      return NextResponse.json(
        { error: 'Workflow execution is disabled' },
        { status: 503 }
      );
    }

    // 4. Load workflow from database
    const { data: workflow, error: dbError } = await supabase
      .from('workflows')
      .select('id, user_id, organization_id, name, nodes, edges, settings, pin_data, status, lucid_l2_workflow_id')
      .eq('id', workflowId)
      .single();

    if (dbError || !workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // 5. Check user has edit/execute access
    const access = await checkWorkflowAccess(supabase, workflowId, userId, true);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    // 5b. Track AI query usage (workflow execution consumes AI quota)
    if (workflow.organization_id) {
      const entitlement = await evaluateEntitlement({ orgId: workflow.organization_id, action: 'ai_query' });
      const entitlementGuard = guardEntitlement(entitlement, { orgId: workflow.organization_id, route: '/api/workflows/[id]/execute' });
      if (entitlementGuard) return entitlementGuard;
      // Charging model: "accepted request consumes quota".
      // Use client-supplied idempotency header if present, else fall back to UUID.
      const idemKey = request.headers.get('x-idempotency-key') || crypto.randomUUID();
      incrementUsage(workflow.organization_id, 'ai_queries_monthly', 1, `wf:${workflow.organization_id}:${idemKey}`).catch(() => {});
    }

    // 6. Check if workflow is deployed to Lucid-L2
    if (!workflow.lucid_l2_workflow_id) {
      return NextResponse.json(
        {
          error: 'Workflow not deployed',
          message: 'Please save the workflow first to deploy it to Lucid-L2',
        },
        { status: 400 }
      );
    }

    // 7. Create execution record (pending)
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: workflowId,
        status: 'running',
        mode: 'manual',
        execution_data: { input: input ?? null },
        triggered_by: userId,
        started_at: new Date().toISOString(),
      })
      .select('id, workflow_id, status, started_at, created_at')
      .single();

    if (execError || !execution) {
      throw new Error('Failed to create execution record');
    }

    // 8. Execute via Lucid-L2
    const lucidL2 = getLucidL2Client();
    const variables = await loadWorkflowVariables(supabase, workflowId)
    
    try {
      const result = await lucidL2.executeWorkflow(
        workflow.lucid_l2_workflow_id,
        {
          tenantId: userId,
          variables,
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
        startedAt: execution.started_at,
        message: 'Workflow execution started',
      });
    } catch (error: unknown) {
      // Update execution record with error
      await supabase
        .from('workflow_executions')
        .update({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - new Date(execution.started_at).getTime(),
        })
        .eq('id', execution.id);

      ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/execute/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });

      throw error;
    }
  } catch (error: unknown) {
    console.error('[execute-workflow] Error:', summarizeError(error));

    return NextResponse.json(
      {
        error: 'Failed to execute workflow',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
