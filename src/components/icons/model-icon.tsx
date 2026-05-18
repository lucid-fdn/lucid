'use client'

/**
 * ModelIcon — Centralized AI model/provider icon component.
 *
 * Uses @lobehub/icons with two rendering strategies:
 * - Color component (brand-colored SVG) — works on any background
 * - Mono component with currentColor — adapts to dark/light via text color
 *
 * Usage:
 *   <ModelIcon model="gpt-4o" size={24} />
 *   <ModelIcon provider="Anthropic" size={20} />
 *   <ModelIcon model="lucid-auto" size={24} />
 */

import { memo, type FC, type SVGProps, type RefAttributes } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useThemeLogo } from '@/hooks/use-theme-logo'

// ── Icon type from lobehub ──────────────────────────────────────────

type IconType = FC<{ size?: number | string; className?: string; color?: string } & SVGProps<SVGSVGElement> & RefAttributes<SVGSVGElement>>

interface IconEntry {
  /** Color component (brand colors, works on any bg) */
  Color?: IconType
  /** Mono component (uses currentColor) */
  Mono: IconType
}

// ── Provider imports ────────────────────────────────────────────────
// Import both Color (when available) and Mono for each provider.
// Tree-shaking will eliminate unused components.

// Providers WITH Color component
import { default as GeminiIcon } from '@lobehub/icons/es/Gemini'
import { default as GoogleIcon } from '@lobehub/icons/es/Google'
import { default as MetaIcon } from '@lobehub/icons/es/Meta'
import { default as MistralIcon } from '@lobehub/icons/es/Mistral'
import { default as DeepSeekIcon } from '@lobehub/icons/es/DeepSeek'
import { default as CohereIcon } from '@lobehub/icons/es/Cohere'
import { default as PerplexityIcon } from '@lobehub/icons/es/Perplexity'
import { default as QwenIcon } from '@lobehub/icons/es/Qwen'
import { default as NvidiaIcon } from '@lobehub/icons/es/Nvidia'
import { default as TogetherIcon } from '@lobehub/icons/es/Together'
import { default as HuggingFaceIcon } from '@lobehub/icons/es/HuggingFace'
import { default as KimiIcon } from '@lobehub/icons/es/Kimi'
import { default as ClaudeIcon } from '@lobehub/icons/es/Claude'
import { default as AlibabaIcon } from '@lobehub/icons/es/Alibaba'
import { default as CerebrasIcon } from '@lobehub/icons/es/Cerebras'
import { default as DeepInfraIcon } from '@lobehub/icons/es/DeepInfra'
import { default as FireworksIcon } from '@lobehub/icons/es/Fireworks'
import { default as CloudflareIcon } from '@lobehub/icons/es/Cloudflare'
import { default as AwsIcon } from '@lobehub/icons/es/Aws'

// Providers with Mono only (no Color)
import { default as OpenAIIcon } from '@lobehub/icons/es/OpenAI'
import { default as AnthropicIcon } from '@lobehub/icons/es/Anthropic'
import { default as XAIIcon } from '@lobehub/icons/es/XAI'
import { default as GroqIcon } from '@lobehub/icons/es/Groq'
import { default as OpenRouterIcon } from '@lobehub/icons/es/OpenRouter'
import { default as ReplicateIcon } from '@lobehub/icons/es/Replicate'
import { default as MoonshotIcon } from '@lobehub/icons/es/Moonshot'
import { default as OllamaIcon } from '@lobehub/icons/es/Ollama'
import { default as MicrosoftIcon } from '@lobehub/icons/es/Microsoft'

// ── Build icon entries ──────────────────────────────────────────────

function entry(icon: { Color?: IconType } & IconType): IconEntry {
  return { Color: (icon as { Color?: IconType }).Color, Mono: icon }
}

