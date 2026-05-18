import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRedisRestEnv } from '@/lib/redis/env'
import { summarizeError } from '@/lib/logging/safe-log'

function createRateLimiter(): Ratelimit | null {
  const redisEnv = getRedisRestEnv()
  if (!redisEnv) return null

  return new Ratelimit({
    redis: new Redis(redisEnv),
    limiter: Ratelimit.fixedWindow(10, '60 s'), // 10 requests per 60 seconds
  })
}

const ratelimit = createRateLimiter()

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function withRateLimit(
  req: Request,
  handler: () => Promise<ApiResponse>
): Promise<NextResponse> {
  const ip = req.headers.get('x-real-ip') || 'unknown';
  const { success } = ratelimit ? await ratelimit.limit(ip) : { success: true };

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', status: 429 },
      { status: 429 }
    );
  }

  try {
    const result = await handler();
    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    console.error('[ai-api] Request failed:', summarizeError(error));

    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: error.message,
          status: error.statusCode,
          details: error.details,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        status: 500,
        details: summarizeError(error).message,
      },
      { status: 500 }
    );
  }
}

export function validateApiKey(apiKey: string | undefined, service: string): void {
  if (!apiKey) {
    throw new ApiError(`Missing API key for ${service}`, 500);
  }
}

export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): void {
  const missingFields = requiredFields.filter((field) => !data[field]);

  if (missingFields.length > 0) {
    throw new ApiError(
      `Missing required fields: ${missingFields.join(', ')}`,
      400
    );
  }
}
