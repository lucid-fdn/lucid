/**
 * Follow Contributor API v2
 * 
 * Part of unified marketplace API - social features
 * Contributors are marketplace participants
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
 * POST /api/v2/marketplace/contributors/:handle/follow
 * Follow a contributor
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
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
    
    const { handle } = await params;
    
    // Get contributor
    const { data: contributor } = await getSupabase()
      .from('profiles')
      .select('id, name, handle')
      .eq('handle', handle)
      .single();
    
    if (!contributor) {
      return NextResponse.json(
        { success: false, error: 'Contributor not found' },
        { status: 404 }
      );
    }
    
    // Can't follow yourself
    if (contributor.id === userId) {
      return NextResponse.json(
        { success: false, error: 'Cannot follow yourself' },
        { status: 400 }
      );
    }
    
    // Check if already following
    const { data: existing } = await getSupabase()
      .from('contributor_follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', contributor.id)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Already following' },
        { status: 400 }
      );
    }
    
    // Create follow
    const { error } = await getSupabase()
      .from('contributor_follows')
      .insert({
        follower_id: userId,
        following_id: contributor.id
      });
    
    if (error) throw error;
    
    // Get follower info
    const { data: follower } = await getSupabase()
      .from('profiles')
      .select('name, handle')
      .eq('id', userId)
      .single();
    
    // Notify contributor
    await createNotification({
      user_id: contributor.id,
      title: 'New Follower',
      message: `${follower?.name || follower?.handle} started following you`,
      type: 'info',
      href: `/profile/${follower?.handle}`
    });
    
    return NextResponse.json({
      success: true,
      data: { following: true }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/contributors/:handle/follow/route.ts',
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
        error: 'Failed to follow contributor',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/marketplace/contributors/:handle/follow
 * Unfollow a contributor
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
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
    
    const { handle } = await params;
    
    // Get contributor
    const { data: contributor } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (!contributor) {
      return NextResponse.json(
        { success: false, error: 'Contributor not found' },
        { status: 404 }
      );
    }
    
    // Delete follow
    const { error } = await getSupabase()
      .from('contributor_follows')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', contributor.id);
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { following: false }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/contributors/:handle/follow/route.ts',
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
        error: 'Failed to unfollow contributor',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/marketplace/contributors/:handle/follow
 * Check if following a contributor
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { userId } = await requireServerAuth();
    const { handle } = await params;
    
    const { data: contributor } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('handle', handle)
      .single();
    
    if (!contributor) {
      return NextResponse.json({
        success: true,
        data: { following: false }
      });
    }
    
    const { data: follow } = await getSupabase()
      .from('contributor_follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', contributor.id)
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
