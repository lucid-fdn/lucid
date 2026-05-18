/**
 * MemoryExtractor — Extracts long-term facts from conversations.
 * 
 * Uses a smaller/cheaper model (gpt-4o-mini) to analyze conversation turns
 * and extract facts worth remembering (preferences, context, instructions).
 * 
 * Strategy modes:
 * - 'auto': Extract after every 3-5 turns
 * - 'aggressive': Extract after every turn
 * - 'conservative': Extract after every 10 turns
 * - 'off': No extraction
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ExtractedMemory {
  content: string
  category: 'fact' | 'preference' | 'instruction' | 'context'
  importance: number // 0-1
  confidence: number // 0-1
}

export interface MemoryExtractionAuditResult {
  memories: ExtractedMemory[]
  rawOutput: string | null
  error: string | null
}

interface ExtractionConfig {
  model: string
  strategy: 'auto' | 'aggressive' | 'conservative' | 'off'
  lucidApiUrl: string
}

export class MemoryExtractor {
  constructor(private config: ExtractionConfig) {}

  /**
   * Determine if we should extract memories from this conversation state.
   */
  shouldExtract(messageCount: number, strategy: string = this.config.strategy): boolean {
    if (strategy === 'off') return false

    switch (strategy) {
      case 'aggressive':
        return messageCount % 1 === 0 // Every turn
      case 'conservative':
        return messageCount % 10 === 0 // Every 10 turns
      case 'auto':
      default:
        return messageCount % 5 === 0 // Every 5 turns
    }
  }

  /**
   * Extract memories from recent conversation turns.
   * 
   * Analyzes the last N messages and identifies facts worth remembering.
   */
  async extract(
    messages: Message[],
    context?: { assistantName?: string; userId?: string }
  ): Promise<ExtractedMemory[]> {
    const result = await this.extractWithAudit(messages, context)
    return result.memories
  }

  /**
   * Extract memories and retain a bounded audit handle for durable jobs.
   * The caller decides whether/how to persist the raw model output.
   */
  async extractWithAudit(
    messages: Message[],
    context?: { assistantName?: string; userId?: string }
  ): Promise<MemoryExtractionAuditResult> {
    if (messages.length === 0) {
      return { memories: [], rawOutput: null, error: null }
    }

    // Build extraction prompt
    const extractionPrompt = this.buildExtractionPrompt(messages, context)

    try {
      // Call extraction model (via Lucid-L2 /invoke/model)
      const response = await this.callExtractionModel(extractionPrompt)

      // Parse response (expected JSON array of memories)
      const memories = this.parseExtractionResponse(response)

      return { memories, rawOutput: response, error: null }
    } catch (error) {
      console.error('[memory-extractor] Extraction failed:', error)
      return {
        memories: [],
        rawOutput: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Build the extraction prompt for the LLM.
   * Caps conversation text at 8000 chars to stay within model token limits.
   */
  private buildExtractionPrompt(messages: Message[], context?: Record<string, string>): string {
    const MAX_CONVERSATION_CHARS = 8000

    let conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    if (conversationText.length > MAX_CONVERSATION_CHARS) {
      // Keep the most recent messages (tail-truncate)
      conversationText = conversationText.slice(-MAX_CONVERSATION_CHARS)
    }

    return `You are a memory extraction system. Analyze the following conversation and extract facts worth remembering for future interactions.

${context?.assistantName ? `Assistant Name: ${context.assistantName}\n` : ''}
${context?.userId ? `User ID: ${context.userId}\n` : ''}

CONVERSATION:
${conversationText}

TASK:
Extract long-term facts from this conversation that would be useful to remember. Focus on:
- User preferences (likes, dislikes, habits)
- Personal context (name, job, location, relationships)
- Instructions or guidelines given by the user
- Important contextual information

For each fact, provide:
1. "content": The fact in a clear, concise sentence
2. "category": One of: fact, preference, instruction, context
3. "importance": 0.0-1.0 (how important is this to remember?)
4. "confidence": 0.0-1.0 (how confident are you this is accurate?)

RULES:
- Only extract facts that are likely to be relevant in future conversations
- Avoid extracting temporary information (today's weather, one-time events)
- Keep facts concise and specific
- If no facts are worth extracting, return an empty array

OUTPUT FORMAT (JSON):
[
  {
    "content": "User prefers concise responses",
    "category": "preference",
    "importance": 0.8,
    "confidence": 0.9
  }
]

Respond ONLY with valid JSON array. No explanations or markdown.`
  }

  /**
   * Call the extraction model via Lucid-L2.
   */
  private async callExtractionModel(prompt: string): Promise<string> {
    const proxyUrl = this.config.lucidApiUrl.replace(/\/v1.*$/, '')

    const response = await fetch(`${proxyUrl}/proxy/invoke/model/${this.config.model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        parameters: {
          max_tokens: 2000,
          temperature: 0.3, // Lower temperature for more consistent extraction
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Extraction model error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as { output?: string }

    return data.output || '[]'
  }

  /**
   * Parse extraction response (JSON array of memories).
   */
  private parseExtractionResponse(responseText: string): ExtractedMemory[] {
    try {
      // Strip markdown code fences if present
      let cleaned = responseText.trim()
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '')
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '')
      }

      const parsed = JSON.parse(cleaned)

      if (!Array.isArray(parsed)) {
        console.warn('[memory-extractor] Response is not an array:', parsed)
        return []
      }

      // Validate and normalize each memory
      const validated: ExtractedMemory[] = []
      for (const item of parsed) {
        if (
          typeof item === 'object' &&
          typeof item.content === 'string' &&
          item.content.trim().length > 0
        ) {
          validated.push({
            content: item.content.trim(),
            category: this.normalizeCategory(item.category),
            importance: this.clampScore(item.importance, 0.5),
            confidence: this.clampScore(item.confidence, 0.7),
          })
        }
      }

      return validated
    } catch (error) {
      console.error('[memory-extractor] Failed to parse response:', error)
      console.error('[memory-extractor] Raw response:', responseText)
      return []
    }
  }

  private normalizeCategory(category: unknown): ExtractedMemory['category'] {
    const validCategories: ExtractedMemory['category'][] = ['fact', 'preference', 'instruction', 'context']
    
    if (typeof category === 'string' && validCategories.includes(category as ExtractedMemory['category'])) {
      return category as ExtractedMemory['category']
    }
    
    return 'fact' // Default
  }

  private clampScore(score: unknown, defaultValue: number): number {
    if (typeof score === 'number' && score >= 0 && score <= 1) {
      return score
    }
    return defaultValue
  }
}
