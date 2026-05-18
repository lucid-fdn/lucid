/**
 * Tier-Based AI Generation Rate Limiting
 *
 * Shared quota/rate helper for structured AI generation features.
 * Uses `ai_generation_events` as the canonical store, with a legacy
 * fallback to `ai_workflow_generations` so new app code can roll out
 * safely before every environment is migrated.
 */

import { allowsPreviewAIGenerationRateLimitBypass, isNonProductionEnv } from '@/lib/env/e2e'
import { createClient } from '@/lib/supabase/server';

const AI_GENERATION_EVENTS_TABLE = 'ai_generation_events'
const LEGACY_AI_WORKFLOW_GENERATIONS_TABLE = 'ai_workflow_generations'

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

// Tier-based limits (requests per hour)
const TIER_LIMITS = {
  starter: 10,
  pro: 30,
  business: 100,
} as const;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  tier: string;
}

interface GenerationEventInput {
  userId: string
  prompt: string
  success: boolean
  tokensUsed?: number
  feature?: string
  metadata?: Record<string, unknown>
}

function isMissingRelationError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : ''
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message) : ''
  return code === '42P01' || /relation .* does not exist/i.test(message)
}

async function countGenerationEvents(
  userId: string,
  windowStartIso: string,
): Promise<number> {
  const supabase = await createClient()

  const canonical = await supabase
    .from(AI_GENERATION_EVENTS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStartIso)

  if (!canonical.error) {
    return canonical.count || 0
  }

  if (!isMissingRelationError(canonical.error)) {
    throw canonical.error
  }

  const legacy = await supabase
    .from(LEGACY_AI_WORKFLOW_GENERATIONS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStartIso)

  if (legacy.error) throw legacy.error
  return legacy.count || 0
}

async function insertGenerationEvent(input: GenerationEventInput): Promise<void> {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const canonical = await supabase.from(AI_GENERATION_EVENTS_TABLE).insert({
    user_id: input.userId,
    feature: input.feature ?? 'unknown',
    prompt: input.prompt,
    success: input.success,
    tokens_used: input.tokensUsed,
    metadata: input.metadata ?? {},
    created_at: nowIso,
  })

  if (!canonical.error) {
    return
  }

  if (!isMissingRelationError(canonical.error)) {
    throw canonical.error
  }

  const legacy = await supabase.from(LEGACY_AI_WORKFLOW_GENERATIONS_TABLE).insert({
    user_id: input.userId,
    prompt: input.prompt,
    success: input.success,
    tokens_used: input.tokensUsed,
    created_at: nowIso,
  })

  if (legacy.error) throw legacy.error
}

/**
 * Check AI generation rate limit based on user's subscription tier.
 */
export async function checkAIGenerationRateLimit(userId: string): Promise<RateLimitResult> {
  const allowPreviewE2EBypass = allowsPreviewAIGenerationRateLimitBypass()

  if (
    isNonProductionEnv()
    || allowPreviewE2EBypass
    || process.env.DISABLE_RATE_LIMITS === 'true'
  ) {
    const now = new Date()
    return {
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
      resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW),
      tier: allowPreviewE2EBypass ? 'preview-e2e' : 'development',
    }
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW);
  const supabase = await createClient();

  // Get user's subscription tier
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as keyof typeof TIER_LIMITS) || 'starter';
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.starter;

  const requestCount = await countGenerationEvents(userId, windowStart.toISOString());
  const remaining = Math.max(0, limit - requestCount);
  const resetAt = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW);

  return {
    allowed: requestCount < limit,
    remaining,
    limit,
    resetAt,
    tier,
  };
}

/**
 * Record an AI generation event for rate limiting and analytics.
 * `feature` is currently metadata-only at the abstraction layer because
 * the underlying legacy table does not yet have a dedicated feature column.
 */
export async function recordAIGenerationEvent(input: {
  userId: string
  prompt: string
  success: boolean
  tokensUsed?: number
  feature?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await insertGenerationEvent(input)
}

/**
 * Get user's current AI usage stats
 */
export async function getAIUsageStats(userId: string): Promise<{
  used: number;
  limit: number;
  tier: string;
  resetAt: Date;
}> {
  const result = await checkAIGenerationRateLimit(userId);
  return {
    used: result.limit - result.remaining,
    limit: result.limit,
    tier: result.tier,
    resetAt: result.resetAt,
  };
}

// Compatibility exports for existing callers.
export async function checkAIRateLimit(userId: string): Promise<RateLimitResult> {
  return checkAIGenerationRateLimit(userId)
}

export async function recordAIGeneration(
  userId: string,
  prompt: string,
  success: boolean,
  tokensUsed?: number,
): Promise<void> {
  return recordAIGenerationEvent({ userId, prompt, success, tokensUsed, feature: 'workflow-generation' })
}
