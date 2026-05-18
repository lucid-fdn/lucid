import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

const WEBHOOK_SELECT = 'id, workflow_id, path, method, api_key, enabled, description, success_count, error_count, last_triggered_at, last_success_at, last_error_at, created_at, updated_at'

function redactWebhookSecret<T extends { api_key?: string | null }>(webhook: T): Omit<T, 'api_key'> & { api_key_preview: string | null } {
  const apiKey = typeof webhook.api_key === 'string' ? webhook.api_key : null
  const { api_key: _apiKey, ...rest } = webhook
  return {
    ...rest,
    api_key_preview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null,
  }
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/workflows/[id]/webhooks - List webhooks for a workflow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId } = await params;
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, false);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Get webhooks for this workflow
    const { data: webhooks, error } = await supabase
      .from('workflow_webhooks')
      .select(WEBHOOK_SELECT)
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[webhooks] Error fetching webhooks:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch webhooks' },
        { status: 500 }
      );
    }

    // Add full URL to each webhook
    const baseUrl = request.nextUrl.origin;
    const webhooksWithUrl = (webhooks || []).map(webhook => ({
      ...redactWebhookSecret(webhook),
      url: `${baseUrl}/api/webhooks/${webhook.path}`,
    }));

    return NextResponse.json({
      success: true,
      data: webhooksWithUrl,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/route.ts',
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

// POST /api/workflows/[id]/webhooks - Create a new webhook
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId } = await params;
    const body = await request.json();
    const supabase = getSupabase();

    const access = await checkWorkflowAccess(supabase, workflowId, user.id, true);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Generate unique path and API key using database functions
    const { data: pathData } = await supabase
      .rpc('generate_webhook_path');
    
    const { data: apiKeyData } = await supabase
      .rpc('generate_webhook_api_key');

    const path = pathData;
    const apiKey = apiKeyData;

    // Create webhook
    const { data: webhook, error: createError } = await supabase
      .from('workflow_webhooks')
      .insert({
        workflow_id: workflowId,
        path,
        api_key: apiKey,
        method: body.method || 'POST',
        description: body.description || null,
        enabled: body.enabled !== undefined ? body.enabled : true,
      })
      .select(WEBHOOK_SELECT)
      .single();

    if (createError) {
      console.error('[webhooks] Error creating webhook:', createError);
      return NextResponse.json(
        { success: false, error: 'Failed to create webhook' },
        { status: 500 }
      );
    }

    // Return webhook with full URL
    const baseUrl = request.nextUrl.origin;
    const webhookUrl = `${baseUrl}/api/webhooks/${path}`;

    return NextResponse.json({
      success: true,
      data: {
        ...webhook,
        url: webhookUrl,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/webhooks/route.ts',
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
