/**
 * Lucid-L2 Icon Proxy API Route
 *
 * Proxies icon requests from Lucid-L2 through Next.js backend.
 *
 * Benefits:
 * - Hides external URLs from client
 * - Server-side caching with Redis
 * - Centralized authentication
 * - Better security and monitoring
 *
 * @route GET /api/lucid-l2/icons/[...path]
 * @example GET /api/lucid-l2/icons/icons/n8n-nodes-base/dist/nodes/Slack/slack.svg
 */

import { NextRequest, NextResponse } from 'next/server';
import { getL2GatewayBaseUrl } from '@/lib/lucid-l2/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const iconPath = (await params).path.join('/');

    if (!iconPath) {
      return NextResponse.json(
        { error: 'Icon path is required' },
        { status: 400 }
      );
    }

    // Get Lucid-L2 URL from the shared alias-aware resolver (server-side only).
    const serverUrl = getL2GatewayBaseUrl() || 'http://localhost:3001';

    // Construct icon URL
    const iconUrl = `${serverUrl}/api/flow/icon/${iconPath}`;

    // Fetch from Lucid-L2
    const response = await fetch(iconUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'LucidMerged/1.0',
      },
    });

    if (!response.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const iconData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/svg+xml';

    // Return with aggressive caching (icons don't change)
    return new NextResponse(iconData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: 'Failed to fetch icon',
        details: error instanceof Error ? error.message : String(error),
        type: error instanceof Error ? error.name : 'Unknown'
      },
      { status: 500 }
    );
  }
}
