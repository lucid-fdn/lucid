import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const rateLimit = await checkRateLimit(
      `company-info:${getRequestIdentifier(request)}`,
      RateLimitPresets.RELAXED
    );
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimit.limit.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': rateLimit.resetAt.toString(),
          },
        }
      );
    }

    const supabase = getSupabaseClient();
    const { slug } = await params;

    // Query organizations table
    const { data: organization, error } = await supabase
      .from('organizations')
      .select(`
        id,
        slug,
        name,
        display_name,
        logo_url,
        bio,
        verified
      `)
      .eq('slug', slug)
      .single();

    if (error || !organization) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Get followers count
    const { count: followersCount } = await supabase
      .from('org_follows')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', organization.id);

    // Get assets count
    const { count: assetsCount } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('owner_org_id', organization.id);

    return NextResponse.json({
      id: organization.slug, // ✅ Return slug as ID (will work with follow API)
      slug: organization.slug,
      name: organization.display_name || organization.name,
      logo_url: organization.logo_url,
      description: organization.bio,
      followers_count: followersCount || 0,
      assets_count: assetsCount || 0,
      verified: organization.verified || false,
    });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/company/:slug/info/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
