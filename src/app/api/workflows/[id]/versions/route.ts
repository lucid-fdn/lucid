import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireUserId } from '@/lib/auth/server-utils';
import { ErrorService } from '@/lib/errors/error-service';
import { checkWorkflowAccess } from '@/lib/workflows/access';

export const dynamic = 'force-dynamic'

const VERSION_SELECT = 'id, workflow_id, version_number, name, description, nodes, edges, settings, pin_data, change_summary, is_auto_save, created_at, created_by'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ============================================================================
// GET /api/workflows/[id]/versions - List all versions
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id: workflowId } = await params;
    const supabase = getSupabase();

    // Validate UUID
    if (!z.string().uuid().safeParse(workflowId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow ID' },
        { status: 400 }
      );
    }

    const access = await checkWorkflowAccess(supabase, workflowId, userId, false);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    // Fetch versions
    const { data: versions, error } = await supabase
      .from('workflow_versions')
      .select(`
        id,
        version_number,
        name,
        change_summary,
        is_auto_save,
        created_at,
        created_by,
        profiles:created_by (
          id,
          name,
          avatar_url
        )
      `)
      .eq('workflow_id', workflowId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('[versions] Error fetching versions:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch versions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: versions || [],
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/versions/route.ts',
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

// ============================================================================
// POST /api/workflows/[id]/versions - Create new version
// ============================================================================

const CreateVersionSchema = z.object({
  change_summary: z.string().max(500).optional(),
  is_auto_save: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id: workflowId } = await params;
    const body = await request.json();
    const data = CreateVersionSchema.parse(body);
    const supabase = getSupabase();

    // Validate UUID
    if (!z.string().uuid().safeParse(workflowId).success) {
      return NextResponse.json(
        { success: false, error: 'Invalid workflow ID' },
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

    // Call database function to create version
    const { data: versionId, error } = await supabase.rpc(
      'create_workflow_version',
      {
        p_workflow_id: workflowId,
        p_created_by: userId,
        p_is_auto_save: data.is_auto_save,
        p_change_summary: data.change_summary || null,
      }
    );

    if (error) {
      console.error('[versions] Error creating version:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create version' },
        { status: 500 }
      );
    }

    // Fetch the created version
    const { data: version } = await supabase
      .from('workflow_versions')
      .select(VERSION_SELECT)
      .eq('id', versionId)
      .eq('workflow_id', workflowId)
      .single();

    return NextResponse.json({
      success: true,
      data: version,
      message: 'Version created successfully',
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/versions/route.ts',
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
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