const PROVIDER_ICON_MAP: Record<string, IconEntry> = {
  // With Color
  gemini: entry(GeminiIcon),
  google: entry(GoogleIcon),
  meta: entry(MetaIcon),
  mistral: entry(MistralIcon),
  mistralai: entry(MistralIcon),
  deepseek: entry(DeepSeekIcon),
  'deepseek-ai': entry(DeepSeekIcon),
  cohere: entry(CohereIcon),
  perplexity: entry(PerplexityIcon),
  qwen: entry(QwenIcon),
  nvidia: entry(NvidiaIcon),
  together: entry(TogetherIcon),
  'together ai': entry(TogetherIcon),
  huggingface: entry(HuggingFaceIcon),
  'hugging face': entry(HuggingFaceIcon),
  kimi: entry(KimiIcon),
  claude: entry(ClaudeIcon),
  alibaba: entry(AlibabaIcon),
  cerebras: entry(CerebrasIcon),
  deepinfra: entry(DeepInfraIcon),
  fireworks: entry(FireworksIcon),
  cloudflare: entry(CloudflareIcon),
  aws: entry(AwsIcon),
  amazon: entry(AwsIcon),

  // Mono only
  openai: entry(OpenAIIcon),
  anthropic: entry(AnthropicIcon),
  xai: entry(XAIIcon),
  grok: entry(XAIIcon),
  groq: entry(GroqIcon),
  openrouter: entry(OpenRouterIcon),
  replicate: entry(ReplicateIcon),
  moonshot: entry(MoonshotIcon),
  moonshotai: entry(MoonshotIcon),
  ollama: entry(OllamaIcon),
  microsoft: entry(MicrosoftIcon),
}

/**
 * Model ID prefix → provider mapping for auto-detection.
 */
const MODEL_PREFIX_MAP: [RegExp, string][] = [
  [/^gpt-|^o[1-9]-|^chatgpt-/i, 'openai'],
  [/^claude-/i, 'claude'],
  [/^gemini-/i, 'gemini'],
  [/^llama|^meta-llama/i, 'meta'],
  [/^mistral|^mixtral|^codestral|^pixtral/i, 'mistral'],
  [/^deepseek/i, 'deepseek'],
  [/^command/i, 'cohere'],
  [/^grok-/i, 'xai'],
  [/^qwen/i, 'qwen'],
  [/^phi-/i, 'microsoft'],
  [/^nemotron|^nvidia/i, 'nvidia'],
  [/^pplx-/i, 'perplexity'],
  [/^kimi/i, 'kimi'],
  [/^moonshot/i, 'moonshot'],
]

function resolveIcon(model?: string, provider?: string): IconEntry | null {
  if (provider) {
    const key = provider.toLowerCase().trim()
    if (PROVIDER_ICON_MAP[key]) return PROVIDER_ICON_MAP[key]
  }

  if (model) {
    const normalized = model.toLowerCase()
    // Check if model ID contains a known provider name
    for (const [providerKey, icon] of Object.entries(PROVIDER_ICON_MAP)) {
      if (normalized.includes(providerKey)) return icon
    }
    // Regex patterns on the basename
    const basename = normalized.split('/').pop() || normalized
    for (const [pattern, providerKey] of MODEL_PREFIX_MAP) {
      if (pattern.test(basename)) return PROVIDER_ICON_MAP[providerKey]
    }
  }

  return null
}

// ── Public component ────────────────────────────────────────────────

export interface ModelIconProps {
  /** Model ID (e.g. "gpt-4o", "claude-3-opus", "lucid-auto") */
  model?: string
  /** Provider name override (e.g. "OpenAI", "Anthropic") */
  provider?: string
  /** Icon size in pixels */
  size?: number
  className?: string
}

export const ModelIcon = memo(function ModelIcon({
  model,
  provider,
  size = 20,
  className,
}: ModelIconProps) {
  const { logo } = useThemeLogo()

  // Lucid Auto → Lucid logo
  if (model === 'lucid-auto') {
    return (
      <span
        className={cn('inline-flex shrink-0', className)}
        style={{ width: size, height: size }}
      >
        <Image
          src={logo}
          alt="Lucid Auto"
          width={size}
          height={size}
          className="rounded-sm object-contain"
        />
      </span>
    )
  }

  const iconEntry = resolveIcon(model, provider)

  if (iconEntry) {
    // Prefer Color (brand-colored, works on any background)
    // Fall back to Mono (uses currentColor — adapts to dark/light theme)
    const IconComponent = iconEntry.Color || iconEntry.Mono
    return (
      <span className={cn('inline-flex shrink-0', className)}>
        <IconComponent size={size} />
      </span>
    )
  }

  // Fallback: 2-letter badge
  const label = provider || model?.split('/').pop()?.split('-')[0] || '?'
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-sm bg-muted text-[10px] font-semibold text-muted-foreground shrink-0',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  )
})
