import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireUserId } from '@/lib/auth/server-utils';
import { canPerformAction } from '@/lib/access-control/server';
import { withCSRF } from '@/lib/auth/csrf';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ============================================================================
// Validation Schemas
// ============================================================================

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  pin_data: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  active: z.boolean().optional(),
});

const WORKFLOW_SELECT = 'id, user_id, organization_id, name, description, nodes, edges, settings, pin_data, status, active, tags, published_at, version, version_id, created_at, updated_at, lucid_l2_workflow_id, lucid_l2_synced_at, lucid_l2_last_error'

// ============================================================================
// Helper: Check workflow ownership
// ============================================================================

async function checkWorkflowAccess(
  workflowId: string,
  userId: string,
  requireEdit: boolean = false
): Promise<{ allowed: boolean; workflow?: Record<string, unknown>; error?: string }> {
  const supabase = getSupabase()
  // Fetch workflow
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select(WORKFLOW_SELECT)
    .eq('id', workflowId)
    .single();

  if (error || !workflow) {
    return { allowed: false, error: 'Workflow not found' };
  }

  // Check if user is owner
  if (workflow.user_id === userId) {
    return { allowed: true, workflow };
  }

  // Check org permissions if workflow belongs to org
  if (workflow.organization_id) {
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', workflow.organization_id)
      .maybeSingle()

    if (membershipError || !membership) {
      return { allowed: false, error: 'Forbidden: No access to this workflow' };
    }

    const permission = requireEdit ? 'editProjects' : 'viewSettings';
    const canAccess = await canPerformAction(
      userId,
      workflow.organization_id,
      permission
    );
    if (canAccess) {
      return { allowed: true, workflow };
    }
  }

  return { allowed: false, error: 'Forbidden: No access to this workflow' };
}

// ============================================================================
// GET /api/workflows/[id] - Get workflow by ID
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id: workflowId } = await params;

    // Validate UUID
    if (!z.string().uuid().safeParse(workflowId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow ID' },
        { status: 400 }
      );
    }

    // Check access
    const { allowed, workflow, error } = await checkWorkflowAccess(
      workflowId,
      userId,
      false
    );

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: error || 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch execution stats
    const { data: stats } = await getSupabase().rpc('get_workflow_stats', {
      workflow_uuid: workflowId,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...workflow,
        stats: stats?.[0] || null,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/route.ts',
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
        error: error instanceof Error ? error.message : 'Failed to fetch workflow',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT /api/workflows/[id] - Update workflow
// ============================================================================

export const PUT = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const userId = await requireUserId();
    const { id: workflowId } = (await ctx.params);
    const body = await req.json();
    const data = UpdateWorkflowSchema.parse(body);

    // Validate UUID
    if (!z.string().uuid().safeParse(workflowId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow ID' },
        { status: 400 }
      );
    }

    // Check access
    const { allowed, error } = await checkWorkflowAccess(
      workflowId,
      userId,
      true // Require edit permission
    );

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: error || 'Access denied' },
        { status: 403 }
      );
    }

    // Update workflow
    const { data: workflow, error: updateError } = await getSupabase()
      .from('workflows')
      .update(data)
      .eq('id', workflowId)
      .select(WORKFLOW_SELECT)
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update workflow',
      },
      { status: 500 }
    );
  }
});

// ============================================================================
// DELETE /api/workflows/[id] - Delete workflow
// ============================================================================

export const DELETE = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const userId = await requireUserId();
    const { id: workflowId } = (await ctx.params);

    // Validate UUID
    if (!z.string().uuid().safeParse(workflowId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow ID' },
        { status: 400 }
      );
    }

    // Check access
    const { allowed, workflow, error } = await checkWorkflowAccess(
      workflowId,
      userId,
      true
    );

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: error || 'Access denied' },
        { status: 403 }
      );
    }

    // Additional check: Only owner or org admin can delete
    if (workflow && workflow.user_id !== userId && workflow.organization_id) {
      const canDelete = await canPerformAction(
        userId,
        workflow.organization_id as string,
        'deleteProjects'
      );
      if (!canDelete) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only owners/admins can delete workflows' },
          { status: 403 }
        );
      }
    }

    // Delete workflow (cascades to executions and node_execution_data)
    const { error: deleteError } = await getSupabase()
      .from('workflows')
      .delete()
      .eq('id', workflowId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/route.ts',
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
        error: error instanceof Error ? error.message : 'Failed to delete workflow',
      },
      { status: 500 }
    );
  }
});
