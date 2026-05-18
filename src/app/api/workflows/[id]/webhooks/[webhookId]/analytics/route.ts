import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

/**
 * GET /api/workflows/[id]/webhooks/[webhookId]/analytics
 * Get webhook analytics and statistics
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

    // Get webhook details
    const { data: webhook, error: webhookError } = await supabase
      .from('workflow_webhooks')
      .select('id, workflow_id, path, method, api_key, enabled, description, success_count, error_count, last_triggered_at, last_success_at, last_error_at, created_at, updated_at')
      .eq('id', webhookId)
      .eq('workflow_id', workflowId)
      .single();

    if (webhookError || !webhook) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Get time period from query params (default: last 7 days)
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7');
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all logs for the period
    const { data: logs, error: logsError } = await supabase
      .from('webhook_logs')
      .select('id, webhook_id, workflow_execution_id, request_method, request_headers, request_body, request_query, response_status, response_body, error, ip_address, user_agent, execution_time_ms, executed_at')
      .eq('webhook_id', webhookId)
      .gte('executed_at', since.toISOString())
      .order('executed_at', { ascending: false });

    if (logsError) {
      throw logsError;
    }

    // Calculate statistics
    const totalCalls = logs?.length || 0;
    const successCalls = logs?.filter(log => log.response_status >= 200 && log.response_status < 300).length || 0;
    const errorCalls = logs?.filter(log => log.error || log.response_status >= 400).length || 0;
    const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;

    // Calculate average response time
    const executionTimes = logs?.map(log => log.execution_time_ms).filter(t => t !== null) || [];
    const avgResponseTime = executionTimes.length > 0
      ? Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length)
      : 0;

    // Calculate min/max response times
    const minResponseTime = executionTimes.length > 0 ? Math.min(...executionTimes) : 0;
    const maxResponseTime = executionTimes.length > 0 ? Math.max(...executionTimes) : 0;

    // Group by day for time series data
    const callsByDay: Record<string, { success: number; error: number }> = {};
    logs?.forEach(log => {
      const day = new Date(log.executed_at).toISOString().split('T')[0];
      if (!callsByDay[day]) {
        callsByDay[day] = { success: 0, error: 0 };
      }
      if (log.error || log.response_status >= 400) {
        callsByDay[day].error++;
      } else if (log.response_status >= 200 && log.response_status < 300) {
        callsByDay[day].success++;
      }
    });

    // Convert to array format
    const timeSeriesData = Object.entries(callsByDay).map(([date, counts]) => ({
      date,
      success: counts.success,
      error: counts.error,
      total: counts.success + counts.error,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Status code distribution
    const statusCodes: Record<number, number> = {};
    logs?.forEach(log => {
      if (log.response_status) {
        statusCodes[log.response_status] = (statusCodes[log.response_status] || 0) + 1;
      }
    });

    // Error types
    const errorTypes: Record<string, number> = {};
    logs?.filter(log => log.error).forEach(log => {
      const errorType = log.error?.split(':')[0] || 'Unknown';
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });

    // Calculate health status
    let healthStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    if (successRate < 50) {
      healthStatus = 'error';
    } else if (successRate < 90) {
      healthStatus = 'warning';
    }

    // Recent activity
    const recentLogs = logs?.slice(0, 10).map(log => ({
      id: log.id,
      executed_at: log.executed_at,
      status: log.response_status,
      execution_time: log.execution_time_ms,
      success: !log.error && log.response_status >= 200 && log.response_status < 300,
    }));

    return NextResponse.json({
      success: true,
      data: {
        // Overview stats
        overview: {
          totalCalls,
          successCalls,
          errorCalls,
          successRate,
          healthStatus,
        },
        // Performance metrics
        performance: {
          avgResponseTime,
          minResponseTime,
          maxResponseTime,
        },
        // Webhook metadata
        webhook: {
          id: webhook.id,
          method: webhook.method,
          enabled: webhook.enabled,
          created_at: webhook.created_at,
          last_triggered_at: webhook.last_triggered_at,
          last_success_at: webhook.last_success_at,
          last_error_at: webhook.last_error_at,
        },
        // Time series data
        timeSeries: timeSeriesData,
        // Status code distribution
        statusCodes: Object.entries(statusCodes).map(([code, count]) => ({
          code: parseInt(code),
          count,
        })),
        // Error types
        errorTypes: Object.entries(errorTypes).map(([type, count]) => ({
          type,
          count,
        })),
        // Recent activity
        recentActivity: recentLogs,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/analytics/route.ts',
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
        error: error instanceof Error ? error.message : 'Failed to get analytics',
      },
      { status: 500 }
    );
  }
}
