/**
 * Like API v2
 * 
 * Endpoint for asset likes (similar to bookmark but for "likes")
 * Saves to database and updates user's liked assets
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/auth/rate-limit';
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
 * POST /api/v2/marketplace/assets/[id]/like
 * Add like to asset
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: assetExternalId } = await params;
    
    // Require authentication
    const { userId } = await requireServerAuth();
    
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 503 }
      );
    }
    
    // Rate limiting (30 req/min for actions)
    const rateLimitResult = await checkRateLimit(userId, {
      maxRequests: 30,
      windowMs: 60 * 1000
    });
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rate limit exceeded',
          retry_after: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString()
          }
        }
      );
    }
    
    // Get or create asset in Supabase
    let { data: asset, error: fetchError } = await getSupabase()
      .from('assets')
      .select('id, name, owner_user_id')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset && fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = not found, which is expected for new assets
      console.error('[v2/like] Error fetching asset:', fetchError);
      throw new Error(`Failed to fetch asset: ${fetchError.message}`);
    }
    
    if (!asset) {
      // Create asset stub if it doesn't exist
      // Generate slug from external_id (remove prefix and convert to slug format)
      const slug = assetExternalId
        .replace(/^[a-z]+-/, '') // Remove prefix like "hf-"
        .replace(/\//g, '-') // Replace slashes with dashes
        .toLowerCase();
      
      const { data: newAsset, error: insertError } = await getSupabase()
        .from('assets')
        .insert({
          external_id: assetExternalId,
          name: assetExternalId,
          slug: slug,
          kind: 'MODEL',
          visibility: 'PUBLIC'
        })
        .select('id, name, owner_user_id')
        .single();
      
      if (insertError) {
        console.error('[v2/like] Error creating asset stub:', insertError);
        throw new Error(`Failed to create asset: ${insertError.message}`);
      }
      
      asset = newAsset;
    }
    
    if (!asset) {
      console.error('[v2/like] Asset is null after fetch and insert');
      return NextResponse.json(
        { success: false, error: 'Failed to create or fetch asset' },
        { status: 500 }
      );
    }
    
    // Check if already liked
    const { data: existing } = await getSupabase()
      .from('asset_likes')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_id', asset.id)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Already liked' },
        { status: 400 }
      );
    }
    
    // Create like
    const { error } = await getSupabase()
      .from('asset_likes')
      .insert({
        user_id: userId,
        asset_id: asset.id
      });
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { liked: true }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/assets/:id/like/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    console.error('[v2/like] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to like asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/marketplace/assets/[id]/like
 * Remove like from asset
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: assetExternalId } = await params;
    
    // Require authentication
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

    // Get asset
    const { data: asset } = await getSupabase()
      .from('assets')
      .select('id, name')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }
    
    // Delete like
    const { error } = await getSupabase()
      .from('asset_likes')
      .delete()
      .eq('user_id', userId)
      .eq('asset_id', asset.id);
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { liked: false }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/assets/:id/like/route.ts',
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
        error: 'Failed to remove like',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/marketplace/assets/[id]/like
 * Check if liked
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params (Next.js 15 requirement)
    const { id: assetExternalId } = await params;
    const { userId } = await requireServerAuth();
    
    const { data: asset } = await getSupabase()
      .from('assets')
      .select('id')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset) {
      return NextResponse.json({
        success: true,
        data: { liked: false }
      });
    }
    
    const { data: like } = await getSupabase()
      .from('asset_likes')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_id', asset.id)
      .single();
    
    return NextResponse.json({
      success: true,
      data: { liked: !!like }
    });
    
  } catch (_error) {
    return NextResponse.json({
      success: true,
      data: { liked: false }
    });
  }
}
