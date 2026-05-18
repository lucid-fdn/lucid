/**
 * Official Lucid Foundation SDK Wrapper
 * 
 * This file initializes and exports the official raijin-labs-lucid-ai SDK.
 * 
 * SDK Repository: https://github.com/raijinlabs/Lucid-L2/tree/master/sdk/raijin-labs-lucid-ai-typescript
 * 
 * Why use the official SDK?
 * - Maintained by Lucid Foundation team
 * - Type-safe API calls
 * - Automatic error handling
 * - Built-in retry logic
 * - Future-proof (new features added automatically)
 * 
 * Architecture:
 * - This file (sdk.ts): SDK initialization and configuration
 * - models.ts: Caching + UI transformation layer (uses SDK underneath)
 * - providers.ts: Vercel AI SDK for streaming chat (OpenAI-compatible)
 * - service.ts: Database operations (conversations, messages, RAG)
 */

import { RaijinLabsLucidAi } from 'raijin-labs-lucid-ai';
import { getLucidProviderConfig } from './lucid-provider-config';

// ============================================================================
// SDK INITIALIZATION
// ============================================================================

const lucidProviderConfig = getLucidProviderConfig()

/**
 * Singleton SDK instance
 * 
 * All API calls should go through this instance for:
 * - Consistency
 * - Proper error handling
 * - Request deduplication
 * - Automatic retries
 * 
 * @example
 * ```typescript
 * import { lucidSDK } from '@/lib/ai/sdk';
 * 
 * // Run inference with model passport
 * const result = await lucidSDK.run.inference({
 *   modelPassportId: 'passport_b55b5d0407904d42b728a6f0fbdaa6dd',
 *   messages: [
 *     { role: 'user', content: 'Hello, world!' }
 *   ],
 *   maxTokens: 100,
 *   temperature: 0.7,
 * });
 * 
 * // Chat completions (OpenAI-compatible)
 * const chat = await lucidSDK.run.chatCompletions({
 *   model: 'passport_b55b5d0407904d42b728a6f0fbdaa6dd',
 *   messages: [
 *     { role: 'user', content: 'Hello!' }
 *   ],
 * });
 * ```
 */
export const lucidSDK = new RaijinLabsLucidAi({
  serverURL: lucidProviderConfig.baseUrl,
  // API key is optional - SDK handles it internally if provided
  ...(lucidProviderConfig.apiKey && {
    apiKey: lucidProviderConfig.apiKey,
  }),
});

// ============================================================================
// CONFIGURATION HELPERS
// ============================================================================

/**
 * Check if Lucid SDK is configured with API key
 * 
 * @returns true if TRUSTGATE_API_KEY is set and valid
 * 
 * @example
 * ```typescript
 * if (isSDKConfigured()) {
 *   // Make authenticated requests
 *   await lucidSDK.run.inference({ ... });
 * } else {
 *   // Handle unauthenticated state
 *   console.warn('Lucid SDK not configured');
 * }
 * ```
 */
export function isSDKConfigured(): boolean {
  return lucidProviderConfig.isConfigured;
}

/**
 * Get the configured base URL for Lucid API
 * 
 * @returns Base URL (default: https://api.lucid.foundation)
 * 
 * @example
 * ```typescript
 * const baseUrl = getSDKBaseURL();
 * console.log('Using Lucid API at:', baseUrl);
 * ```
 */
export function getSDKBaseURL(): string {
  return lucidProviderConfig.baseUrl;
}

// ============================================================================
// SDK USAGE GUIDE
// ============================================================================

/**
 * Comprehensive SDK Usage Examples
 * 
 * The official raijin-labs-lucid-ai SDK provides multiple endpoints:
 * 
 * 1. Model Inference (Recommended)
 * --------------------------------
 * Use `/v1/run/inference` for running models with passport IDs:
 * 
 * ```typescript
 * const result = await lucidSDK.run.inference({
 *   modelPassportId: 'passport_xxx',
 *   messages: [
 *     { role: 'system', content: 'You are a helpful assistant.' },
 *     { role: 'user', content: 'What is TypeScript?' }
 *   ],
 *   maxTokens: 500,
 *   temperature: 0.8,
 *   topP: 0.9,
 * });
 * 
 * console.log('Response:', result.choices[0].message.content);
 * console.log('Tokens used:', result.usage);
 * ```
 * 
 * 2. Chat Completions (OpenAI-Compatible)
 * ----------------------------------------
 * Use `/v1/chat/completions` for OpenAI-compatible API:
 * 
 * ```typescript
 * const chat = await lucidSDK.run.chatCompletions({
 *   model: 'passport_xxx',
 *   messages: [
 *     { role: 'user', content: 'Explain quantum computing' }
 *   ],
 *   stream: false, // Set to true for streaming (requires different handling)
 * });
 * ```
 * 
 * 3. List Available Models
 * -------------------------
 * Note: For model listing, use models.ts which provides caching and UI transformation
 * 
 * ```typescript
 * import { getModels } from '@/lib/ai/models';
 * 
 * const models = await getModels(); // Returns ModelConfig[] with caching
 * ```
 * 
 * 4. Compute Resources (Advanced)
 * --------------------------------
 * Query available compute resources:
 * 
 * ```typescript
 * // SDK may support compute listing - check SDK docs
 * // For now, use direct fetch with getSDKBaseURL()
 * ```
 * 
 * 5. Policy-Based Routing (Advanced)
 * -----------------------------------
 * Route models to optimal compute based on policy:
 * 
 * ```typescript
 * // SDK may support routing - check SDK docs
 * // For now, use direct fetch with getSDKBaseURL()
 * ```
 * 
 * Environment Variables
 * ----------------------
 * Required:
 * - LUCID_API_BASE_URL: API endpoint (default: https://api.lucid.foundation)
 * 
 * Optional:
 * - TRUSTGATE_API_KEY: API key for authenticated requests (for private models/features)
 * 
 * Error Handling
 * --------------
 * The SDK throws errors for failed requests. Always wrap in try-catch:
 * 
 * ```typescript
 * try {
 *   const result = await lucidSDK.run.inference({ ... });
 *   // Handle success
 * } catch (error) {
 *   console.error('Inference failed:', error);
 *   // Handle error (fallback to different model, retry, etc.)
 * }
 * ```
 * 
 * For More Information
 * --------------------
 * - SDK Docs: https://github.com/raijinlabs/Lucid-L2/tree/master/sdk/raijin-labs-lucid-ai-typescript
 * - API Docs: Refer to Lucid Foundation documentation
 * - Internal Docs: See CLAUDE.md and memory-bank/ for project-specific usage
 */
