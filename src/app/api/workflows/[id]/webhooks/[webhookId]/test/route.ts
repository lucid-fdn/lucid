import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';
import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log';

export const dynamic = 'force-dynamic'

function sanitizeWebhookTestPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { value: payload == null ? null : String(payload) }
  }
  return redactLogMetadata(payload as Record<string, unknown>)
}

/**
 * POST /api/workflows/[id]/webhooks/[webhookId]/test
 * Send a test request to the webhook
 */
export async function POST(
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

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, true);
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

    // Get test payload from request body (optional)
    const body = await request.json().catch(() => ({}));
    const testPayload = body.payload || {
      test: true,
      message: 'This is a test webhook request',
      timestamp: new Date().toISOString(),
    };
    const safeTestPayload = sanitizeWebhookTestPayload(testPayload)

    // Build webhook URL
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/${webhook.path}`;

    // Send test request
    const startTime = Date.now();
    let response;
    let error = null;

    try {
      response = await fetch(webhookUrl, {
        method: webhook.method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': webhook.api_key,
          'User-Agent': 'Lucid-Webhook-Test/1.0',
        },
        body: webhook.method !== 'GET' ? JSON.stringify(testPayload) : undefined,
      });

      const executionTime = Date.now() - startTime;
      const responseData = await response.json().catch(() => ({}));

      // Log the test request
      await supabase.from('webhook_logs').insert({
        webhook_id: webhook.id,
        request_method: webhook.method,
        request_headers: { 'X-Test': 'true' },
        request_body: safeTestPayload,
        response_status: response.status,
        response_body: sanitizeWebhookTestPayload(responseData),
        execution_time_ms: executionTime,
        ip_address: '127.0.0.1',
        user_agent: 'Lucid-Webhook-Test/1.0',
      });

      // Update webhook stats
      if (response.ok) {
        await supabase
          .from('workflow_webhooks')
          .update({
            success_count: webhook.success_count + 1,
            last_triggered_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
          })
          .eq('id', webhook.id);
      } else {
        await supabase
          .from('workflow_webhooks')
          .update({
            error_count: webhook.error_count + 1,
            last_triggered_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
          })
          .eq('id', webhook.id);
      }

      return NextResponse.json({
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          executionTime,
          response: sanitizeWebhookTestPayload(responseData),
        },
      });
    } catch (err) {
      error = summarizeError(err).message;

      // Log the error
      await supabase.from('webhook_logs').insert({
        webhook_id: webhook.id,
        request_method: webhook.method,
        request_headers: { 'X-Test': 'true' },
        request_body: safeTestPayload,
        response_status: 0,
        error,
        execution_time_ms: Date.now() - startTime,
        ip_address: '127.0.0.1',
        user_agent: 'Lucid-Webhook-Test/1.0',
      });

      // Update error count
      await supabase
        .from('workflow_webhooks')
        .update({
          error_count: webhook.error_count + 1,
          last_triggered_at: new Date().toISOString(),
          last_error_at: new Date().toISOString(),
        })
        .eq('id', webhook.id);

      return NextResponse.json({
        success: false,
        error: `Test failed: ${error}`,
      });
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/test/route.ts',
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
        error: error instanceof Error ? summarizeError(error).message : 'Failed to test webhook',
      },
      { status: 500 }
    );
  }
}
