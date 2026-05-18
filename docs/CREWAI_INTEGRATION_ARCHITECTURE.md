# CrewAI Integration Architecture

**Production-Grade AI-Powered Workflow Generation**

---

## 🎯 Overview

Integrate Lucid-L2's CrewAI service to enable natural language workflow generation while maintaining:
- ✅ **Centralized patterns** (requireServerAuth, createClient, isFeatureEnabled)
- ✅ **Performance optimization** (React cache, rate limiting, streaming)
- ✅ **Security** (input validation, rate limits, audit logs)
- ✅ **Scalability** (async processing, queue system)
- ✅ **Industry standards** (REST API, proper error handling, monitoring)

---

## 🏗️ Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────┐
│  User Input: "Monitor ETH gas every hour..."   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  AI Workflow Dialog (React Component)          │
│  - Input validation                             │
│  - Character limit (500 chars)                  │
│  - Real-time suggestions                        │
│  - Example templates                            │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  API Route: /api/ai/generate-workflow           │
│  - requireServerAuth()  ← Centralized auth      │
│  - createClient()       ← Centralized Supabase  │
│  - isFeatureEnabled()   ← Feature flag check    │
│  - Rate limiting (10/hour per user)             │
│  - Input sanitization                           │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Lucid-L2 Client Method                         │
│  - getLucidL2Client()                           │
│  - planWorkflowWithAI()                         │
│  - React cache() for deduplication              │
│  - Request timeout (30s)                        │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Lucid-L2 CrewAI Service (Port 8082)            │
│  - GPT-4 analysis                               │
│  - FlowSpec generation                          │
│  - Validation                                   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Response Processing                            │
│  - FlowSpec → React Flow conversion            │
│  - Auto-layout algorithm                        │
│  - Syntax highlighting                          │
│  - Save to database (optional)                  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Workflow Editor Canvas                         │
│  - Animated transition                          │
│  - Editable workflow                            │
│  - Save/Execute options                         │
└─────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
src/
├── lib/
│   ├── lucid-l2/
│   │   ├── client.ts           # Add AI methods here
│   │   ├── ai.ts               # NEW: AI-specific helpers
│   │   └── rate-limit.ts       # NEW: Rate limiting
│   └── ai/
│       ├── validation.ts       # NEW: Input validation
│       ├── templates.ts        # NEW: Example templates
│       └── suggestions.ts      # NEW: Real-time suggestions
├── app/
│   └── api/
│       └── ai/
│           ├── generate-workflow/
│           │   └── route.ts    # NEW: Main AI endpoint
│           ├── suggest/
│           │   └── route.ts    # NEW: Real-time suggestions
│           └── templates/
│               └── route.ts    # NEW: Get templates
├── components/
│   └── workflow/
│       ├── ai-workflow-dialog.tsx        # NEW: Main UI
│       ├── ai-prompt-builder.tsx         # NEW: Prompt helper
│       ├── ai-result-preview.tsx         # NEW: Result preview
│       └── ai-generation-history.tsx     # NEW: Past generations
└── hooks/
    ├── use-ai-workflow.ts                # NEW: Main hook
    └── use-ai-suggestions.ts             # NEW: Suggestions hook
```

---

## 🔧 Implementation Details

### 1. Extend Lucid-L2 Client

**Update: `src/lib/lucid-l2/client.ts`**

Add these methods to the `LucidL2Client` class:

```typescript
/**
 * AI-Powered Workflow Planning
 * 
 * Generates workflow from natural language using CrewAI + GPT-4
 * Cached to prevent duplicate API calls
 */
async planWorkflowWithAI(
  goal: string,
  context?: {
    tenantId: string;
    existingNodes?: string[];      // Suggest compatible nodes
    constraints?: string[];         // e.g., "Must use Solana", "No emails"
    complexity?: 'simple' | 'medium' | 'complex';
  }
): Promise<{
  flowspec: FlowSpec;
  reasoning: string;                // GPT-4's explanation
  estimatedComplexity: string;      // "Simple - 3 nodes"
  suggestedImprovements?: string[]; // Optional enhancements
  tokensUsed?: number;              // For billing
}> {
  return this.request('/agents/plan', {
    method: 'POST',
    body: JSON.stringify({ goal, context }),
  });
}

