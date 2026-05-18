/**
 * Logo Service
 * 
 * Provides smart logo resolution for AI providers using bundled SVG logos from LobeHub.
 * Automatically maps provider names to their corresponding logo files.
 */

// Provider name to logo ID mapping
const PROVIDER_MAP: Record<string, string> = {
  // Text Generation
  'openai': 'openai',
  'gpt': 'openai',
  'gpt5': 'openai',
  'gpt-4': 'openai',
  'chatgpt': 'openai',
  'anthropic': 'anthropic',
  'claude': 'anthropic',
  'google': 'google',
  'gemini': 'gemini',
  'deepmind': 'deepmind',
  'google deepmind': 'deepmind',
  'meta': 'meta',
  'mistral': 'mistral',
  'cohere': 'cohere',
  'perplexity': 'perplexity',
  'xai': 'xai',
  'groq': 'groq',
  'together': 'together',
  'together ai': 'together',
  'deepseek': 'deepseek',
  'alibaba': 'alibaba',
  'qwen': 'qwen',
  'microsoft': 'microsoft',
  
  // Image Generation
  'stability': 'stability',
  'stability ai': 'stability',
  'stable diffusion': 'stability',
  'sd3': 'stability',
  'dall-e': 'dalle',
  'dall e': 'dalle',
  'dalle': 'dalle',
  'gpt image': 'dalle',
  'midjourney': 'midjourney',
  'runway': 'runway',
  'ideogram': 'ideogram',
  'recraft': 'recraft',
  'flux': 'flux',
  'black forest labs': 'bfl',
  'bfl': 'bfl',
  'playground': 'playground',
  'playground ai': 'playground',
  'imagen': 'google',
  
  // Video Generation
  'luma': 'luma',
  'luma ai': 'luma',
  'pika': 'pika',
  'pika labs': 'pika',
  'tencent': 'tencent',
  'sora': 'sora',
  'kling': 'kling',
  'hailuo': 'hailuo',
  'vidu': 'vidu',
  'genmo': 'genmo',
  
  // Voice/Audio
  'elevenlabs': 'elevenlabs',
  'fish audio': 'fishaudio',
  'suno': 'suno',
  'suno ai': 'suno',
  'murf': 'murf',
  'murf ai': 'murf',
  
  // Platforms
  'replicate': 'replicate',
  'huggingface': 'huggingface',
  'hugging face': 'huggingface',
  'openrouter': 'openrouter',
  
  // Trading/Finance
  'alpaca': 'alpaca',
  'alpaca markets': 'alpaca',
  'jesse': 'jesse',
  'jesse ai': 'jesse',
  'trendspider': 'trendspider',
};

/**
 * Providers with color variant available
 */
const COLOR_VARIANTS = [
  'gemini', 'deepmind', 'meta', 'mistral', 'cohere', 'perplexity',
  'together', 'deepseek', 'alibaba', 'qwen', 'microsoft', 'stability',
  'dalle', 'luma', 'tencent', 'sora', 'kling', 'hailuo', 'vidu',
  'huggingface', 'google'
];

/**
 * Get the logo URL for a provider
 * @param provider - Provider name (e.g., "OpenAI", "Anthropic")
 * @param variant - Logo variant: "icon" (icon only), "text" (icon + text), "color" (colored)
 * @param fallbackUrl - Optional fallback URL if logo not found
 * @returns Logo URL (SVG)
 */
export function getProviderLogo(
  provider: string | null | undefined,
  variant: 'icon' | 'text' | 'color' = 'color',
  fallbackUrl?: string | null
): string {
  if (!provider) {
    return fallbackUrl || '/logos/placeholder.svg';
  }

  // Normalize provider name
  const normalizedProvider = provider.toLowerCase().trim();
  
  // Map to logo ID
  const logoId = PROVIDER_MAP[normalizedProvider];
  
  if (logoId) {
    // If color variant requested but not available, fallback to icon
    if (variant === 'color' && !COLOR_VARIANTS.includes(logoId)) {
      return `/logos/icon/${logoId}.svg`;
    }
    
    // Return bundled SVG logo path
    return `/logos/${variant}/${logoId}.svg`;
  }
  
  // Fallback to provided URL or placeholder
  return fallbackUrl || '/logos/placeholder.svg';
}

/**
 * Check if a provider has a bundled logo
 * @param provider - Provider name
 * @returns true if provider has a bundled logo
 */
export function hasProviderLogo(provider: string | null | undefined): boolean {
  if (!provider) return false;
  const normalizedProvider = provider.toLowerCase().trim();
  return normalizedProvider in PROVIDER_MAP;
}
