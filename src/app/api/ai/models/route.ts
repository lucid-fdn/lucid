/**
 * AI Models API Route
 * 
 * Returns available AI models from Lucid-L2 API
 * Supports filtering by category and grouping by provider
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  fetchModels,
  getDefaultEmbeddingModel,
  type ModelCategory,
  type ModelConfig,
} from '@/lib/ai/models';
import { getBYOKModels } from '@/lib/ai/byok-models';
import { getProviderInfo, isLucidConfigured } from '@/lib/ai/providers';
import { requireUserId } from '@/lib/auth/session';

export const dynamic = 'force-dynamic'

// ============================================================================
// GET /api/ai/models
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Optional auth - models can be viewed without auth for pricing pages
    let userId: string | null = null;
    try {
      userId = await requireUserId();
    } catch {
      // Allow unauthenticated access
    }
    
    const { searchParams } = new URL(request.url);

    // Filter options
    const category = searchParams.get('category') as ModelCategory | null;
    const provider = searchParams.get('provider');
    const featured = searchParams.get('featured') === 'true';
    const grouped = searchParams.get('grouped') === 'true';
    const orgId = searchParams.get('orgId');

    // Fetch platform models + BYOK models in parallel
    const [platformModels, byokModels] = await Promise.all([
      fetchModels(),
      orgId ? getBYOKModels(orgId).catch(() => []) : Promise.resolve([]),
    ]);

    // Merge: BYOK models that aren't already in the platform list
    const platformIds = new Set(platformModels.map(m => m.id));
    const uniqueBYOK = byokModels.filter(m => !platformIds.has(m.id));
    let models: ModelConfig[] = [...platformModels, ...uniqueBYOK];

    // Apply filters
    if (category) {
      models = models.filter(m => m.category === category);
    }
    
    if (provider) {
      models = models.filter(m => m.provider === provider);
    }
    
    if (featured) {
      models = models.filter(m => m.isFeatured);
    }
    
    // Get provider info
    const providerInfo = getProviderInfo();
    
    // Get embedding models
    const embeddingModel = getDefaultEmbeddingModel();
    
    // Build response
    if (grouped) {
      // Group by provider
      const groupedModels: Record<string, ModelConfig[]> = {};
      
      for (const model of models) {
        if (!groupedModels[model.provider]) {
          groupedModels[model.provider] = [];
        }
        groupedModels[model.provider].push(model);
      }
      
      // Transform to array format expected by ModelSelector
      const groups = Object.entries(groupedModels).map(([provider, providerModels]) => ({
        provider,
        models: providerModels,
      }));

      return NextResponse.json({
        groups,  // ModelSelector expects this format
        models: groupedModels,  // Keep for backward compatibility
        provider: {
          id: providerInfo.id,
          name: providerInfo.name,
          description: providerInfo.description,
          isEnabled: isLucidConfigured(),
          features: providerInfo.features,
        },
        embeddingModels: [embeddingModel],
        meta: {
          totalModels: models.length,
          totalProviders: Object.keys(groupedModels).length,
          categories: ['chat', 'code', 'reasoning', 'vision', 'embedding'],
          source: 'lucid-l2',
        },
      });
    }
    
    return NextResponse.json({
      models: models.map(m => ({
        id: m.id,
        modelId: m.modelId,
        passportId: m.passportId,
        name: m.name,
        provider: m.provider,
        category: m.category,
        description: m.description,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        pricing: m.pricing,
        isDefault: m.isDefault,
        isNew: m.isNew,
        isFeatured: m.isFeatured,
        supportsFunctions: m.supportsFunctions,
        supportsVision: m.supportsVision,
        supportsStreaming: m.supportsStreaming,
      })),
      provider: {
        id: providerInfo.id,
        name: providerInfo.name,
        description: providerInfo.description,
        isEnabled: isLucidConfigured(),
        features: providerInfo.features,
      },
      embeddingModels: [embeddingModel],
      meta: {
        totalModels: models.length,
        categories: ['chat', 'code', 'reasoning', 'vision', 'embedding'],
        source: 'lucid-l2',
      },
    });
    
  } catch (error) {
    console.error('[AI Models API] Error:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
