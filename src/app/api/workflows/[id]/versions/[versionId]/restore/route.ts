import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireUserId } from '@/lib/auth/server-utils';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

const WORKFLOW_SELECT = 'id, user_id, organization_id, name, description, nodes, edges, settings, pin_data, status, active, tags, published_at, version, version_id, created_at, updated_at, lucid_l2_workflow_id, lucid_l2_synced_at, lucid_l2_last_error'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ============================================================================
// POST /api/workflows/[id]/versions/[versionId]/restore - Restore version
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id: workflowId, versionId } = await params;
    const supabase = getSupabase();

    // Validate UUIDs
    if (!z.string().uuid().safeParse(workflowId).success ||
        !z.string().uuid().safeParse(versionId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid IDs' },
        { status: 400 }
      );
    }

    const access = await checkWorkflowAccess(supabase, workflowId, userId, true);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Call database function to restore version
    const { data: _success, error } = await supabase.rpc(
      'restore_workflow_version',
      {
        p_workflow_id: workflowId,
        p_version_id: versionId,
        p_restored_by: userId,
      }
    );

    if (error) {
      console.error('[versions] Error restoring version:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to restore version' },
        { status: 500 }
      );
    }

    // Fetch the restored workflow
    const { data: workflow } = await supabase
      .from('workflows')
      .select(WORKFLOW_SELECT)
      .eq('id', workflowId)
      .single();

    return NextResponse.json({
      success: true,
      data: workflow,
      message: 'Version restored successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/versions/:versionId/restore/route.ts',
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
