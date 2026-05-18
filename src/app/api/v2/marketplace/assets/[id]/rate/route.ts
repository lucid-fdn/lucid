/**
 * Rating API v2
 * 
 * Enhanced, centralized endpoint for asset ratings
 * Part of unified marketplace API with consistent patterns
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { createNotification } from '@/lib/notifications';
import { z } from 'zod';
import { ErrorService } from '@/lib/errors/error-service';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Validation schema
const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

/**
 * POST /api/v2/marketplace/assets/[id]/rate
 * Create or update rating
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const { userId } = await requireServerAuth();
    
    // Rate limiting (strict: 10 ratings per minute)
    const rateLimitResult = await checkRateLimit(userId, {
      maxRequests: 10,
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
    
    // Parse and validate body
    const body = await request.json();
    const validation = ratingSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid input',
          details: validation.error.format()
        },
        { status: 400 }
      );
    }
    
    const { score, comment } = validation.data;
    const assetExternalId = (await params).id;
    
    // Get or create asset in Supabase
    let { data: asset } = await getSupabase()
      .from('assets')
      .select('id, name, owner_user_id')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset) {
      // Create asset stub
      const { data: newAsset } = await getSupabase()
        .from('assets')
        .insert({
          external_id: assetExternalId,
          name: assetExternalId,
          kind: 'MODEL',
          visibility: 'PUBLIC'
        })
        .select('id, name, owner_user_id')
        .single();
      
      asset = newAsset;
    }
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }
    
    // Check if user already rated
    const { data: existing } = await getSupabase()
      .from('ratings')
      .select('id, score')
      .eq('user_id', userId)
      .eq('asset_id', asset.id)
      .single();
    
    if (existing) {
      // Update existing rating
      const { error } = await getSupabase()
        .from('ratings')
        .update({
          score,
          comment,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      if (error) throw error;
      
      // Notification to user
      await createNotification({
        user_id: userId,
        title: 'Rating updated',
        message: `You updated your rating for ${asset.name} to ${score} stars`,
        type: 'success',
        href: `/marketplace/${assetExternalId}`
      });
      
      // Notification to owner if different
      if (asset.owner_user_id && asset.owner_user_id !== userId) {
        await createNotification({
          user_id: asset.owner_user_id,
          title: 'Rating updated',
          message: `A user updated their rating for ${asset.name} to ${score} stars`,
          type: 'info',
          href: `/marketplace/${assetExternalId}`
        });
      }
      
      return NextResponse.json({
        success: true,
        data: { 
          score, 
          comment,
          updated: true 
        }
      });
    }
    
    // Create new rating
    const { error } = await getSupabase()
      .from('ratings')
      .insert({
        user_id: userId,
        asset_id: asset.id,
        score,
        comment
      });
    
    if (error) throw error;
    
    // Notification to user
    await createNotification({
      user_id: userId,
      title: 'Rating submitted',
      message: `You rated ${asset.name} ${score} stars`,
      type: 'success',
      href: `/marketplace/${assetExternalId}`
    });
    
    // Notification to owner if different
    if (asset.owner_user_id && asset.owner_user_id !== userId) {
      await createNotification({
        user_id: asset.owner_user_id,
        title: 'New rating',
        message: `Someone rated ${asset.name} ${score} stars`,
        type: 'info',
        href: `/marketplace/${assetExternalId}`
      });
    }
    
    return NextResponse.json({
      success: true,
      data: { 
        score, 
        comment,
        created: true 
      }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/assets/:id/rate/route.ts',
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
        error: 'Failed to submit rating',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/marketplace/assets/[id]/rate
 * Remove rating
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
      maxRequests: 10,
      windowMs: 60 * 1000
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }
    
    const assetExternalId = (await params).id;
    
    // Get asset
    const { data: asset } = await getSupabase()
      .from('assets')
      .select('id')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }
    
    // Delete rating
    const { error } = await getSupabase()
      .from('ratings')
      .delete()
      .eq('user_id', userId)
      .eq('asset_id', asset.id);
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data: { deleted: true }
    });
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/v2/marketplace/assets/:id/rate/route.ts',
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
        error: 'Failed to remove rating',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/marketplace/assets/[id]/rate
 * Get user's rating
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireServerAuth();
    const assetExternalId = (await params).id;
    
    const { data: asset } = await getSupabase()
      .from('assets')
      .select('id')
      .eq('external_id', assetExternalId)
      .single();
    
    if (!asset) {
      return NextResponse.json({
        success: true,
        data: { rating: null }
      });
    }
    
    const { data: rating } = await getSupabase()
      .from('ratings')
      .select('score, comment')
      .eq('user_id', userId)
      .eq('asset_id', asset.id)
      .single();
    
    return NextResponse.json({
      success: true,
      data: { rating: rating || null }
    });
    
  } catch (_error) {
    return NextResponse.json({
      success: true,
      data: { rating: null }
    });
  }
}
