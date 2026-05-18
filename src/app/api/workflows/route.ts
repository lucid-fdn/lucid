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

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  organization_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  nodes: z.array(z.unknown()).default([]),
  edges: z.array(z.unknown()).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  pin_data: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'inactive']).default('draft'),
});

const _UpdateWorkflowSchema = z.object({
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

// ============================================================================
// GET /api/workflows - List workflows
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    
    // Query parameters
    const orgId = searchParams.get('orgId');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Build query
    let query = getSupabase()
      .from('workflows')
      .select('*, workflow_executions(count)', { count: 'exact' })
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Filter by organization
    if (orgId) {
      query = query.eq('organization_id', orgId);
      if (projectId) {
        query = query.eq('project_id', projectId);
      }
    } else {
      // Only personal workflows (no org)
      query = query.is('organization_id', null);
    }
    
    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }
    
    // Search by name
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
        data,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/route.ts',
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
        error: error instanceof Error ? error.message : 'Failed to fetch workflows',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/workflows - Create workflow
// ============================================================================

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const data = CreateWorkflowSchema.parse(body);
    
    // Access control for org workflows
    if (data.organization_id) {
      const canCreate = await canPerformAction(
        userId,
        data.organization_id,
        'createProjects' // Workflows follow same permissions as projects
      );
      if (!canCreate) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
    }
    
    // Create workflow
    const { data: workflow, error } = await getSupabase()
      .from('workflows')
      .insert({
        ...data,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/workflows/route.ts',
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
        error: error instanceof Error ? error.message : 'Failed to create workflow',
      },
      { status: 500 }
    );
  }
});
