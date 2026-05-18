import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

/**
 * GET /api/workflows/[id]/variables
 * List all variables for a workflow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId } = await params;

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

    // Get variables for this workflow
    const { data: variables, error } = await supabase
      .from('workflow_variables')
      .select('id, workflow_id, key, value, type, is_secret, description, created_at, updated_at, created_by')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[variables] Error fetching variables:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch variables' },
        { status: 500 }
      );
    }

    // Mask secret values
    const maskedVariables = variables?.map(v => ({
      ...v,
      value: v.is_secret ? '••••••••' : v.value
    })) || [];

    return NextResponse.json({
      success: true,
      data: maskedVariables,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/variables/route.ts',
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

/**
 * POST /api/workflows/[id]/variables
 * Create a new variable
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId } = await params;
    const body = await request.json();

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

    // Check if variable key already exists
    const { data: existing } = await supabase
      .from('workflow_variables')
      .select('id')
      .eq('workflow_id', workflowId)
      .eq('key', body.key)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A variable with this name already exists' },
        { status: 400 }
      );
    }

    // Create variable
    const { data: variable, error: createError } = await supabase
      .from('workflow_variables')
      .insert({
        workflow_id: workflowId,
        key: body.key,
        value: body.value,
        type: body.type || 'string',
        description: body.description || null,
        created_by: user.id,
      })
      .select('id, workflow_id, key, value, type, is_secret, description, created_at, updated_at, created_by')
      .single();

    if (createError) {
      console.error('[variables] Error creating variable:', createError);
      return NextResponse.json(
        { success: false, error: 'Failed to create variable' },
        { status: 500 }
      );
    }

    // Mask secret value in response
    const maskedVariable = {
      ...variable,
      value: variable.is_secret ? '••••••••' : variable.value
    };

    return NextResponse.json({
      success: true,
      data: maskedVariable,
      message: 'Variable created successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/variables/route.ts',
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
