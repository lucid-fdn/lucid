/**
 * Bookmark API v2
 * 
 * Enhanced, centralized endpoint for asset bookmarks
 * Part of unified marketplace API with consistent patterns
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
 * POST /api/v2/marketplace/assets/[id]/bookmark
 * Add bookmark
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const { userId } = await requireServerAuth();
    
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
    
    const { id: assetExternalId } = await params;
    
    // Get or create asset in Supabase
    let { data: asset } = await getSupabase()
      .from('assets')
      .select('id, name, owner_user_id')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset) {
      // Create asset stub if it doesn't exist
      // Generate slug from external_id
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
        console.error('[v2/bookmark] Error creating asset stub:', insertError);
        throw new Error(`Failed to create asset: ${insertError.message}`);
      }
      
      asset = newAsset;
    }
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }
    
    // Check if already bookmarked
    const { data: existing } = await getSupabase()
      .from('bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_id', asset.id)
      .single();
    
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Already bookmarked' },
        { status: 400 }
      );
    }
    
    // Create bookmark
    const { error } = await getSupabase()
      .from('bookmarks')
      .insert({
        user_id: userId,
        asset_id: asset.id
      });
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { bookmarked: true }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/assets/:id/bookmark/route.ts',
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
        error: 'Failed to bookmark asset',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/marketplace/assets/[id]/bookmark
 * Remove bookmark
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id: assetExternalId } = await params;

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
    
    // Delete bookmark
    const { error } = await getSupabase()
      .from('bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('asset_id', asset.id);
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { bookmarked: false }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/assets/:id/bookmark/route.ts',
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
        error: 'Failed to remove bookmark',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/marketplace/assets/[id]/bookmark
 * Check if bookmarked
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
        data: { bookmarked: false }
      });
    }
    
    const { data: bookmark } = await getSupabase()
      .from('bookmarks')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_id', asset.id)
      .single();
    
    return NextResponse.json({
      success: true,
      data: { bookmarked: !!bookmark }
    });
    
  } catch (_error) {
    return NextResponse.json({
      success: true,
      data: { bookmarked: false }
    });
  }
}
