import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

/**
 * GET /api/workflows/[id]/variables/[variableId]
 * Get a specific variable (with unmasked value for editing)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, variableId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // The single-variable endpoint returns the raw value for editing. Secrets
    // must therefore require edit access rather than the broader viewSettings
    // permission used by the list endpoint, which returns masked values.
    const access = await checkWorkflowAccess(supabase, workflowId, user.id, true);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const { data: variable, error } = await supabase
      .from('workflow_variables')
      .select('id, workflow_id, key, value, type, is_secret, description, created_at, updated_at, created_by')
      .eq('id', variableId)
      .eq('workflow_id', workflowId)
      .single();

    if (error || !variable) {
      return NextResponse.json(
        { success: false, error: 'Variable not found' },
        { status: 404 }
      );
    }

    // Return unmasked value for editing
    return NextResponse.json({
      success: true,
      data: variable,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/variables/:variableId/route.ts',
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
 * PATCH /api/workflows/[id]/variables/[variableId]
 * Update a variable
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, variableId } = await params;
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

    // Update variable
    const { data: variable, error: updateError } = await supabase
      .from('workflow_variables')
      .update(body)
      .eq('id', variableId)
      .eq('workflow_id', workflowId)
      .select('id, workflow_id, key, value, type, is_secret, description, created_at, updated_at, created_by')
      .single();

    if (updateError) {
      console.error('[variable] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update variable' },
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
      message: 'Variable updated successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/variables/:variableId/route.ts',
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
 * DELETE /api/workflows/[id]/variables/[variableId]
 * Delete a variable
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  try {
    const { user } = await requireServerAuth();
    const { id: workflowId, variableId } = await params;

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

    const { error } = await supabase
      .from('workflow_variables')
      .delete()
      .eq('id', variableId)
      .eq('workflow_id', workflowId);

    if (error) {
      console.error('[variable] Delete error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete variable' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Variable deleted successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/variables/:variableId/route.ts',
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
