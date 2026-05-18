import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated user (will throw if not authenticated)
    const { user } = await requireServerAuth();
    
    // Await params (Next.js 15 requirement)
    const { id: workflowId } = await params;
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, false);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Fetch executions
    const { data: executions, error: executionsError } = await supabase
      .from('workflow_executions')
      .select('id, workflow_id, status, mode, started_at, completed_at, duration_ms, error, error_message, result, execution_data, triggered_by, created_at')
      .eq('workflow_id', workflowId)
      .order('started_at', { ascending: false })
      .limit(20); // Last 20 executions

    if (executionsError) {
      console.error('[executions-api] Error fetching executions:', executionsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch executions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: executions || [],
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/executions/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
