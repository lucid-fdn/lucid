import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SENSITIVE_HEADER_PATTERN = /authorization|api[-_]?key|cookie|csrf|jwt|secret|session|token/i

function serializeFormValue(value: FormDataEntryValue): unknown {
  if (typeof value === 'string') return value
  return {
    file: true,
    name: value.name,
    type: value.type,
    size: value.size,
  }
}

function sanitizePayload<T extends Record<string, unknown> | null>(payload: T): T {
  if (!payload) return payload
  return redactLogMetadata(payload)
}

function sanitizeQuery(query: Record<string, string>): Record<string, string> {
  return redactLogMetadata(query)
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const safeHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (SENSITIVE_HEADER_PATTERN.test(key)) return
    safeHeaders[key] = value;
  });
  return redactLogMetadata(safeHeaders);
}

// Public webhook endpoint - ALL methods
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhook(request, params, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhook(request, params, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhook(request, params, 'PUT');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhook(request, params, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhook(request, params, 'DELETE');
}

async function handleWebhook(
  request: NextRequest,
  params: Promise<{ path: string }>,
  method: string
) {
  const startTime = Date.now();
  let webhookId: string | null = null;
  let workflowExecutionId: string | null = null;

  try {
    const { path } = await params;

    // Get client info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Parse request data
    let requestBody: Record<string, unknown> | null = null;
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      try {
        requestBody = await request.json() as Record<string, unknown>;
      } catch (_e) {
        requestBody = null;
      }
    } else if (contentType?.includes('application/x-www-form-urlencoded') ||
               contentType?.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        requestBody = Object.fromEntries(
          Array.from(formData.entries()).map(([key, value]) => [key, serializeFormValue(value)]),
        ) as Record<string, unknown>;
      } catch (_e) {
        requestBody = null;
      }
    }

    const requestQuery: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      requestQuery[key] = value;
    });

    const requestHeaders = sanitizeHeaders(request.headers);
    const safeRequestBody = sanitizePayload(requestBody);
    const safeRequestQuery = sanitizeQuery(requestQuery);

    // Find webhook by path
    const { data: webhook, error: webhookError } = await getSupabase()
      .from('workflow_webhooks')
      .select('id, workflow_id, path, method, api_key, enabled')
      .eq('path', path)
      .eq('enabled', true)
      .single();

    if (webhookError || !webhook) {
      await logWebhookCall(
        null,
        null,
        method,
        requestHeaders,
        safeRequestBody,
        safeRequestQuery,
        404,
        { error: 'Webhook not found' },
        'Webhook not found or disabled',
        ipAddress,
        userAgent,
        Date.now() - startTime
      );

      return NextResponse.json(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    webhookId = webhook.id;

    // Check if method matches
    if (webhook.method !== method) {
      await logWebhookCall(
        webhookId,
        null,
        method,
        requestHeaders,
        safeRequestBody,
        safeRequestQuery,
        405,
        { error: 'Method not allowed' },
        `Expected ${webhook.method}, got ${method}`,
        ipAddress,
        userAgent,
        Date.now() - startTime
      );

      return NextResponse.json(
        { success: false, error: `Method not allowed. Use ${webhook.method}` },
        { status: 405 }
      );
    }

    // Verify API key
    const providedApiKey = request.headers.get('x-api-key') || 
                          request.headers.get('authorization')?.replace('Bearer ', '');

    if (!providedApiKey || providedApiKey !== webhook.api_key) {
      await logWebhookCall(
        webhookId,
        null,
        method,
        requestHeaders,
        safeRequestBody,
        safeRequestQuery,
        401,
        { error: 'Unauthorized' },
        'Invalid or missing API key',
        ipAddress,
        userAgent,
        Date.now() - startTime
      );

      return NextResponse.json(
        { success: false, error: 'Unauthorized. Provide valid API key in X-API-Key header' },
        { status: 401 }
      );
    }

    // Get workflow
    const { data: workflow, error: workflowError } = await getSupabase()
      .from('workflows')
      .select('id, user_id, organization_id, name, status, active')
      .eq('id', webhook.workflow_id)
      .single();

    if (workflowError || !workflow) {
      await logWebhookCall(
        webhookId,
        null,
        method,
        requestHeaders,
        safeRequestBody,
        safeRequestQuery,
        404,
        { error: 'Workflow not found' },
        'Associated workflow not found',
        ipAddress,
        userAgent,
        Date.now() - startTime
      );

      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // Create workflow execution
    const { data: execution, error: executionError } = await getSupabase()
      .from('workflow_executions')
      .insert({
        workflow_id: workflow.id,
        status: 'running',
        mode: 'webhook',
        started_at: new Date().toISOString(),
      })
      .select('id, workflow_id, status, mode, started_at, created_at')
      .single();

    if (executionError || !execution) {
      ErrorService.captureException(executionError, {
      severity: 'error',
      context: {
        endpoint: '/webhooks/:path/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
      
      await logWebhookCall(
        webhookId,
        null,
        method,
        requestHeaders,
        safeRequestBody,
        safeRequestQuery,
        500,
        { error: 'Failed to start execution' },
        executionError ? summarizeError(executionError).message : 'Unknown error',
        ipAddress,
        userAgent,
        Date.now() - startTime
      );

      return NextResponse.json(
        { success: false, error: 'Failed to start workflow execution' },
        { status: 500 }
      );
    }

    workflowExecutionId = execution.id;

    // Log successful webhook call
    await logWebhookCall(
      webhookId,
      workflowExecutionId,
      method,
      requestHeaders,
      safeRequestBody,
      safeRequestQuery,
      202,
      { message: 'Workflow execution started', executionId: workflowExecutionId },
      null,
      ipAddress,
      userAgent,
      Date.now() - startTime
    );

    // Return immediate response (workflow runs async)
    return NextResponse.json({
      success: true,
      message: 'Workflow execution started',
      executionId: workflowExecutionId,
      data: {
        method,
        path,
        acceptedAt: new Date().toISOString(),
      }
    }, { status: 202 });

  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/webhooks/:path/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    await logWebhookCall(
      webhookId,
      workflowExecutionId,
      method,
      {},
      null,
      {},
      500,
      { error: 'Internal server error' },
      summarizeError(error).message,
      'unknown',
      'unknown',
      Date.now() - startTime
    );

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function logWebhookCall(
  webhookId: string | null,
  workflowExecutionId: string | null,
  method: string,
  headers: Record<string, string>,
  body: Record<string, unknown> | null,
  query: Record<string, string>,
  status: number,
  response: Record<string, unknown>,
  error: string | null,
  ipAddress: string,
  userAgent: string,
  executionTimeMs: number
) {
  try {
    if (!webhookId) return; // Can't log without webhook ID

    const safeHeaders = redactLogMetadata(headers);
    const safeBody = sanitizePayload(body);
    const safeQuery = sanitizeQuery(query);
    const safeResponse = redactLogMetadata(response);
    const safeError = error ? summarizeError(error).message : null;

    await getSupabase()
      .from('webhook_logs')
      .insert({
        webhook_id: webhookId,
        workflow_execution_id: workflowExecutionId,
        request_method: method,
        request_headers: safeHeaders,
        request_body: safeBody,
        request_query: safeQuery,
        response_status: status,
        response_body: safeResponse,
        error: safeError,
        ip_address: ipAddress,
        user_agent: userAgent,
        execution_time_ms: executionTimeMs,
      });
  } catch (logError) {
    console.error('[webhook] Failed to log webhook call:', summarizeError(logError));
  }
}
