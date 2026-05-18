/**
 * Execution Status Endpoint
 * GET /api/workflows/:id/executions/:executionId
 * 
 * Returns execution status and results from Lucid-L2
 * Uses production patterns: requireServerAuth(), createClient()
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { getLucidL2Client } from '@/lib/lucid-l2';
import type { ExecutionHistoryItem } from '@/lib/lucid-l2/types';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  try {
    const { id: workflowId, executionId } = await params;

    // 1. Centralized auth check
    const { userId } = await requireServerAuth();
    
    // 2. Centralized Supabase client
    const supabase = await createClient();

    // 3. Load execution from database
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .select('*, workflows(user_id, organization_id, lucid_l2_workflow_id)')
      .eq('id', executionId)
      .eq('workflow_id', workflowId)
      .single();

    if (execError || !execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // 4. Check user has access
    if (execution.workflows.user_id === userId) {
      // User owns this workflow directly
    } else if (execution.workflows.organization_id) {
      // Check organization membership
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', execution.workflows.organization_id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // 5. If execution is still running, poll Lucid-L2 for latest status
    if (
      (execution.status === 'running' || execution.status === 'pending') && 
      execution.lucid_l2_execution_id &&
      execution.workflows.lucid_l2_workflow_id
    ) {
      try {
        const lucidL2 = getLucidL2Client();
        const history = await lucidL2.getExecutionHistory(
          execution.workflows.lucid_l2_workflow_id,
          50
        );

        // Find matching execution in history
        const lucidL2Execution = history.find((exec: ExecutionHistoryItem) =>
          exec.id === execution.lucid_l2_execution_id ||
          exec.executionId === execution.lucid_l2_execution_id
        );

        if (lucidL2Execution && lucidL2Execution.status !== 'running') {
          // Execution finished - update our database
          const finishedAt = lucidL2Execution.finishedAt 
            ? new Date(lucidL2Execution.finishedAt).toISOString()
            : new Date().toISOString();

          const duration = lucidL2Execution.finishedAt 
            ? new Date(lucidL2Execution.finishedAt).getTime() - 
              new Date(execution.started_at).getTime()
            : null;

          await supabase
            .from('workflow_executions')
            .update({
              status: lucidL2Execution.status,
              output: lucidL2Execution.output || null,
              error: lucidL2Execution.error || null,
              finished_at: finishedAt,
              duration_ms: duration,
              updated_at: new Date().toISOString(),
            })
            .eq('id', executionId);

          // Return updated data
          return NextResponse.json({
            id: execution.id,
            workflowId: execution.workflow_id,
            lucidL2ExecutionId: execution.lucid_l2_execution_id,
            status: lucidL2Execution.status,
            input: execution.input,
            output: lucidL2Execution.output,
            error: lucidL2Execution.error,
            startedAt: execution.started_at,
            finishedAt: finishedAt,
            durationMs: duration,
          });
        }
      } catch (error: unknown) {
        ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/executions/:executionId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
        // Continue with database data if Lucid-L2 fails
      }
    }

    // 6. Return execution data from database
    return NextResponse.json({
      id: execution.id,
      workflowId: execution.workflow_id,
      lucidL2ExecutionId: execution.lucid_l2_execution_id,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      error: execution.error,
      startedAt: execution.started_at,
      finishedAt: execution.finished_at,
      durationMs: execution.duration_ms,
    });
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/executions/:executionId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });

    return NextResponse.json(
      {
        error: 'Failed to get execution status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
