/**
 * Follow Organization API v2
 * 
 * Part of unified marketplace API - social features
 * Organizations are marketplace entities
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { createNotification } from '@/lib/notifications';
import { ErrorService } from '@/lib/errors/error-service';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/marketplace/organizations/:id/follow
 * Follow an organization
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireServerAuth();
    
    // Rate limiting (30 req/min for social actions)
    const rateLimitResult = await checkRateLimit(userId, {
      maxRequests: 30,
      windowMs: 60 * 1000
    });
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }
    
    const { id: orgIdOrSlug } = await params;
    
    // Try to find organization by slug first (from ElasticSearch marketplace)
    // If not found, try by ID
    let org = null;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrSlug);
    
    if (isUUID) {
      // Search by ID
      const { data } = await getSupabase()
        .from('organizations')
        .select('id, name, slug, display_name, created_by')
        .eq('id', orgIdOrSlug)
        .single();
      org = data;
    } else {
      // Search by slug (from marketplace)
      const { data } = await getSupabase()
        .from('organizations')
        .select('id, name, slug, display_name, created_by')
        .eq('slug', orgIdOrSlug)
        .single();
      org = data;
    }
    
    // If org doesn't exist, create it (auto-create from ElasticSearch)
    if (!org) {
      const { data: newOrg, error: createError } = await getSupabase()
        .from('organizations')
        .insert({
          slug: orgIdOrSlug,
          name: orgIdOrSlug.charAt(0).toUpperCase() + orgIdOrSlug.slice(1).replace(/-/g, ' '),
          display_name: orgIdOrSlug.charAt(0).toUpperCase() + orgIdOrSlug.slice(1).replace(/-/g, ' '),
          verified: true
        })
        .select('id, name, slug, display_name, created_by')
        .single();
      
      if (createError) {
        console.error('[v2/follow/org] Failed to create org:', createError);
        throw createError;
      }
      
      org = newOrg;
    }
    
    // Check if already following
    const { data: existing } = await getSupabase()
      .from('org_follows')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', org.id)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Already following' },
        { status: 400 }
      );
    }
    
    // Create follow
    const { error } = await getSupabase()
      .from('org_follows')
      .insert({
        user_id: userId,
        org_id: org.id
      });
    
    if (error) throw error;
    
    // Get follower info
    const { data: follower } = await getSupabase()
      .from('profiles')
      .select('name, handle')
      .eq('id', userId)
      .single();
    
    // Notify organization owner
    if (org.created_by && org.created_by !== userId) {
      await createNotification({
        user_id: org.created_by,
        title: 'New Organization Follower',
        message: `${follower?.name || follower?.handle} started following ${org.name}`,
        type: 'info',
        href: `/workspace/${org.slug}`
      });
    }
    
    return NextResponse.json({
      success: true,
      data: { following: true }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/organizations/:id/follow/route.ts',
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
        error: 'Failed to follow organization',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/marketplace/organizations/:id/follow
 * Unfollow an organization
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireServerAuth();
    
    // Rate limiting
    const rateLimitResult = await checkRateLimit(userId, {
      maxRequests: 30,
      windowMs: 60 * 1000
    });
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }
    
    const { id: orgIdOrSlug } = await params;
    
    // Find organization (by UUID or slug)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrSlug);
    
    let orgId = orgIdOrSlug;
    if (!isUUID) {
      // It's a slug, need to get the UUID
      const { data: org } = await getSupabase()
        .from('organizations')
        .select('id')
        .eq('slug', orgIdOrSlug)
        .single();
      
      if (!org) {
        return NextResponse.json(
          { success: false, error: 'Organization not found' },
          { status: 404 }
        );
      }
      orgId = org.id;
    }
    
    // Delete follow
    const { error } = await getSupabase()
      .from('org_follows')
      .delete()
      .eq('user_id', userId)
      .eq('org_id', orgId);
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { following: false }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/organizations/:id/follow/route.ts',
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
        error: 'Failed to unfollow organization',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/marketplace/organizations/:id/follow
 * Check if following an organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireServerAuth();
    const { id: orgIdOrSlug } = await params;
    
    // Find organization (by UUID or slug)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrSlug);
    
    let orgId = orgIdOrSlug;
    if (!isUUID) {
      // It's a slug, need to get the UUID
      const { data: org } = await getSupabase()
        .from('organizations')
        .select('id')
        .eq('slug', orgIdOrSlug)
        .single();
      
      if (!org) {
        return NextResponse.json({
          success: true,
          data: { following: false }
        });
      }
      orgId = org.id;
    }
    
    const { data: follow } = await getSupabase()
      .from('org_follows')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .single();
    
    return NextResponse.json({
      success: true,
      data: { following: !!follow }
    });
    
  } catch (_error) {
    return NextResponse.json({
      success: true,
      data: { following: false }
    });
  }
}
