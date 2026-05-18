/**
 * n8n Callback Handler
 * POST /internal/n8n/callback
 * Receives workflow completion events from n8n-relay sidecar
 * Security: HMAC signature, timestamp, nonce validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { createClient as createRedisClient } from 'redis';

export const dynamic = 'force-dynamic'

// Security constants
const TIMESTAMP_WINDOW = 600000; // 10 minutes in ms
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// Initialize Redis for nonce tracking
let redis: ReturnType<typeof createRedisClient> | null = null;

async function getRedis() {
  if (!redis) {
    redis = createRedisClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    await redis.connect();
  }
  return redis;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify X-Internal-Api-Key header
    const apiKey = request.headers.get('x-internal-api-key');
    
    if (!apiKey || apiKey !== INTERNAL_API_KEY) {
      console.error('Invalid or missing API key');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Verify timestamp (prevent replay attacks)
    const timestamp = request.headers.get('x-timestamp');
    
    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 400 });
    }

    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();

    if (isNaN(requestTime) || Math.abs(now - requestTime) > TIMESTAMP_WINDOW) {
      console.error('Request timestamp outside valid window');
      return NextResponse.json(
        { error: 'Request timestamp invalid or expired' },
        { status: 400 }
      );
    }

    // 3. Verify nonce (prevent replay attacks)
    const nonce = request.headers.get('x-nonce');
    
    if (!nonce) {
      return NextResponse.json({ error: 'Missing nonce' }, { status: 400 });
    }

    // Check if nonce was already used
    const redisClient = await getRedis();
    const nonceKey = `nonce:${nonce}`;
    const nonceExists = await redisClient.exists(nonceKey);

    if (nonceExists) {
      console.error('Nonce replay detected');
      return NextResponse.json(
        { error: 'Nonce already used (replay attack detected)' },
        { status: 400 }
      );
    }

    // Store nonce with TTL (prevent future replays)
    await redisClient.setEx(nonceKey, 600, '1'); // 10 min TTL

    // 4. Verify HMAC signature (optional but recommended)
    const signature = request.headers.get('x-signature');
    
    let payload: Record<string, unknown>;
    if (signature && INTERNAL_API_KEY) {
      const body = await request.text();
      const expectedSignature = crypto
        .createHmac('sha256', INTERNAL_API_KEY)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('HMAC signature mismatch');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }

      // Re-parse body after reading it for signature verification
      payload = JSON.parse(body);
    } else {
      payload = await request.json();
    }

    // 5. Extract callback data
    const { executionId, workflowId: _workflowId, status, data, error: execError } = payload as {
      executionId?: string; workflowId?: string; status: string; data?: unknown; error?: string;
    };

    if (!executionId) {
      return NextResponse.json(
        { error: 'Missing executionId' },
        { status: 400 }
      );
    }

    // 6. Find execution record in database
    const supabase = await createClient();
    const { data: execution, error: findError } = await supabase
      .from('workflow_executions')
      .select('id, workflow_id, started_at')
      .eq('n8n_execution_id', executionId)
      .single();

    if (findError || !execution) {
      console.error('Execution not found:', executionId);
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // 7. Calculate duration
    const finishedAt = new Date();
    const startedAt = new Date(execution.started_at);
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // 8. Update execution record
    const { error: updateError } = await supabase
      .from('workflow_executions')
      .update({
        status: mapStatus(status),
        output: data || null,
        error: execError || null,
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', execution.id);

    if (updateError) {
      console.error('Failed to update execution:', updateError);
      throw updateError;
    }

    // 9. Optional: Write to usage_events table for billing
    try {
      await supabase.from('usage_events').insert({
        organization_id: execution.workflow_id, // Should be from workflow
        event_type: 'workflow_execution',
        resource_id: execution.id,
        metadata: {
          workflow_id: execution.workflow_id,
          execution_id: executionId,
          status: status,
          duration_ms: durationMs,
        },
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      // Don't fail the callback if usage event fails
      console.error('Failed to record usage event:', error);
    }

    // 10. Optional: Trigger webhooks or notifications
    // ... (can be implemented as needed)

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      status: mapStatus(status),
    });
  } catch (error: unknown) {
    console.error('Callback handler error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process callback',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Map n8n status to our status enum
 */
function mapStatus(n8nStatus: string): string {
  const statusMap: Record<string, string> = {
    success: 'success',
    completed: 'success',
    failed: 'error',
    error: 'error',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    running: 'running',
    waiting: 'running',
  };

  return statusMap[n8nStatus.toLowerCase()] || 'error';
}

// Clean up Redis connection on shutdown
process.on('SIGTERM', async () => {
  if (redis) {
    await redis.disconnect();
  }
});