/**
 * Get AI suggestions while typing
 * Lightweight endpoint for real-time feedback
 */
async getWorkflowSuggestions(
  partialGoal: string,
  limit: number = 5
): Promise<string[]> {
  return this.request('/agents/suggest', {
    method: 'POST',
    body: JSON.stringify({ partial: partialGoal, limit }),
  });
}

/**
 * Validate workflow goal before generation
 * Fast check to prevent wasted AI calls
 */
async validateWorkflowGoal(goal: string): Promise<{
  valid: boolean;
  issues?: string[];
  suggestions?: string[];
}> {
  return this.request('/agents/validate', {
    method: 'POST',
    body: JSON.stringify({ goal }),
  });
}
```

### 2. Create AI Helper Library

**Create: `src/lib/ai/validation.ts`**

```typescript
/**
 * AI Input Validation
 * Validates user input before sending to AI
 */

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  sanitized?: string;
}

export function validateAIPrompt(prompt: string): ValidationResult {
  const issues: string[] = [];

  // Length check
  if (prompt.length < 10) {
    issues.push('Prompt too short. Please be more descriptive.');
  }
  if (prompt.length > 500) {
    issues.push('Prompt too long. Please be more concise (max 500 chars).');
  }

  // Content validation
  const suspiciousPatterns = [
    /ignore previous/i,
    /forget all instructions/i,
    /system prompt/i,
    /<script/i,
    /eval\(/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(prompt)) {
      issues.push('Prompt contains suspicious content.');
      break;
    }
  }

  // Sanitize
  const sanitized = prompt
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 500);

  return {
    valid: issues.length === 0,
    issues,
    sanitized: issues.length === 0 ? sanitized : undefined,
  };
}

export function extractIntent(prompt: string): {
  action: string;          // "monitor", "alert", "fetch", etc.
  target: string;          // "ETH price", "gas fees", etc.
  frequency?: string;      // "every hour", "daily", etc.
  condition?: string;      // "if > $50k", etc.
} {
  // Simple NLP to extract key components
  const action = prompt.match(/\b(monitor|check|fetch|get|send|alert|notify|track)\b/i)?.[0] || 'execute';
  const frequencyMatch = prompt.match(/every\s+(\d+\s+\w+|hour|day|minute)/i);
  const conditionMatch = prompt.match(/if\s+(.+?)(?:\.|$)/i);

  return {
    action: action.toLowerCase(),
    target: prompt,
    frequency: frequencyMatch?.[0],
    condition: conditionMatch?.[1],
  };
}
```

**Create: `src/lib/ai/templates.ts`**

```typescript
/**
 * AI Workflow Templates
 * Pre-built examples to help users
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: 'monitoring' | 'alerts' | 'data' | 'social' | 'defi';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'eth-gas-monitor',
    name: 'ETH Gas Price Monitor',
    description: 'Monitor Ethereum gas prices and get alerts',
    prompt: 'Check ETH gas prices every 10 minutes and send Slack alert if over 50 gwei',
    category: 'monitoring',
    difficulty: 'beginner',
    tags: ['ethereum', 'gas', 'monitoring', 'slack'],
  },
  {
    id: 'btc-price-alert',
    name: 'Bitcoin Price Alert',
    description: 'Get notified when BTC hits target price',
    prompt: 'Monitor Bitcoin price every 5 minutes and email me if it crosses $50,000',
    category: 'alerts',
    difficulty: 'beginner',
    tags: ['bitcoin', 'price', 'email'],
  },
  {
    id: 'defi-tvl-tracker',
    name: 'DeFi TVL Tracker',
    description: 'Track Total Value Locked across protocols',
    prompt: 'Fetch TVL from Aave, Compound, and Uniswap daily, calculate total, store in database',
    category: 'defi',
    difficulty: 'intermediate',
    tags: ['defi', 'tvl', 'database'],
  },
  {
    id: 'nft-floor-watch',
    name: 'NFT Floor Price Watcher',
    description: 'Monitor NFT collection floor prices',
    prompt: 'Check BAYC floor price every hour on OpenSea and tweet if it drops 10%',
    category: 'monitoring',
    difficulty: 'intermediate',
    tags: ['nft', 'opensea', 'twitter'],
  },
  {
    id: 'token-swap-alert',
    name: 'Token Swap Alert',
    description: 'Alert on large token swaps',
    prompt: 'Monitor Uniswap for ETH-USDC swaps over $1M and send Discord notification',
    category: 'alerts',
    difficulty: 'advanced',
    tags: ['defi', 'uniswap', 'discord'],
  },
];

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.category === category);
}

export function getTemplatesByDifficulty(difficulty: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.difficulty === difficulty);
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  const lowerQuery = query.toLowerCase();
  return WORKFLOW_TEMPLATES.filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.includes(lowerQuery))
  );
}
```

**Create: `src/lib/ai/rate-limit.ts`**

```typescript
/**
 * Rate Limiting for AI Generation
 * Prevents abuse and manages API costs
 */

