// LucidL2Adapter - AI model adapter using Lucid-L2 proxy (Eden AI + HuggingFace)
import axios, { AxiosError } from 'axios';

export interface LucidL2Config {
  baseURL: string;           // https://api.lucid.foundation/proxy
  model?: string;            // Default: 'openai-gpt35-turbo'
  maxTokens?: number;        // Default: 150
  temperature?: number;      // Default: 0.7
}

export interface LucidL2Response {
  output: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost?: number;
}

export class LucidL2Adapter {
  private baseUrl: string;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: LucidL2Config) {
    this.baseUrl = config.baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.defaultModel = config.model || 'openai-gpt35-turbo';
    this.maxTokens = config.maxTokens || 150;
    this.temperature = config.temperature || 0.7;

    console.log('[LucidL2Adapter] Initialized', {
      baseUrl: this.baseUrl,
      defaultModel: this.defaultModel
    });
  }

  /**
   * Generate a completion from the AI model
   */
  async complete(prompt: string, model?: string): Promise<string> {
    const selectedModel = model || this.defaultModel;

    console.log('[LucidL2Adapter] Generating completion', {
      model: selectedModel,
      promptLength: prompt.length
    });

    try {
      const response = await axios.post<LucidL2Response>(
        `${this.baseUrl}/invoke/model/${selectedModel}`,
        {
          prompt,
          parameters: {
            max_tokens: this.maxTokens,
            temperature: this.temperature
          }
        },
        {
          timeout: 30000, // 30 seconds
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const output = response.data.output || '';
      
      console.log('[LucidL2Adapter] Completion generated', {
        model: selectedModel,
        outputLength: output.length,
        usage: response.data.usage,
        cost: response.data.cost
      });

      return output;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<any>;
        const errorMsg = axiosError.response?.data?.error || 
                        axiosError.response?.data?.message || 
                        axiosError.message;
        
        console.error('[LucidL2Adapter] API error', {
          model: selectedModel,
          status: axiosError.response?.status,
          error: errorMsg
        });

        throw new Error(`Lucid-L2 API error (${selectedModel}): ${errorMsg}`);
      }

      console.error('[LucidL2Adapter] Unexpected error', error);
      throw new Error(`Unexpected error: ${error}`);
    }
  }

  /**
   * Stream a completion (fallback to complete for now)
   * Note: Lucid-L2 proxy doesn't support streaming yet
   */
  async *stream(prompt: string, model?: string): AsyncIterable<string> {
    console.log('[LucidL2Adapter] Stream requested (using complete fallback)');
    
    // Fallback to complete response as single chunk
    const result = await this.complete(prompt, model);
    yield result;
  }

  /**
   * Check if the API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/`, { 
        timeout: 5000,
        validateStatus: (status: number) => status < 500 // Accept any non-500 response
      });
      
      const available = response.status >= 200 && response.status < 500;
      
      console.log('[LucidL2Adapter] Health check', {
        available,
        status: response.status
      });

      return available;
      
    } catch (error) {
      console.error('[LucidL2Adapter] Health check failed', error);
      return false;
    }
  }

  /**
   * Get the current model being used
   */
  getModel(): string {
    return this.defaultModel;
  }

  /**
   * Set a different model
   */
  setModel(model: string): void {
    console.log('[LucidL2Adapter] Switching model', {
      from: this.defaultModel,
      to: model
    });
    this.defaultModel = model;
  }
}

// Export a factory function for easy initialization
export function createLucidL2Adapter(config?: Partial<LucidL2Config>): LucidL2Adapter {
  const defaultConfig: LucidL2Config = {
    baseURL: process.env.AI_AGGREGATOR_API_BASE || 'https://api.lucid.foundation/proxy',
    model: 'openai-gpt35-turbo',
    maxTokens: 150,
    temperature: 0.7,
    ...config
  };

  return new LucidL2Adapter(defaultConfig);
}