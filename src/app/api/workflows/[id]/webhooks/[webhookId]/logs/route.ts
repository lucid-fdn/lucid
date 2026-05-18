import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

/**
 * GET /api/workflows/[id]/webhooks/[webhookId]/logs
 * Get webhook execution logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, webhookId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, false);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const { data: webhook, error: webhookError } = await supabase
      .from('workflow_webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('workflow_id', workflowId)
      .single();

    if (webhookError || !webhook) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Get logs for this webhook
    const { data: logs, error } = await supabase
      .from('webhook_logs')
      .select('id, webhook_id, workflow_execution_id, request_method, request_headers, request_body, request_query, response_status, response_body, error, ip_address, user_agent, execution_time_ms, executed_at')
      .eq('webhook_id', webhookId)
      .order('executed_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[webhook-logs] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: logs || [],
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/logs/route.ts',
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
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
      },
      { status: 500 }
    );
  }
}