import { createClient } from '@/lib/supabase/server';

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_HOUR = 10;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  userId: string
): Promise<RateLimitResult> {
  const supabase = await createClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW);

  // Count recent AI generations
  const { count, error } = await supabase
    .from('ai_workflow_generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart.toISOString());

  if (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR, resetAt: now };
  }

  const requestCount = count || 0;
  const remaining = Math.max(0, MAX_REQUESTS_PER_HOUR - requestCount);
  const resetAt = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW);

  return {
    allowed: requestCount < MAX_REQUESTS_PER_HOUR,
    remaining,
    resetAt,
  };
}

export async function recordAIGeneration(
  userId: string,
  prompt: string,
  success: boolean,
  tokensUsed?: number
): Promise<void> {
  const supabase = await createClient();

  await supabase.from('ai_workflow_generations').insert({
    user_id: userId,
    prompt,
    success,
    tokens_used: tokensUsed,
    created_at: new Date().toISOString(),
  });
}
```

### 3. Create API Route

**Create: `src/app/api/ai/generate-workflow/route.ts`**

```typescript
/**
 * AI Workflow Generation Endpoint
 * 
 * Follows all centralized patterns:
 * - requireServerAuth() for authentication
 * - createClient() for Supabase
 * - isFeatureEnabled() for feature flags
 * - Rate limiting for security
 * - Input validation
 * - Audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { getLucidL2Client } from '@/lib/lucid-l2';
import { isFeatureEnabled } from '@/lib/features';
import { validateAIPrompt } from '@/lib/ai/validation';
import { checkRateLimit, recordAIGeneration } from '@/lib/ai/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // 1. Centralized auth check
    const { userId } = await requireServerAuth();

    // 2. Feature flag check
    if (!isFeatureEnabled('crewAIGeneration')) {
      return NextResponse.json(
        { error: 'AI workflow generation is disabled' },
        { status: 503 }
      );
    }

    // 3. Parse request
    const body = await request.json();
    const { goal, constraints, complexity } = body;

    // 4. Input validation
    const validation = validateAIPrompt(goal);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid prompt', issues: validation.issues },
        { status: 400 }
      );
    }

    // 5. Rate limiting check
    const rateLimit = await checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    // 6. Call Lucid-L2 CrewAI
    const lucidL2 = getLucidL2Client();
    const result = await lucidL2.planWorkflowWithAI(validation.sanitized!, {
      tenantId: userId,
      constraints,
      complexity,
    });

    // 7. Record generation for rate limiting & analytics
    await recordAIGeneration(
      userId,
      validation.sanitized!,
      true,
      result.tokensUsed
    );

    // 8. Return result
    return NextResponse.json({
      success: true,
      flowspec: result.flowspec,
      reasoning: result.reasoning,
      complexity: result.estimatedComplexity,
      suggestions: result.suggestedImprovements,
      rateLimit: {
        remaining: rateLimit.remaining - 1,
        resetAt: rateLimit.resetAt,
      },
    });
  } catch (error: any) {
    console.error('[ai-generate] Error:', error);

    // Record failed generation
    try {
      const { userId } = await requireServerAuth();
      const body = await request.json();
      await recordAIGeneration(userId, body.goal, false);
    } catch {}

    return NextResponse.json(
      {
        error: 'Failed to generate workflow',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
```

### 4. Create Database Migration

**Create: `migrations/022_ai_workflow_tracking.sql`**

```sql
-- AI Workflow Generation Tracking
-- For rate limiting, analytics, and billing

BEGIN;

CREATE TABLE IF NOT EXISTS ai_workflow_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  tokens_used INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rate limiting queries (past hour)
CREATE INDEX IF NOT EXISTS idx_ai_gen_user_created 
ON ai_workflow_generations(user_id, created_at DESC);

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_ai_gen_success 
ON ai_workflow_generations(success, created_at DESC);

-- RLS Policies
ALTER TABLE ai_workflow_generations ENABLE ROW LEVEL SECURITY;

-- Users can view their own generations
CREATE POLICY "Users can view their AI generations"
  ON ai_workflow_generations FOR SELECT
  USING (user_id = auth.uid());

-- Service role can insert
CREATE POLICY "Service can insert AI generations"
  ON ai_workflow_generations FOR INSERT
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE ai_workflow_generations IS 'Tracks AI workflow generation requests for rate limiting and analytics';
COMMENT ON COLUMN ai_workflow_generations.tokens_used IS 'GPT-4 tokens used (for billing)';

COMMIT;
```

---

## 🎨 UI/UX Design

### Design Principles

1. **Progressive Disclosure** - Simple start, advanced options hidden
2. **Instant Feedback** - Real-time validation and suggestions
3. **Clear Communication** - Show AI reasoning and editable results
4. **Trust Building** - Transparent about what AI does
5. **Fallback Options** - Manual creation always available

### Component Hierarchy

```
<AIWorkflowDialog>                    # Modal/Sidebar container
├── <AIPromptBuilder>                 # Main input area
│   ├── <PromptInput />              # Textarea with validation
│   ├── <CharacterCount />           # 0/500
│   ├── <RealTimeSuggestions />      # Dropdown suggestions
│   └── <ExampleTemplates />         # Quick start templates
├── <AIGenerationProgress>            # Loading state
│   ├── <ProgressBar />              # Visual progress
│   ├── <StatusMessage />            # "Analyzing...", "Generating..."
│   └── <EstimatedTime />            # "~15 seconds remaining"
├── <AIResultPreview>                 # Generated workflow preview
│   ├── <FlowSpecViewer />           # Syntax highlighted JSON
│   ├── <GraphPreview />             # Visual graph preview
│   ├── <AIReasoning />              # GPT-4's explanation
│   └── <SuggestedImprovements />    # Optional enhancements
└── <AIActionButtons>                 # CTA buttons
    ├── <LoadToCanvas />             # Primary action
    ├── <EditAndLoad />              # Secondary action
    ├── <Regenerate />               # Try again
    └── <SaveTemplate />             # Save for later
```

---

## 🎯 Detailed UI/UX Specs

### 1. AI Dialog Entry Point

**Location:** Workflow Editor Toolbar

```tsx
<Button
  variant="default"
  size="lg"
  onClick={() => setShowAIDialog(true)}
  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
>
  <Sparkles className="mr-2 h-5 w-5" />
  Generate with AI
  <Badge className="ml-2">Beta</Badge>
</Button>
```

**States:**
- **Default:** Prominent gradient button
- **Hover:** Slight glow effect
- **Loading:** Disabled with spinner
- **Disabled:** Greyed out if feature flag off or rate limit hit

### 2. AI Prompt Builder

**Layout:** Clean, focused interface

```
┌─────────────────────────────────────────────────────────┐
│  🤖 AI Workflow Generator                        ✕      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Describe your workflow in plain English                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Monitor ETH gas prices every hour
