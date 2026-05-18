import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

const WEBHOOK_SELECT = 'id, workflow_id, path, method, api_key, enabled, description, success_count, error_count, last_triggered_at, last_success_at, last_error_at, created_at, updated_at'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function redactWebhookSecret<T extends { api_key?: string | null }>(webhook: T): Omit<T, 'api_key'> & { api_key_preview: string | null } {
  const apiKey = typeof webhook.api_key === 'string' ? webhook.api_key : null
  const { api_key: _apiKey, ...rest } = webhook
  return {
    ...rest,
    api_key_preview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null,
  }
}

// GET /api/workflows/[id]/webhooks/[webhookId] - Get webhook details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, webhookId } = await params;
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, false);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const { data: webhook, error } = await supabase
      .from('workflow_webhooks')
      .select(WEBHOOK_SELECT)
      .eq('id', webhookId)
      .eq('workflow_id', workflowId)
      .single();

    if (error || !webhook) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Add full URL
    const baseUrl = request.nextUrl.origin;
    const webhookUrl = `${baseUrl}/api/webhooks/${webhook.path}`;

    return NextResponse.json({
      success: true,
      data: {
        ...redactWebhookSecret(webhook),
        url: webhookUrl,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/workflows/[id]/webhooks/[webhookId] - Update webhook
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, webhookId } = await params;
    const body = await request.json();
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, true);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Verify webhook exists
    const { data: existing, error: fetchError } = await supabase
      .from('workflow_webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('workflow_id', workflowId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Update webhook (only allow specific fields)
    const updates: Record<string, unknown> = {};
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.method !== undefined) updates.method = body.method;
    if (body.description !== undefined) updates.description = body.description;

    const { data: webhook, error: updateError } = await supabase
      .from('workflow_webhooks')
      .update(updates)
      .eq('id', webhookId)
      .eq('workflow_id', workflowId)
      .select(WEBHOOK_SELECT)
      .single();

    if (updateError) {
      console.error('[webhook] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update webhook' },
        { status: 500 }
      );
    }

    // Add full URL
    const baseUrl = request.nextUrl.origin;
    const webhookUrl = `${baseUrl}/api/webhooks/${webhook.path}`;

    return NextResponse.json({
      success: true,
      data: {
        ...redactWebhookSecret(webhook),
        url: webhookUrl,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/workflows/[id]/webhooks/[webhookId] - Delete webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, webhookId } = await params;
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, true);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Delete webhook (logs will be cascade deleted)
    const { error } = await supabase
      .from('workflow_webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('workflow_id', workflowId);

    if (error) {
      console.error('[webhook] Delete error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete webhook' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/workflows/[id]/webhooks/[webhookId]/regenerate - Regenerate API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; webhookId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, webhookId } = await params;
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, true);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Generate new API key
    const { data: apiKeyData } = await supabase
      .rpc('generate_webhook_api_key');

    const apiKey = apiKeyData;

    // Update webhook with new API key
    const { data: webhook, error: updateError } = await supabase
      .from('workflow_webhooks')
      .update({ api_key: apiKey })
      .eq('id', webhookId)
      .eq('workflow_id', workflowId)
      .select(WEBHOOK_SELECT)
      .single();

    if (updateError) {
      console.error('[webhook] Regenerate error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to regenerate API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/:webhookId/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
