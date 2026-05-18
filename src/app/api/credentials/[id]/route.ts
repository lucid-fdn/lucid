import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { canPerformAction } from '@/lib/access-control/server';
import { withCSRF } from '@/lib/auth/csrf';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

type CredentialRow = {
  id: string
  user_id: string | null
  organization_id: string | null
  name: string
  type: string
  data: string
  created_at: string
  updated_at: string
}

async function canAccessCredential(
  userId: string,
  credential: Pick<CredentialRow, 'user_id' | 'organization_id'>,
  permission: 'viewSettings' | 'manageSettings'
): Promise<boolean> {
  if (!credential.organization_id) {
    return credential.user_id === userId
  }

  return canPerformAction(userId, credential.organization_id, permission)
}

/**
 * GET /api/credentials/[id]
 * Get a single credential by ID
 * Returns decrypted data (use with caution - only for editing)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const supabase = await createClient();
    const credentialId = (await params).id;

    // Fetch credential metadata first, then enforce explicit access control.
    const { data: credential, error } = await supabase
      .from('credentials')
      .select('id, user_id, organization_id, name, type, data, created_at, updated_at')
      .eq('id', credentialId)
      .single<CredentialRow>();

    if (error || !credential) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      );
    }

    const canView = await canAccessCredential(userId, credential, 'viewSettings')
    if (!canView) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    // Decrypt data for editing (only return decrypted data if user owns it)
    const { decryptCredential } = await import('@/lib/credentials/encryption');
    const decryptedData = decryptCredential(credential.data);

    return NextResponse.json({
      credential: {
        id: credential.id,
        name: credential.name,
        type: credential.type,
        data: decryptedData,
        organization_id: credential.organization_id,
        created_at: credential.created_at,
        updated_at: credential.updated_at,
      },
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/credentials/:id/route.ts',
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
 * PATCH /api/credentials/[id]
 * Update a credential
 * Body: { name?, type?, data? }
 */
export const PATCH = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const userId = await requireUserId();
    const supabase = await createClient();
    const { id: credentialId } = (await ctx.params);
    const body = await req.json();

    const { name, type, data } = body;

    // Check credential exists and user has access
    const { data: existing, error: fetchError } = await supabase
      .from('credentials')
      .select('id, user_id, organization_id')
      .eq('id', credentialId)
      .single<CredentialRow>();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      );
    }

    const canManage = await canAccessCredential(userId, existing, 'manageSettings')
    if (!canManage) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (type !== undefined) {
      const validTypes = ['api_key', 'basic_auth', 'oauth2', 'custom_headers'];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }
      updates.type = type;
    }

    // Encrypt new data if provided
    if (data !== undefined) {
      const { encryptCredential } = await import('@/lib/credentials/encryption');
      updates.data = encryptCredential(data);
    }

    // Update credential
    let updateQuery = supabase
      .from('credentials')
      .update(updates)
      .eq('id', credentialId)

    if (existing.organization_id) {
      updateQuery = updateQuery.eq('organization_id', existing.organization_id)
    } else {
      updateQuery = updateQuery.eq('user_id', userId).is('organization_id', null)
    }

    const { data: updated, error: updateError } = await updateQuery
      .select('id, name, type, organization_id, created_at, updated_at')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update credential' },
        { status: 500 }
      );
    }

    return NextResponse.json({ credential: updated });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/credentials/:id/route.ts',
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

/**
 * DELETE /api/credentials/[id]
 * Delete a credential
 */
export const DELETE = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const userId = await requireUserId();
    const supabase = await createClient();
    const { id: credentialId } = (await ctx.params);

    const { data: existing, error: fetchError } = await supabase
      .from('credentials')
      .select('id, user_id, organization_id')
      .eq('id', credentialId)
      .single<CredentialRow>();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      )
    }

    const canManage = await canAccessCredential(userId, existing, 'manageSettings')
    if (!canManage) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      )
    }

    // Check if credential is in use
    const { data: usage, error: _usageError } = await supabase
      .from('credential_usage')
      .select('workflow_id')
      .eq('credential_id', credentialId)
      .limit(1);

    if (usage && usage.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete credential that is in use by workflows' },
        { status: 400 }
      );
    }

    // Delete credential (RLS will ensure user has access)
    let deleteQuery = supabase
      .from('credentials')
      .delete()
      .eq('id', credentialId)

    if (existing.organization_id) {
      deleteQuery = deleteQuery.eq('organization_id', existing.organization_id)
    } else {
      deleteQuery = deleteQuery.eq('user_id', userId).is('organization_id', null)
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete credential' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/credentials/:id/route.ts',
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
