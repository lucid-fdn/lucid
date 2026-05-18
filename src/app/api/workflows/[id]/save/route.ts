/**
 * Workflow Save Endpoint (Autosave)
 * POST /api/workflows/:id/save
 * 
 * Simple database save for autosave functionality.
 * FlowSpec conversion and Lucid-L2 sync happens on execution only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { withCSRF } from '@/lib/auth/csrf';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const { id: workflowId } = (await (ctx as { params: Promise<{ id: string }> }).params);

    // 1. Centralized auth check
    const { userId } = await requireServerAuth();
    
    // 2. Centralized Supabase client
    const supabase = await createClient();

    // 3. Load workflow from database to check access
    const { data: workflow, error: dbError } = await supabase
      .from('workflows')
      .select('user_id, organization_id')
      .eq('id', workflowId)
      .single();

    if (dbError || !workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // 4. Check user has access
    let hasAccess = false;
    
    // Check direct ownership
    if (workflow.user_id === userId) {
      hasAccess = true;
    } 
    // Check organization membership
    else if (workflow.organization_id) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', workflow.organization_id)
        .eq('user_id', userId)
        .single();

      if (membership) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // 5. Simple success response
    // Actual save happens via PUT /api/workflows/:id
    return NextResponse.json({
      success: true,
      workflowId,
      message: 'Workflow save acknowledged',
    });
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/:id/save/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });

    return NextResponse.json(
      {
        error: 'Failed to save workflow',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
});
