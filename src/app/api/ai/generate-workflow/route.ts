/**
 * AI Workflow Generation Endpoint
 * 
 * Streaming workflow generation using Vercel AI SDK + Lucid-L2 provider.
 * - Authentication via requireServerAuth()
 * - Tier-based rate limiting
 * - Input validation & sanitization
 * - Vercel AI SDK streaming
 * - Usage tracking via service layer
 */

import { streamText, Output, convertToModelMessages, type UIMessage } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerAuth } from '@/lib/auth/server-utils';
import { validateAIPrompt } from '@/lib/ai/validation';
import { checkAIGenerationRateLimit } from '@/lib/ai/rate-limit';
import { getBYOKModel } from '@/lib/ai/byok-provider';
import { isUserOrgMember } from '@/lib/db';
import { ErrorService } from '@/lib/errors/error-service';
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements';
import { incrementUsage } from '@/lib/plans';
import { workflowGenerationSchema } from '@/lib/ai/schemas';
import { DEFAULT_MODEL_ID } from '@/lib/ai/models';
import { runAIGeneration } from '@/lib/ai/control-plane/run-generation';
import { textGenerationAdapter } from '@/lib/ai/control-plane/adapters/text';
import { structuredGenerationAdapter } from '@/lib/ai/control-plane/adapters/structured';
import { writeAIGenerationEvent } from '@/lib/ai/control-plane/events';

export const dynamic = 'force-dynamic'

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const workflowRequestSchema = z.object({
  messages: z.array(z.any()),
  model: z.string().default(DEFAULT_MODEL_ID),
  orgId: z.string().optional(), // For BYOK model resolution
  structured: z.boolean().default(false), // When true, returns structured FlowSpec JSON
});

// ============================================================================
// POST /api/ai/generate-workflow
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user (getServerAuth, not requireServerAuth — redirect() breaks API routes)
    const auth = await getServerAuth();
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId } = auth;

    // 2. Parse & validate request
    const body = await request.json();
    const { messages, model: modelId, orgId, structured } = workflowRequestSchema.parse(body);

    // 3. Validate the last message prompt content
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';

    const validation = validateAIPrompt(prompt);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid input', issues: validation.issues },
        { status: 400 }
      );
    }

    // 4. Rate limiting
    const rateLimit = await checkAIGenerationRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // 5. Validate org membership if orgId provided (prevents cross-org BYOK key access)
    if (orgId) {
      const isMember = await isUserOrgMember(userId, orgId);
      if (!isMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Track AI query usage
      const entitlement = await evaluateEntitlement({ orgId, action: 'ai_query' });
      const entitlementGuard = guardEntitlement(entitlement, { orgId, route: '/api/ai/generate-workflow' });
      if (entitlementGuard) return entitlementGuard;
      // Charging model: "accepted request consumes quota".
      // Use client-supplied idempotency header if present, else fall back to UUID.
      const idemKey = request.headers.get('x-idempotency-key') || crypto.randomUUID();
      incrementUsage(orgId, 'ai_queries_monthly', 1, `gen-wf:${orgId}:${idemKey}`).catch(() => {});
    }

    // 6. Convert messages and stream with Lucid provider
    const modelMessages = await convertToModelMessages(messages as UIMessage[]);

    // 6b. Resolve model for the legacy simple generation path (BYOK-first with Lucid fallback).
    const resolvedModel = orgId
      ? (await getBYOKModel(orgId, modelId)).model
      : (await import('@/lib/ai/providers')).getLucidModel(modelId);

    const streamFactory = () => streamText({
      model: resolvedModel,
      messages: modelMessages,
      // When structured=true, generate a type-safe FlowSpec object
      ...(structured && {
        output: Output.object({ schema: workflowGenerationSchema }),
      }),
      async onFinish({ text: _text, usage }) {
        try {
          const inputTokens = usage.inputTokens ?? 0
          const outputTokens = usage.outputTokens ?? 0
          await writeAIGenerationEvent({
            context: { userId, orgId },
            feature: 'workflow-generation',
            modality: structured ? 'structured' : 'text',
            prompt,
            success: true,
            model: modelId,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
            metadata: {
              route: '/api/ai/generate-workflow',
              structured,
            },
          });
        } catch (err) {
          ErrorService.captureException(err as Error, {
            severity: 'warning',
            context: { userId, modelId, operation: 'recordControlPlaneGeneration' },
            tags: { layer: 'api', route: 'ai-generate-workflow' },
          });
        }
      },
    });

    const { output } = structured
      ? await runAIGeneration({
        context: { userId, orgId },
        feature: 'workflow-generation',
        modality: 'structured',
        model: modelId,
        prompt,
        input: {
          execute: streamFactory,
          model: modelId,
          metadata: { route: '/api/ai/generate-workflow', structured: true },
        },
        recordSuccessEvent: false,
        adapter: structuredGenerationAdapter,
      })
      : await runAIGeneration({
        context: { userId, orgId },
        feature: 'workflow-generation',
        modality: 'text',
        model: modelId,
        prompt,
        input: {
          execute: streamFactory,
          model: modelId,
          metadata: { route: '/api/ai/generate-workflow', structured: false },
        },
        recordSuccessEvent: false,
        adapter: textGenerationAdapter,
      });

    const result = output.result;

    // For structured output, use text stream (carries partial JSON objects)
    // For conversational output, use UI message stream
    return structured
      ? result.toTextStreamResponse()
      : result.toUIMessageStreamResponse();
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        endpoint: '/api/ai/generate-workflow',
        method: 'POST',
      },
      tags: {
        layer: 'api',
        route: 'ai-generate-workflow',
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate workflow' },
      { status: 500 }
    );
  }
}
