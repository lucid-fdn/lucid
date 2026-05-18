/**
 * MemoryEmbedder — Generates vector embeddings for semantic search.
 * 
 * Uses OpenAI's text-embedding-3-small (1536 dimensions) via Lucid-L2.
 * Embeddings enable similarity search to retrieve relevant memories.
 * 
 * Future: Could support other embedding models (Cohere, Voyage, etc.)
 */

interface EmbeddingConfig {
  model: string
  lucidApiUrl: string
  lucidApiKey?: string
}

export class MemoryEmbedder {
  constructor(private config: EmbeddingConfig) {}

  /**
   * Generate embedding for a single text.
   */
  async embed(text: string): Promise<number[]> {
    try {
      // Call OpenAI embeddings endpoint via Lucid-L2
      const response = await fetch(`${this.config.lucidApiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.lucidApiKey ? { 'Authorization': `Bearer ${this.config.lucidApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Embedding error (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding: number[] }>
      }

      if (!data.data || data.data.length === 0) {
        throw new Error('No embedding returned')
      }

      return data.data[0].embedding
    } catch (error) {
      console.error('[embedder] Failed to generate embedding:', error)
      throw error
    }
  }

  /**
   * Generate embeddings for multiple texts in batch.
   * More efficient than calling embed() multiple times.
   * Splits into chunks of MAX_BATCH_SIZE to stay within API limits.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return []
    }

    const MAX_BATCH_SIZE = 20

    // Split into chunks if batch is too large
    if (texts.length > MAX_BATCH_SIZE) {
      const results: number[][] = []
      for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const chunk = texts.slice(i, i + MAX_BATCH_SIZE)
        const chunkEmbeddings = await this.embedBatch(chunk)
        results.push(...chunkEmbeddings)
      }
      return results
    }

    try {
      const response = await fetch(`${this.config.lucidApiUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.lucidApiKey ? { 'Authorization': `Bearer ${this.config.lucidApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Batch embedding error (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding: number[]; index: number }>
      }

      if (!data.data || data.data.length === 0) {
        throw new Error('No embeddings returned')
      }

      // Sort by index to ensure correct order
      const sorted = data.data.sort((a, b) => a.index - b.index)
      return sorted.map(item => item.embedding)
    } catch (error) {
      console.error('[embedder] Failed to generate batch embeddings:', error)
      throw error
    }
  }

  /**
   * Compute cosine similarity between two embeddings.
   * Returns a value between -1 and 1 (higher = more similar).
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * Validate embedding dimensions.
   * text-embedding-3-small = 1536 dimensions
   */
  static validateEmbedding(embedding: number[], expectedDim: number = 1536): boolean {
    if (!Array.isArray(embedding)) {
      return false
    }

    if (embedding.length !== expectedDim) {
      console.warn(`[embedder] Invalid embedding dimension: ${embedding.length}, expected ${expectedDim}`)
      return false
    }

    // Check that all values are numbers
    return embedding.every(v => typeof v === 'number' && !isNaN(v))
  }
}