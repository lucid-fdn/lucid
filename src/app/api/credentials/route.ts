import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { canPerformAction } from '@/lib/access-control/server';
import { withCSRF } from '@/lib/auth/csrf';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

/**
 * GET /api/credentials
 * List all credentials for the authenticated user
 * Filters by user_id or organization_id based on query params
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('org_id');

    if (orgId) {
      const canView = await canPerformAction(userId, orgId, 'viewSettings');
      if (!canView) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
    }

    let query = supabase
      .from('credentials')
      .select('id, name, type, organization_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    // Filter by organization or user
    if (orgId) {
      query = query.eq('organization_id', orgId);
    } else {
      query = query.eq('user_id', userId).is('organization_id', null);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch credentials' },
        { status: 500 }
      );
    }

    // Never return encrypted data in list view
    return NextResponse.json({ credentials: data || [] });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/credentials/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/credentials
 * Create a new credential
 * Body: { name, type, data, organization_id? }
 */
export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const userId = await requireUserId();
    const supabase = await createClient();
    const body = await req.json();

    const { name, type, data, organization_id } = body;

    if (organization_id) {
      const canManage = await canPerformAction(userId, organization_id, 'manageSettings');
      if (!canManage) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
    }

    // Validate required fields
    if (!name || !type || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, data' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['api_key', 'basic_auth', 'oauth2', 'custom_headers'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Encrypt credential data
    const { encryptCredential } = await import('@/lib/credentials/encryption');
    const encryptedData = encryptCredential(data);

    // Insert into database
    const { data: credential, error } = await supabase
      .from('credentials')
      .insert({
        user_id: userId,
        organization_id: organization_id || null,
        name,
        type,
        data: encryptedData,
      })
      .select('id, name, type, organization_id, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create credential' },
        { status: 500 }
      );
    }

    return NextResponse.json({ credential }, { status: 201 });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/credentials/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
