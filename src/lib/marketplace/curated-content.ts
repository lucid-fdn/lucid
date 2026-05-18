/**
 * Curated Content for Marketplace
 * 
 * Industry Standard: Hard-code trending/popular content for MVP
 * Examples: Netflix, Apple TV+, Spotify all use editorial curation initially
 * 
 * This file contains hand-picked asset IDs and query configurations
 * for featured sections on the /explore landing page.
 */

export interface CuratedSection {
  /** Asset IDs to feature (fetched from marketplace) */
  ids?: string[];
  /** Sort parameter for dynamic sections */
  sort?: 'downloads' | 'created_at' | 'rating';
  /** Asset type filter */
  kind?: 'MODEL' | 'DATASET' | 'CONNECTOR' | 'AGENT' | 'APP' | 'COMPUTE';
  /** Maximum items to show */
  limit?: number;
  /** Static models (hard-coded with full data) */
  models?: CuratedModel[];
}

export interface CuratedModel {
  [key: string]: unknown;
  id: string;
  slug?: string;
  external_id: string;
  name: string;
  kind: 'MODEL';
  provider: string;
  description: string;
  tags: string[];
  icon_url?: string;
  logo_url?: string;
  metadata?: {
    banner_url?: string;
    parameters?: string;
    context_window?: string;
    [key: string]: unknown;
  };
}


/**
 * Text Generation Models
 * Best LLMs for chat, writing, and reasoning
 */
export const TEXT_GENERATION_MODELS: CuratedModel[] = [
  {
    id: 'text-gpt5',
    external_id: 'openai/gpt-5',
    name: 'GPT-5',
    kind: 'MODEL',
    provider: 'OpenAI / Replicate',
    description: 'The most capable model ever. Advanced reasoning, tool use, and memory for multi-step tasks.',
    tags: ['reasoning', 'multimodal', 'flagship', 'agentic'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'General Intelligence',
      hype_factor: 'OpenAI\'s Flagship',
      banner_url: '/dashboard/cards/gpt.webp' // Add image or video URL here (supports .jpg, .png, .mp4, .webm)
    }
  },
  {
    id: 'text-claude35-sonnet',
    external_id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    kind: 'MODEL',
    provider: 'Claude.ai / OpenRouter',
    description: 'Ethical, structured, and safe. 200K context for long stories, PDFs, and safe family use.',
    tags: ['ethical', 'long-context', 'writing', 'safe'],
    icon_url: '/logos/icon/anthropic.svg',
    logo_url: '/logos/icon/anthropic.svg',
    metadata: {
      specialty: 'Structured Writing',
      hype_factor: 'Most Trusted AI',
      banner_url: '/dashboard/cards/claude.webp' // Add image or video URL here (supports .jpg, .png, .mp4, .webm)
    }
  },
  {
    id: 'text-gemini2',
    external_id: 'google/gemini-2.0',
    name: 'Gemini 2.0',
    kind: 'MODEL',
    provider: 'Google / OpenRouter',
    description: '1M token context, real-time web, and native multimodal. Powers Google Search and Gmail.',
    tags: ['multimodal', 'search', 'long-context', 'on-device'],
    icon_url: '/logos/color/gemini.svg',
    logo_url: '/logos/color/gemini.svg',
    metadata: {
      specialty: 'Real-Time Knowledge',
      hype_factor: 'Google-Powered',
      banner_url: '/dashboard/cards/gemini.webp' // Add image or video URL here (supports .jpg, .png, .mp4, .webm)
    }
  },
  {
    id: 'text-llama31-70b',
    external_id: 'meta-llama/Meta-Llama-3.1-70B',
    name: 'Llama 3.1 70B',
    kind: 'MODEL',
    provider: 'Groq / Hugging Face',
    description: 'Open-source powerhouse. Fast, free, and runs everywhere. 250 tokens/sec on Groq.',
    tags: ['open-source', 'fast', 'free', 'scalable'],
    icon_url: '/logos/icon/groq.svg',
    logo_url: '/logos/icon/groq.svg',
    metadata: {
      specialty: 'Open-Source Speed',
      hype_factor: 'Fastest Free LLM',
      banner_url: '/dashboard/cards/llama.webp'
    }
  },
  {
    id: 'text-mistral-large2',
    external_id: 'mistralai/Mistral-Large-2',
    name: 'Mistral Large 2',
    kind: 'MODEL',
    provider: 'Le Chat / Groq',
    description: '123B params, fluent in 80+ languages. Feels lightweight but powerful. Instant replies.',
    tags: ['multilingual', 'fast', 'european', 'lightweight'],
    icon_url: '/logos/color/mistral.svg',
    logo_url: '/logos/color/mistral.svg',
    metadata: {
      specialty: 'Multilingual Fluency',
      hype_factor: 'Europe\'s GPT Killer',
      banner_url: '/dashboard/cards/mistral.webp'
    }
  },
  {
    id: 'text-grok4',
    external_id: 'xai/grok-4',
    name: 'Grok 4',
    kind: 'MODEL',
    provider: 'x.com / Groq',
    description: 'Witty, uncensored, and real-time. Built by xAI. Perfect for fun and bold ideas.',
    tags: ['fun', 'uncensored', 'real-time', 'xai'],
    icon_url: '/logos/icon/xai.svg',
    logo_url: '/logos/icon/xai.svg',
    metadata: {
      specialty: 'Personality AI',
      hype_factor: 'Elon\'s AI',
      banner_url: '/dashboard/cards/grok.webp'
    }
  },
  {
    id: 'text-deepseek-r1',
    external_id: 'deepseek-ai/DeepSeek-R1',
    name: 'DeepSeek-R1',
    kind: 'MODEL',
    provider: 'Hugging Face / Together AI',
    description: 'Math, logic, and coding master. Open-source and beats GPT-4 on STEM tasks.',
    tags: ['math', 'logic', 'coding', 'open-source'],
    icon_url: '/logos/color/deepseek.svg',
    logo_url: '/logos/color/deepseek.svg',
    metadata: {
      specialty: 'STEM Reasoning',
      hype_factor: 'Best Open-Source Coder',
      banner_url: '/dashboard/cards/deepseek.webp'
    }
  },
  {
    id: 'text-qwen25',
    external_id: 'Qwen/Qwen2.5-72B',
    name: 'Qwen 2.5',
    kind: 'MODEL',
    provider: 'Alibaba Cloud / Hugging Face',
    description: 'Best non-English LLM. Fluent in Chinese, Arabic, and 100+ languages.',
    tags: ['multilingual', 'chinese', 'open-source', 'global'],
    icon_url: '/logos/color/alibaba.svg',
    logo_url: '/logos/color/alibaba.svg',
    metadata: {
      specialty: 'Global Languages',
      hype_factor: 'China\'s #1 LLM',
      banner_url: '/dashboard/cards/qwen.webp'
    }
  },
  {
    id: 'text-command-r-plus',
    external_id: 'cohere/command-r-plus',
    name: 'Command R+',
    kind: 'MODEL',
    provider: 'OpenRouter',
    description: 'Tool use, citations, and enterprise-ready. Perfect for research and automation.',
    tags: ['tools', 'citations', 'enterprise', 'reliable'],
    icon_url: '/logos/icon/openrouter.svg',
    logo_url: '/logos/icon/openrouter.svg',
    metadata: {
      specialty: 'Tool-Augmented AI',
      hype_factor: 'Most Reliable Agent',
      banner_url: '/dashboard/cards/CMDR.webp'
    }
  },
  {
    id: 'text-phi4',
    external_id: 'microsoft/Phi-4',
    name: 'Phi-4',
    kind: 'MODEL',
    provider: 'Hugging Face',
    description: 'Runs on your phone. Tiny, fast, and private. Microsoft\'s on-device AI.',
    tags: ['on-device', 'privacy', 'lightweight', 'mobile'],
    icon_url: '/logos/color/huggingface.svg',
    logo_url: '/logos/color/huggingface.svg',
    metadata: {
      specialty: 'Mobile AI',
      hype_factor: 'AI on Your Phone',
      banner_url: '/dashboard/cards/phi4.webp'
    }
  }
];

/**
 * Image Generation Models
 * Best models for creating images from text
 */
export const IMAGE_GENERATION_MODELS: CuratedModel[] = [
  {
    id: 'image-gpt-image1',
    external_id: 'openai/gpt-image-1',
    name: 'gpt-image-1',
    kind: 'MODEL',
    provider: 'OpenAI / Replicate',
    description: 'OpenAI\'s latest image generator. Beats DALL-E 3 in realism and prompt following.',
    tags: ['image', 'photorealism', 'openai', 'api'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Image Generation',
      hype_factor: 'DALL-E Successor',
      banner_url: '/dashboard/cards/gpt.webp'
    }
  },
  {
    id: 'image-dalle3',
    external_id: 'openai/dall-e-3',
    name: 'DALL-E 3',
    kind: 'MODEL',
    provider: 'ChatGPT / Replicate',
    description: 'Text-to-image with perfect prompt adherence. Safe, commercial-ready.',
    tags: ['image', 'creative', 'safe', 'commercial'],
    icon_url: '/logos/color/dalle.svg',
    logo_url: '/logos/color/dalle.svg',
    metadata: {
      specialty: 'Creative Art',
      hype_factor: 'Most Used Image AI',
      banner_url: '/dashboard/cards/dalle.webp'
    }
  },
  {
    id: 'image-sdxl',
    external_id: 'stability-ai/sdxl',
    name: 'Stable Diffusion XL',
    kind: 'MODEL',
    provider: 'Replicate / Hugging Face',
    description: 'Open-source image king. Customizable, fast, and free to self-host.',
    tags: ['open-source', 'image', 'custom', 'free'],
    icon_url: '/logos/color/stability.svg',
    logo_url: '/logos/color/stability.svg',
    metadata: {
      specialty: 'Custom Art',
      hype_factor: 'Community Favorite',
      banner_url: '/dashboard/cards/stablediffusion.webp'
    }
  },
  {
    id: 'image-flux1-pro',
    external_id: 'black-forest-labs/flux-pro',
    name: 'Flux.1 Pro',
    kind: 'MODEL',
    provider: 'Replicate / Together AI',
    description: 'Photorealism + text rendering. 12B params, but fast and unrestricted.',
    tags: ['photorealism', 'text', 'fast', 'pro'],
    icon_url: '/logos/icon/flux.svg',
    logo_url: '/logos/icon/flux.svg',
    metadata: {
      specialty: 'Photorealistic Art',
      hype_factor: 'New Image Leader',
      banner_url: '/dashboard/cards/flux.webp'
    }
  },
  {
    id: 'image-ideogram2',
    external_id: 'ideogram-ai/ideogram-2.0',
    name: 'Ideogram 2.0',
    kind: 'MODEL',
    provider: 'Replicate / OpenRouter',
    description: 'Best for text in images. Logos, signs, and creative typography.',
    tags: ['text', 'logos', 'design', 'creative'],
    icon_url: '/logos/icon/ideogram.svg',
    logo_url: '/logos/icon/ideogram.svg',
    metadata: {
      specialty: 'Typography Art',
      hype_factor: 'Text-in-Image King',
      banner_url: '/dashboard/cards/ideogram.webp'
    }
  },
  {
    id: 'image-imagen3',
    external_id: 'google/imagen-3',
    name: 'Imagen 3',
    kind: 'MODEL',
    provider: 'Google Vertex / Replicate',
    description: 'High-res realism with safety. Google\'s answer to DALL-E.',
    tags: ['realism', 'safe', 'google', 'high-res'],
    icon_url: '/logos/color/google.svg',
    logo_url: '/logos/color/google.svg',
    metadata: {
      specialty: 'Safe Realism',
      hype_factor: 'Google\'s Image AI',
      banner_url: '/dashboard/cards/imagen3.webp'
    }
  },
  {
    id: 'image-playground-v3',
    external_id: 'playground-ai/playground-v3',
    name: 'Playground V3',
    kind: 'MODEL',
    provider: 'Playground.com / Replicate',
    description: 'Sliders for style control. Community-driven and fun.',
    tags: ['creative', 'sliders', 'community', 'fun'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Style Control',
      hype_factor: 'Most Playful',
    }
  },
  {
    id: 'image-kandinsky3',
    external_id: 'sber-ai/kandinsky-3',
    name: 'Kandinsky 3',
    kind: 'MODEL',
    provider: 'Hugging Face',
    description: 'Free open-source art. Great for non-English and artistic styles.',
    tags: ['artistic', 'free', 'open-source', 'multilingual'],
    icon_url: '/logos/color/huggingface.svg',
    logo_url: '/logos/color/huggingface.svg',
    metadata: {
      specialty: 'Artistic Freedom',
      hype_factor: 'Free Creativity',
      banner_url: '/dashboard/cards/kandiski.webp'
    }
  },
  {
    id: 'image-recraft-v3',
    external_id: 'recraft-ai/recraft-v3',
    name: 'Recraft V3',
    kind: 'MODEL',
    provider: 'Replicate',
    description: 'Vector + raster. Top for character consistency and realism.',
    tags: ['vector', 'characters', 'realism', 'design'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Character Design',
      hype_factor: 'Vector Power',
      banner_url: '/dashboard/cards/recraft.webp'
    }
  },
  {
    id: 'image-sd3-medium',
    external_id: 'stability-ai/sd3-medium',
    name: 'SD3 Medium',
    kind: 'MODEL',
    provider: 'Replicate / Hugging Face',
    description: '1B params. Fast, balanced, and open for local/cloud use.',
    tags: ['fast', 'balanced', 'open', 'lightweight'],
    icon_url: '/logos/color/stability.svg',
    logo_url: '/logos/color/stability.svg',
    metadata: {
      specialty: 'Speed & Quality',
      hype_factor: 'Best Compact Model',
      banner_url: '/dashboard/cards/stablediffusion.webp'
    }
  }
];

/**
 * Video Generation Models
 * Best models for creating videos from text
 */
export const VIDEO_GENERATION_MODELS: CuratedModel[] = [
  {
    id: 'video-sora',
    external_id: 'openai/sora',
    name: 'Sora',
    kind: 'MODEL',
    provider: 'OpenAI',
    description: 'OpenAI\'s revolutionary video AI. Create 60-second videos with complex scenes, camera motion, and emotion.',
    tags: ['video', 'text-to-video', 'cinematic', 'revolutionary'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Cinematic Video',
      hype_factor: 'Hollywood-Level',
      banner_url: '/dashboard/cards/sora.mp4' // Add image or video URL here (supports .jpg, .png, .mp4, .webm)
    }
  },
  {
    id: 'video-veo3',
    external_id: 'google/veo-3',
    name: 'Veo 3',
    kind: 'MODEL',
    provider: 'Google DeepMind',
    description: 'Google\'s latest video model. 4K resolution, precise motion control, and realistic physics.',
    tags: ['video', '4k', 'physics', 'google'],
    icon_url: '/logos/color/deepmind.svg',
    logo_url: '/logos/color/deepmind.svg',
    metadata: {
      specialty: '4K Video',
      hype_factor: 'Google\'s Best',
      banner_url: '/dashboard/cards/veo.mp4'
    }
  },
  {
    id: 'video-runway-gen3',
    external_id: 'runway/gen-3',
    name: 'Runway Gen-3',
    kind: 'MODEL',
    provider: 'Runway',
    description: 'Professional video generation for creators. Fast, controllable, and used by filmmakers worldwide.',
    tags: ['video', 'professional', 'filmmaking', 'fast'],
    icon_url: '/logos/icon/runway.svg',
    logo_url: '/logos/icon/runway.svg',
    metadata: {
      specialty: 'Pro Video',
      hype_factor: 'Creator Favorite'
    }
  },
  {
    id: 'video-luma-dream',
    external_id: 'luma/dream-machine',
    name: 'Luma Dream Machine',
    kind: 'MODEL',
    provider: 'Luma AI',
    description: 'Instant video generation from text. 5-second clips in 120 seconds. Perfect for quick content.',
    tags: ['video', 'instant', 'fast', 'social'],
    icon_url: '/logos/color/luma.svg',
    logo_url: '/logos/color/luma.svg',
    metadata: {
      specialty: 'Fast Video',
      hype_factor: 'Social Media King'
    }
  },
  {
    id: 'video-pika2',
    external_id: 'pika/pika-2.0',
    name: 'Pika 2.0',
    kind: 'MODEL',
    provider: 'Pika Labs',
    description: 'Cinematic effects and camera movements. Turn ideas into movie scenes with studio-quality effects.',
    tags: ['video', 'cinematic', 'effects', 'professional'],
    icon_url: '/logos/icon/pika.svg',
    logo_url: '/logos/icon/pika.svg',
    metadata: {
      specialty: 'Cinematic Effects',
      hype_factor: 'Movie Magic'
    }
  },
  {
    id: 'video-kling2',
    external_id: 'kuaishou/kling-2.0',
    name: 'Kling 2.0',
    kind: 'MODEL',
    provider: 'Kuaishou (China)',
    description: 'China\'s answer to Sora. 2-minute videos with advanced physics and realistic motion.',
    tags: ['video', 'long-form', 'physics', 'chinese'],
    icon_url: '/logos/color/kling.svg',
    logo_url: '/logos/color/kling.svg',
    metadata: {
      specialty: 'Long Videos',
      hype_factor: 'Sora Rival'
    }
  },
  {
    id: 'video-hailuo-minimax',
    external_id: 'minimax/hailuo',
    name: 'Hailuo (MiniMax)',
    kind: 'MODEL',
    provider: 'MiniMax',
    description: '6-second video clips with photorealistic quality. Open-source and free to use.',
    tags: ['video', 'open-source', 'free', 'photorealistic'],
    icon_url: '/logos/color/hailuo.svg',
    logo_url: '/logos/color/hailuo.svg',
    metadata: {
      specialty: 'Free Video',
      hype_factor: 'Open Source'
    }
  },
  {
    id: 'video-vidu',
    external_id: 'shengshu/vidu',
    name: 'Vidu',
    kind: 'MODEL',
    provider: 'Shengshu (China)',
    description: '16-second 1080p videos. Strong on Chinese subjects and cultural content.',
    tags: ['video', '1080p', 'chinese', 'cultural'],
    icon_url: '/logos/color/vidu.svg',
    logo_url: '/logos/color/vidu.svg',
    metadata: {
      specialty: 'Cultural Video',
      hype_factor: 'China\'s Top'
    }
  },
  {
    id: 'video-genmo-mochi',
    external_id: 'genmo/mochi',
    name: 'Genmo Mochi',
    kind: 'MODEL',
    provider: 'Genmo',
    description: 'Asymmetric video diffusion. Create smooth 5-second loops perfect for backgrounds.',
    tags: ['video', 'loops', 'smooth', 'backgrounds'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Video Loops',
      hype_factor: 'Smooth Motion'
    }
  },
  {
    id: 'video-videocrafter2',
    external_id: 'tencent/videocrafter2',
    name: 'VideoCrafter2',
    kind: 'MODEL',
    provider: 'Tencent',
    description: 'Open-source video generation. Customizable, extendable, and great for research.',
    tags: ['video', 'open-source', 'research', 'customizable'],
    icon_url: '/logos/color/tencent.svg',
    logo_url: '/logos/color/tencent.svg',
    metadata: {
      specialty: 'Research',
      hype_factor: 'Open & Flexible'
    }
  }
];

/**
 * Voice & Audio Models
 * Best models for speech, music, and audio generation
 */
export const VOICE_AUDIO_MODELS: CuratedModel[] = [
  {
    id: 'voice-elevenlabs-v3',
    external_id: 'elevenlabs/eleven-multilingual-v3',
    name: 'ElevenLabs V3',
    kind: 'MODEL',
    provider: 'ElevenLabs',
    description: 'The most realistic AI voice. 29 languages, emotional range, and voice cloning. Used by professionals worldwide.',
    tags: ['voice', 'realistic', 'multilingual', 'cloning'],
    icon_url: '/logos/icon/elevenlabs.svg',
    logo_url: '/logos/icon/elevenlabs.svg',
    metadata: {
      specialty: 'Realistic Voice',
      hype_factor: 'Industry Standard',
      banner_url: '/dashboard/cards/elevenlabs.webp'
    }
  },
  {
    id: 'voice-gpt4o-voice',
    external_id: 'openai/gpt-4o-realtime',
    name: 'GPT-4o Voice',
    kind: 'MODEL',
    provider: 'OpenAI',
    description: 'Real-time voice conversations with emotion and interruptions. The future of voice AI.',
    tags: ['voice', 'real-time', 'conversational', 'emotional'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Conversational AI',
      hype_factor: 'Real-Time Voice',
      banner_url: '/dashboard/cards/gpt.webp'
    }
  },
  {
    id: 'voice-fish-speech',
    external_id: 'fishaudio/fish-speech',
    name: 'Fish Speech',
    kind: 'MODEL',
    provider: 'Fish Audio',
    description: 'Zero-shot voice cloning. Clone any voice from 10 seconds of audio. Open-source and fast.',
    tags: ['voice', 'cloning', 'zero-shot', 'open-source'],
    icon_url: '/logos/icon/fishaudio.svg',
    logo_url: '/logos/icon/fishaudio.svg',
    metadata: {
      specialty: 'Voice Cloning',
      hype_factor: 'Instant Clone',
      banner_url: '/dashboard/cards/fishspeech.webp'
    }
  },
  {
    id: 'voice-playht3',
    external_id: 'playht/playht-3.0',
    name: 'PlayHT 3.0',
    kind: 'MODEL',
    provider: 'PlayHT',
    description: 'Ultra-realistic voices with perfect pronunciation. 142 languages and custom voice training.',
    tags: ['voice', 'realistic', 'multilingual', 'custom'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Professional TTS',
      hype_factor: 'Studio Quality',
      banner_url: '/dashboard/cards/playht.webp'
    }
  },
  {
    id: 'voice-murf-ai',
    external_id: 'murf/murf-ai',
    name: 'Murf AI',
    kind: 'MODEL',
    provider: 'Murf',
    description: 'AI voiceovers for videos and presentations. 120+ voices, emphasis control, and pitch adjustment.',
    tags: ['voice', 'voiceover', 'videos', 'presentations'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Voiceovers',
      hype_factor: 'Content Creator',
      banner_url: '/dashboard/cards/murfai.webp'
    }
  },
  {
    id: 'voice-respeecher',
    external_id: 'respeecher/respeecher',
    name: 'Respeecher',
    kind: 'MODEL',
    provider: 'Respeecher',
    description: 'Hollywood-grade voice replacement. Used in movies, games, and TV shows. Ethical voice synthesis.',
    tags: ['voice', 'hollywood', 'replacement', 'ethical'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Voice Replacement',
      hype_factor: 'Hollywood Grade',
      banner_url: '/dashboard/cards/respeecher.webp'
    }
  },
  {
    id: 'voice-rvc-v2',
    external_id: 'rvc/rvc-v2',
    name: 'RVC v2',
    kind: 'MODEL',
    provider: 'Open Source',
    description: 'Real-time voice conversion. Change your voice in Discord, gaming, or streaming. Free and open.',
    tags: ['voice', 'real-time', 'conversion', 'streaming'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Real-Time Change',
      hype_factor: 'Streamer\'s Choice',
      banner_url: '/dashboard/cards/rvc.webp'
    }
  },
  {
    id: 'voice-openai-tts',
    external_id: 'openai/tts-1-hd',
    name: 'OpenAI TTS HD',
    kind: 'MODEL',
    provider: 'OpenAI',
    description: 'High-definition text-to-speech. Natural voices with emotion and clarity. API-friendly.',
    tags: ['voice', 'tts', 'hd', 'api'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'HD Voice',
      hype_factor: 'Crystal Clear',
      banner_url: '/dashboard/cards/gpt.webp'
    }
  },
  {
    id: 'voice-bark',
    external_id: 'suno/bark',
    name: 'Bark',
    kind: 'MODEL',
    provider: 'Suno AI',
    description: 'Text-to-audio with music, effects, and non-verbal sounds. Laughs, sighs, and background noise.',
    tags: ['voice', 'effects', 'music', 'creative'],
    icon_url: '/logos/icon/suno.svg',
    logo_url: '/logos/icon/suno.svg',
    metadata: {
      specialty: 'Audio Effects',
      hype_factor: 'Beyond Voice',
      banner_url: '/dashboard/cards/bark.webp'
    }
  },
  {
    id: 'voice-suno-v4',
    external_id: 'suno/suno-v4',
    name: 'Suno V4',
    kind: 'MODEL',
    provider: 'Suno AI',
    description: 'Generate complete songs with vocals and instruments. 4-minute tracks from text prompts.',
    tags: ['music', 'vocals', 'songs', 'complete'],
    icon_url: '/logos/icon/suno.svg',
    logo_url: '/logos/icon/suno.svg',
    metadata: {
      specialty: 'Full Songs',
      hype_factor: 'AI Musician',
      banner_url: '/dashboard/cards/suno.webp'
    }
  }
];

/**
 * Trading & Finance AI Models
 * Best AI models and platforms for algorithmic trading, market analysis, and quantitative strategies
 */
export const TRADING_AI_MODELS: CuratedModel[] = [
  {
    id: 'trading-deepseek-r1',
    external_id: 'deepseek-ai/DeepSeek-R1',
    name: 'DeepSeek-R1',
    kind: 'MODEL',
    provider: 'Hugging Face / Together AI / QuantConnect',
    description: 'Open-source LLM that beats GPT-4 on finance tasks. REST API for sentiment analysis, prediction; 1M+ token context. +42% CAGR in QuantConnect bots.',
    tags: ['llm', 'open-source', 'sentiment', 'crypto-signals', 'quant'],
    icon_url: '/logos/color/deepseek.svg',
    logo_url: '/logos/color/deepseek.svg',
    metadata: {
      specialty: 'Crypto Signals & News Parsing',
      hype_factor: 'Viral in 2025 Quant Communities',
      cost: '$0.16/$0.60 per 1M tokens',
      key_features: 'REST API, Python SDK, 1M+ context',
      performance: '+42% CAGR in QuantConnect',
      banner_url: '/dashboard/cards/deepseek.webp'
    }
  },
  {
    id: 'trading-fingpt-70b',
    external_id: 'fingpt/fingpt-70b',
    name: 'FinGPT-70B',
    kind: 'MODEL',
    provider: 'Hugging Face / DeepInfra',
    description: 'Finance-specialized LLM. Open API endpoints for earnings/news analysis; fine-tune via HF. Used in 70% of custom trading bots.',
    tags: ['llm', 'finance', 'sentiment', 'open-source', 'earnings'],
    icon_url: '/logos/color/huggingface.svg',
    logo_url: '/logos/color/huggingface.svg',
    metadata: {
      specialty: 'Sentiment-Based Trading Bots',
      hype_factor: 'Open-Source Finance King',
      cost: 'Free (self-host) / $0.50/M tokens',
      key_features: 'Earnings analysis, Polygon API integration',
      performance: 'Used in 70% of custom bots',
      banner_url: '/dashboard/cards/fingpt.webp'
    }
  },
  {
    id: 'trading-gpt5',
    external_id: 'openai/gpt-5',
    name: 'GPT-5 (Trading)',
    kind: 'MODEL',
    provider: 'OpenAI / Replicate / Azure',
    description: 'OpenAI\'s flagship for agentic trading bots. Tool-calling for strategy generation + execution. 500% returns in Galileo FX case study.',
    tags: ['llm', 'agentic', 'tool-calling', 'reasoning', 'dynamic'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Dynamic Risk-Adjusted Trading',
      hype_factor: 'Flagship for Agentic Bots',
      cost: '$5/$15 per 1M tokens',
      key_features: 'Tool-calling, strategy chains',
      performance: '500% returns (Galileo FX)',
      banner_url: '/dashboard/cards/gpt.webp'
    }
  },
  {
    id: 'trading-alpaca-api',
    external_id: 'alpaca/alpaca-markets',
    name: 'Alpaca API',
    kind: 'MODEL',
    provider: 'Alpaca Markets',
    description: 'Dev-favorite brokerage platform. REST/WebSocket for orders, data streaming; Python/JS SDKs. Powers 50% of Python trading bots.',
    tags: ['brokerage', 'api', 'python', 'websocket', 'commission-free'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Custom AI Bot Integration',
      hype_factor: 'Powers 50% of Python Bots',
      cost: 'Commission-free / $0.01/share',
      key_features: 'REST/WebSocket, Python/JS SDKs',
      performance: 'Industry-standard for algo trading',
      banner_url: '/dashboard/cards/alpaca.webp'
    }
  },
  {
    id: 'trading-freqtrade',
    external_id: 'freqtrade/freqtrade',
    name: 'Freqtrade',
    kind: 'MODEL',
    provider: 'GitHub / CCXT Exchanges',
    description: 'Open-source crypto bot framework. Python API for backtesting, ML model import (TensorFlow). 100k+ GitHub stars for adaptive ML bots.',
    tags: ['open-source', 'crypto', 'backtesting', 'ml', 'python'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Adaptive ML Crypto Bots',
      hype_factor: '100k+ GitHub Stars',
      cost: 'Free (self-host)',
      key_features: 'Backtesting, hyperopt, ML import',
      performance: 'Top for adaptive strategies',
      banner_url: '/dashboard/cards/freqtrade.webp'
    }
  },
  {
    id: 'trading-quantconnect',
    external_id: 'quantconnect/lean',
    name: 'QuantConnect LEAN',
    kind: 'MODEL',
    provider: 'QuantConnect / IBKR / Alpaca',
    description: 'Quant platform with 350k+ users. Cloud API for backtesting, live trading; supports PyTorch/DeepSeek. +42% CAGR community bots.',
    tags: ['quant', 'backtesting', 'ml', 'multi-asset', 'cloud'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'ML Alpha Generation',
      hype_factor: 'Best for ML Strategies',
      cost: 'Free paper / $20/mo live',
      key_features: 'PyTorch support, 350k+ users',
      performance: '+42% CAGR (community avg)',
      banner_url: '/dashboard/cards/quant.webp'
    }
  },
  {
    id: 'trading-trendspider',
    external_id: 'trendspider/trendspider-ai',
    name: 'TrendSpider AI',
    kind: 'MODEL',
    provider: 'TrendSpider',
    description: 'Visual ML builder for trading. Webhook/API for strategy automation; ML pattern recognition. 1.9 Sharpe ratio in backtests.',
    tags: ['platform', 'ml', 'patterns', 'backtesting', 'automation'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Swing/Day Trading Bots',
      hype_factor: 'Visual ML Builder',
      cost: '$39/mo (API included)',
      key_features: 'Auto-backtest 50+ yrs, webhooks',
      performance: '1.9 Sharpe ratio',
      banner_url: '/dashboard/cards/trendspider.webp'
    }
  },
  {
    id: 'trading-3commas',
    external_id: '3commas/3commas-api',
    name: '3Commas API',
    kind: 'MODEL',
    provider: '3Commas / Binance / Bybit',
    description: 'Crypto automation platform with 2M+ users. REST API for DCA/grid bots; AI signal import. Strong for no/low-code hybrids.',
    tags: ['crypto', 'dca', 'grid', 'automation', 'signals'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Crypto Automation',
      hype_factor: 'Adaptive Learning',
      cost: '$29/mo (API access)',
      key_features: 'DCA/grid bots, 2M+ users',
      performance: 'No-code bot automation',
      banner_url: '/dashboard/cards/3commas.webp'
    }
  },
  {
    id: 'trading-tradeideas-holly',
    external_id: 'tradeideas/holly-ai',
    name: 'Trade Ideas Holly',
    kind: 'MODEL',
    provider: 'Trade Ideas / eTrade+',
    description: 'AI platform for day trading. API for signals/strategies; Holly AI for entry/exit. Audited 2.8 Sharpe ratio, 68% win rate.',
    tags: ['ai', 'day-trading', 'signals', 'audited', 'intraday'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Day Trading Bots',
      hype_factor: 'Audited 2.8 Sharpe',
      cost: '$178/mo (API tier)',
      key_features: 'Holly AI, 68% win rate',
      performance: '2.8 Sharpe (audited)',
      banner_url: '/dashboard/cards/tradeideasholly.webp'
    }
  },
  {
    id: 'trading-jesse-ai',
    external_id: 'jesse-ai/jesse',
    name: 'Jesse AI',
    kind: 'MODEL',
    provider: 'Jesse / Exchange APIs',
    description: 'Open-source Python framework for quants. API for ML models; slippage/latency simulation. Excels in volatile markets with deep backtesting.',
    tags: ['open-source', 'python', 'ml', 'backtesting', 'quant'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Predictive Trading Bots',
      hype_factor: 'Pro for Quants',
      cost: 'Free (open-source)',
      key_features: 'Slippage simulation, ML models',
      performance: 'Excels in volatility',
      banner_url: '/dashboard/cards/jesseai.webp'
    }
  }
];

/**
 * Featured Datasets
 * Best datasets for training, fine-tuning, and research
 */
export const FEATURED_DATASETS: CuratedModel[] = [
  {
    id: 'dataset-imagenet',
    external_id: 'imagenet/imagenet-1k',
    name: 'ImageNet-1K',
    kind: 'MODEL',
    provider: 'Stanford / Hugging Face',
    description: '1.2M images across 1,000 categories. The gold standard for computer vision training and benchmarking.',
    tags: ['image', 'classification', 'benchmark', 'cv'],
    icon_url: '/logos/color/huggingface.svg',
    logo_url: '/logos/color/huggingface.svg',
    metadata: {
      specialty: 'Computer Vision Benchmark',
      hype_factor: 'CV Gold Standard',
      category: 'Datasets',
    }
  },
  {
    id: 'dataset-laion5b',
    external_id: 'laion/laion-5b',
    name: 'LAION-5B',
    kind: 'MODEL',
    provider: 'LAION',
    description: '5.85 billion image-text pairs. Powers Stable Diffusion, DALL-E, and most image AI models.',
    tags: ['image', 'text-to-image', 'massive', 'multimodal'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Image Generation Training',
      hype_factor: 'Powers Stable Diffusion',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-common-crawl',
    external_id: 'common-crawl/cc-main',
    name: 'Common Crawl',
    kind: 'MODEL',
    provider: 'Common Crawl Foundation',
    description: '250+ billion web pages. The internet in a dataset. Used to train GPT, LLaMA, and all major LLMs.',
    tags: ['text', 'web', 'massive', 'llm-training'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'LLM Pre-Training',
      hype_factor: 'Trains All Major LLMs',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-redpajama',
    external_id: 'togethercomputer/RedPajama-Data-v2',
    name: 'RedPajama v2',
    kind: 'MODEL',
    provider: 'Together AI',
    description: '30T tokens of high-quality text. Open reproduction of LLaMA training data. Free for commercial use.',
    tags: ['text', 'open-source', 'llm-training', 'commercial'],
    icon_url: '/logos/color/together.svg',
    logo_url: '/logos/color/together.svg',
    metadata: {
      specialty: 'Open LLM Training',
      hype_factor: 'Open LLaMA Dataset',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-the-pile',
    external_id: 'eleutherai/the-pile',
    name: 'The Pile',
    kind: 'MODEL',
    provider: 'EleutherAI',
    description: '825GB of diverse text from 22 sources. Academic papers, books, code, and more. Trained GPT-NeoX.',
    tags: ['text', 'diverse', 'academic', 'open-source'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Diverse LLM Training',
      hype_factor: 'Most Diverse Dataset',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-coco',
    external_id: 'coco/coco-2017',
    name: 'COCO Dataset',
    kind: 'MODEL',
    provider: 'Microsoft',
    description: '330K images with 80 object categories. Industry standard for object detection and segmentation.',
    tags: ['image', 'object-detection', 'segmentation', 'benchmark'],
    icon_url: '/logos/color/microsoft.svg',
    logo_url: '/logos/color/microsoft.svg',
    metadata: {
      specialty: 'Object Detection',
      hype_factor: 'Detection Standard',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-openwebtext',
    external_id: 'openwebtext/openwebtext',
    name: 'OpenWebText',
    kind: 'MODEL',
    provider: 'OpenAI / EleutherAI',
    description: '40GB of web text from Reddit links. Open recreation of GPT-2\'s training data.',
    tags: ['text', 'web', 'reddit', 'gpt'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Web Text Training',
      hype_factor: 'GPT-2 Recreation',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-wikitext',
    external_id: 'wikitext/wikitext-103',
    name: 'WikiText-103',
    kind: 'MODEL',
    provider: 'Salesforce',
    description: '100M tokens from Wikipedia. Clean, high-quality text for language modeling.',
    tags: ['text', 'wikipedia', 'clean', 'language-modeling'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Clean Text Training',
      hype_factor: 'Quality Over Quantity',
      category: 'Datasets',
    }
  },
  {
    id: 'dataset-kinetics',
    external_id: 'deepmind/kinetics-700',
    name: 'Kinetics-700',
    kind: 'MODEL',
    provider: 'DeepMind',
    description: '650K video clips across 700 human action categories. Powers video understanding models.',
    tags: ['video', 'action-recognition', 'temporal', 'benchmark'],
    icon_url: '/logos/color/deepmind.svg',
    logo_url: '/logos/color/deepmind.svg',
    metadata: {
      specialty: 'Video Action Recognition',
      hype_factor: 'Video Understanding',
      category: 'Datasets'
    }
  },
  {
    id: 'dataset-librispeech',
    external_id: 'librispeech/librispeech',
    name: 'LibriSpeech',
    kind: 'MODEL',
    provider: 'OpenSLR',
    description: '1,000 hours of English speech from audiobooks. The standard for speech recognition training.',
    tags: ['audio', 'speech', 'asr', 'benchmark'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'Speech Recognition',
      hype_factor: 'ASR Standard',
      category: 'Datasets'
    }
  }
];

/**
 * Recommended Models - Best from Each Category
 * Curated selection of top-performing models across all categories
 */
export const RECOMMENDED_MODELS: CuratedModel[] = [
  // Trading - DeepSeek-R1 (as specified)
  {
    id: 'trading-deepseek-r1',
    slug: 'trading-deepseek-r1',
    external_id: 'deepseek-ai/DeepSeek-R1',
    name: 'DeepSeek-R1',
    kind: 'MODEL',
    provider: 'Hugging Face / Together AI / QuantConnect',
    description: 'Open-source LLM that beats GPT-4 on finance tasks. REST API for sentiment analysis, prediction; 1M+ token context. +42% CAGR in QuantConnect bots.',
    tags: ['llm', 'open-source', 'sentiment', 'crypto-signals', 'quant'],
    icon_url: '/logos/color/deepseek.svg',
    logo_url: '/logos/color/deepseek.svg',
    metadata: {
      specialty: 'Crypto Signals & News Parsing',
      hype_factor: 'Viral in 2025 Quant Communities',
      cost: '$0.16/$0.60 per 1M tokens',
      category: 'Trading & Finance',
      banner_url: '/dashboard/cards/quant.webp'
    }
  },
  // Text - GPT-5
  {
    id: 'text-gpt5',
    slug: 'text-gpt5',
    external_id: 'openai/gpt-5',
    name: 'GPT-5',
    kind: 'MODEL',
    provider: 'OpenAI / Replicate',
    description: 'The most capable model ever. Advanced reasoning, tool use, and memory for multi-step tasks.',
    tags: ['reasoning', 'multimodal', 'flagship', 'agentic'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'General Intelligence',
      hype_factor: 'OpenAI\'s Flagship',
      category: 'Text Generation',
      banner_url: '/dashboard/cards/gpt.webp'
    }
  },
  // Video - Sora
  {
    id: 'video-sora',
    slug: 'video-sora',
    external_id: 'openai/sora',
    name: 'Sora 2',
    kind: 'MODEL',
    provider: 'OpenAI',
    description: 'OpenAI\'s revolutionary video AI. Create 60-second videos with complex scenes, camera motion, and emotion.',
    tags: ['video', 'text-to-video', 'cinematic', 'revolutionary'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Cinematic Video',
      hype_factor: 'Hollywood-Level',
      category: 'Video Generation',
      banner_url: '/dashboard/cards/sora.mp4'
    }
  },
  // Video - Veo 3 (as requested)
  {
    id: 'video-veo3',
    slug: 'video-veo3',
    external_id: 'google/veo-3',
    name: 'Veo 3',
    kind: 'MODEL',
    provider: 'Google DeepMind',
    description: 'Google\'s latest video model. 4K resolution, precise motion control, and realistic physics.',
    tags: ['video', '4k', 'physics', 'google'],
    icon_url: '/logos/color/deepmind.svg',
    logo_url: '/logos/color/deepmind.svg',
    metadata: {
      specialty: '4K Video',
      hype_factor: 'Google\'s Best',
      category: 'Video Generation',
      banner_url: '/dashboard/cards/veo.mp4'
    }
  },
  // Text - Claude 3.5 Sonnet
  {
    id: 'text-claude35-sonnet',
    slug: 'text-claude35-sonnet',
    external_id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    kind: 'MODEL',
    provider: 'Claude.ai / OpenRouter',
    description: 'Ethical, structured, and safe. 200K context for long stories, PDFs, and safe family use.',
    tags: ['ethical', 'long-context', 'writing', 'safe'],
    icon_url: '/logos/icon/anthropic.svg',
    logo_url: '/logos/icon/anthropic.svg',
    metadata: {
      specialty: 'Structured Writing',
      hype_factor: 'Most Trusted AI',
      category: 'Text Generation',
      banner_url: '/dashboard/cards/claude.webp'
    }
  },
  // Trading - QuantConnect LEAN
  {
    id: 'trading-quantconnect',
    slug: 'trading-quantconnect',
    external_id: 'quantconnect/lean',
    name: 'QuantConnect LEAN',
    kind: 'MODEL',
    provider: 'QuantConnect / IBKR / Alpaca',
    description: 'Quant platform with 350k+ users. Cloud API for backtesting, live trading; supports PyTorch/DeepSeek. +42% CAGR community bots.',
    tags: ['quant', 'backtesting', 'ml', 'multi-asset', 'cloud'],
    icon_url: '/logos/icon/replicate.svg',
    logo_url: '/logos/icon/replicate.svg',
    metadata: {
      specialty: 'ML Alpha Generation',
      hype_factor: 'Best for ML Strategies',
      cost: 'Free paper / $20/mo live',
      category: 'Trading & Finance',
      banner_url: '/dashboard/cards/quant.webp'
    }
  },
  // Image - gpt-image-1
  {
    id: 'image-gpt-image1',
    slug: 'image-gpt-image1',
    external_id: 'openai/gpt-image-1',
    name: 'gpt-image-1',
    kind: 'MODEL',
    provider: 'OpenAI / Replicate',
    description: 'OpenAI\'s latest image generator. Beats DALL-E 3 in realism and prompt following.',
    tags: ['image', 'photorealism', 'openai', 'api'],
    icon_url: '/logos/icon/openai.svg',
    logo_url: '/logos/icon/openai.svg',
    metadata: {
      specialty: 'Image Generation',
      hype_factor: 'DALL-E Successor',
      category: 'Image Generation',
      banner_url: '/dashboard/cards/dalle.webp'
    }
  },
  // Voice - ElevenLabs V3
  {
    id: 'voice-elevenlabs-v3',
    slug: 'voice-elevenlabs-v3',
    external_id: 'elevenlabs/eleven-multilingual-v3',
    name: 'ElevenLabs V3',
    kind: 'MODEL',
    provider: 'ElevenLabs',
    description: 'The most realistic AI voice. 29 languages, emotional range, and voice cloning. Used by professionals worldwide.',
    tags: ['voice', 'realistic', 'multilingual', 'cloning'],
    icon_url: '/logos/icon/elevenlabs.svg',
    logo_url: '/logos/icon/elevenlabs.svg',
    metadata: {
      specialty: 'Realistic Voice',
      hype_factor: 'Industry Standard',
      category: 'Voice & Audio',
      banner_url: '/dashboard/cards/elevenlabs.webp'
    }
  },
  // Image - Flux.1 Pro
  {
    id: 'image-flux1-pro',
    slug: 'image-flux1-pro',
    external_id: 'black-forest-labs/flux-pro',
    name: 'Flux.1 Pro',
    kind: 'MODEL',
    provider: 'Replicate / Together AI',
    description: 'Photorealism + text rendering. 12B params, but fast and unrestricted.',
    tags: ['photorealism', 'text', 'fast', 'pro'],
    icon_url: '/logos/icon/flux.svg',
    logo_url: '/logos/icon/flux.svg',
    metadata: {
      specialty: 'Photorealistic Art',
      hype_factor: 'New Image Leader',
      category: 'Image Generation',
      banner_url: '/dashboard/cards/flux.webp'
    }
  },
  // Text - Gemini 2.0
  {
    id: 'text-gemini2',
    slug: 'text-gemini2',
    external_id: 'google/gemini-2.0',
    name: 'Gemini 2.0',
    kind: 'MODEL',
    provider: 'Google / OpenRouter',
    description: '1M token context, real-time web, and native multimodal. Powers Google Search and Gmail.',
    tags: ['multimodal', 'search', 'long-context', 'on-device'],
    icon_url: '/logos/color/gemini.svg',
    logo_url: '/logos/color/gemini.svg',
    metadata: {
      specialty: 'Real-Time Knowledge',
      hype_factor: 'Google-Powered',
      category: 'Text Generation',
      banner_url: '/dashboard/cards/gemini.webp'
    }
  }
];

/**
 * Web3/Crypto Connectors (Marketing Placeholders)
 * Show capability roadmap - not yet functional
 */
export const WEB3_CONNECTORS: CuratedModel[] = [
  {
    id: 'nodes-base.hyperliquid',
    external_id: 'nodes-base.hyperliquid',
    name: 'Hyperliquid',
    kind: 'MODEL', // Using MODEL type as placeholder
    provider: 'Hyperliquid',
    description: 'Decentralized perpetual exchange. Execute trades, manage positions, and monitor liquidity.',
    tags: ['web3', 'defi', 'trading', 'perps'],
    icon_url: '/logos/icon/hyperliquid.png',
    logo_url: '/logos/icon/hyperliquid.png',
  },
  {
    id: 'nodes-base.polymarket',
    external_id: 'nodes-base.polymarket',
    name: 'Polymarket',
    kind: 'MODEL',
    provider: 'Polymarket',
    description: 'Prediction markets on Polygon. Trade event outcomes and access market data.',
    tags: ['web3', 'prediction', 'polygon', 'markets'],
    icon_url: '/logos/icon/polymarket.png',
    logo_url: '/logos/icon/polymarket.png',
  },
  {
    id: 'nodes-base.solana',
    external_id: 'nodes-base.solana',
    name: 'Solana',
    kind: 'MODEL',
    provider: 'Solana',
    description: 'High-speed blockchain. Send transactions, query accounts, and interact with programs.',
    tags: ['web3', 'blockchain', 'layer1', 'fast'],
    icon_url: '/logos/icon/solana.svg',
    logo_url: '/logos/icon/solana.svg',
  },
  {
    id: 'nodes-base.pumpfun',
    external_id: 'nodes-base.pumpfun',
    name: 'Pump.fun',
    kind: 'MODEL',
    provider: 'Pump.fun',
    description: 'Meme coin launchpad on Solana. Create tokens, track launches, and monitor trends.',
    tags: ['web3', 'solana', 'tokens', 'memes'],
    icon_url: '/logos/icon/pumpfun.png',
    logo_url: '/logos/icon/pumpfun.png',
  },
  {
    id: 'nodes-base.metamask',
    external_id: 'nodes-base.metamask',
    name: 'MetaMask',
    kind: 'MODEL',
    provider: 'MetaMask',
    description: 'Popular Web3 wallet. Connect to dApps, manage assets, and sign transactions.',
    tags: ['web3', 'wallet', 'ethereum', 'browser'],
    icon_url: '/logos/icon/metamask.png',
    logo_url: '/logos/icon/metamask.png',
  },
  {
    id: 'nodes-base.phantom',
    external_id: 'nodes-base.phantom',
    name: 'Phantom',
    kind: 'MODEL',
    provider: 'Phantom',
    description: 'Solana wallet. Manage SOL, SPL tokens, NFTs, and interact with Solana dApps.',
    tags: ['web3', 'wallet', 'solana', 'nft'],
    icon_url: '/logos/icon/phantom.png',
    logo_url: '/logos/icon/phantom.png',
  },
  {
    id: 'nodes-base.jupiter',
    external_id: 'nodes-base.jupiter',
    name: 'Jupiter',
    kind: 'MODEL',
    provider: 'Jupiter',
    description: 'Solana DEX aggregator. Best prices across all Solana exchanges.',
    tags: ['web3', 'dex', 'solana', 'swap'],
    icon_url: '/logos/icon/jupiter.png',
    logo_url: '/logos/icon/jupiter.png',
  },
  {
    id: 'nodes-base.wormhole',
    external_id: 'nodes-base.wormhole',
    name: 'Wormhole',
    kind: 'MODEL',
    provider: 'Wormhole',
    description: 'Cross-chain bridge. Transfer assets between blockchains securely.',
    tags: ['web3', 'bridge', 'cross-chain', 'interop'],
    icon_url: '/logos/icon/wormhole.png',
    logo_url: '/logos/icon/wormhole.png',
  },
  {
    id: 'nodes-base.meteora',
    external_id: 'nodes-base.meteora',
    name: 'Meteora',
    kind: 'MODEL',
    provider: 'Meteora',
    description: 'Solana liquidity protocol. Dynamic pools and concentrated liquidity.',
    tags: ['web3', 'defi', 'solana', 'liquidity'],
    icon_url: '/logos/icon/meteora.png',
    logo_url: '/logos/icon/meteora.png',
  },
  {
    id: 'nodes-base.apechain',
    external_id: 'nodes-base.apechain',
    name: 'ApeChain',
    kind: 'MODEL',
    provider: 'ApeChain',
    description: 'Yuga Labs Layer 2. NFT-focused chain for the Bored Ape ecosystem.',
    tags: ['web3', 'layer2', 'nft', 'yuga'],
    icon_url: '/logos/icon/apecoin.png',
    logo_url: '/logos/icon/apecoin.png',
  },
];

/**
 * Hard-coded popular EdenAI models
 * Top models available through the EdenAI platform
 */
/**
 * Curated Agents - Pre-built AI agents
 */
export const CURATED_AGENTS: CuratedModel[] = [];

export const POPULAR_EDENAI_MODELS: CuratedModel[] = [];

/**
 * Hard-coded popular Replicate models  
 * Top models available through the Replicate platform
 */
export const POPULAR_REPLICATE_MODELS: CuratedModel[] = [];

/**
 * Hard-coded popular open source models
 * Netflix/Spotify approach: Curate the best content manually
 */
export const POPULAR_OPEN_SOURCE_MODELS: CuratedModel[] = [];

/**
 * Curated sections configuration
 * Update these IDs as new popular assets emerge
 */
export const CURATED_SECTIONS = {
  /** Hero banner - Featured model/dataset/app */
  hero: {
    assetId: 'gpt-4o',
    tagline: 'Most Capable Model',
    subtitle: 'Advanced reasoning, vision, and audio understanding',
    cta: 'Try Now',
  },
  
  /** Recommended for You - Best Models (Dynamic - AI Aggregator search doesn't support ID lookup) */
  recommendedForYou: {
    // No IDs - search by ID doesn't work in AI Aggregator
    // Fetch popular models dynamically from API
    kind: 'MODEL' as const,
    limit: 10,
  },
  
  /** Popular AI Models - Hand-picked based on capabilities */
  popularModels: {
    ids: [
      'gpt-4o',
      'claude-3-5-sonnet',
      'llama-3-1-405b',
      'mistral-large-2',
      'gemini-pro-1-5',
    ] as string[],
    kind: 'MODEL' as const,
    limit: 10,
  },
  
  /** Top Connectors - Most useful integrations */
  topConnectors: {
    ids: [
      // Web3/Crypto Connectors (use full node names)
      'nodes-base.hyperliquid',
      'nodes-base.polymarket',
      'nodes-base.solana',
      'nodes-base.pumpfun',
      'nodes-base.metamask',
      'nodes-base.phantom',
      'nodes-base.jupiter',
      'nodes-base.wormhole',
      'nodes-base.meteora',
      'nodes-base.apechain',
      // Traditional SaaS Con nectors
      'telegram',
      'discord',
      'x',
      'airtable',
      'notion',
      'slack',
      'google-sheets',
      'github',
      'stripe',
      'sendgrid',
      'twilio',
    ] as string[],
    kind: 'CONNECTOR' as const,
    limit: 24, // Increased to show more connectors
  },
  
  /** Featured Datasets - High-quality training data */
  featuredDatasets: {
    ids: [
      'imagenet',
      'laion-5b',
      'redpajama',
      'common-crawl',
      'the-pile',
    ] as string[],
    kind: 'DATASET' as const,
    limit: 10,
  },
  
  /** New This Week - Dynamic, sorted by creation date */
  newThisWeek: {
    sort: 'created_at' as const,
    limit: 10,
  },
  
  /** Trending Now - Dynamic, sorted by downloads */
  trendingNow: {
    sort: 'downloads' as const,
    limit: 10,
  },
  
} as const;

/**
 * Section metadata for display
 * 
 * Industry Standard (Netflix, Apple TV+, Disney+):
 * - Static/category sections: Include "See All" link
 * - Dynamic/time-based sections: NO "See All" (content changes frequently)
 */
export const SECTION_METADATA = {
  recommendedForYou: {
    title: 'Recommended for You',
    // No viewAllHref - personalized content changes constantly
    description: 'Personalized picks based on your activity',
  },
  textGeneration: {
    title: 'Chat & Writing',
    viewAllHref: '/explore?kind=MODEL&category=text',
    description: 'From GPT-5 to Llama - the smartest language models',
  },
  imageGeneration: {
    title: 'Image Generation',
    viewAllHref: '/explore?kind=MODEL&category=image',
    description: 'Turn words into stunning visuals with AI',
  },
  videoGeneration: {
    title: 'Video Generation',
    viewAllHref: '/explore?kind=MODEL&category=video',
    description: 'From Sora to Runway - create Hollywood-level videos',
  },
  voiceAudio: {
    title: 'Voice & Audio',
    viewAllHref: '/explore?kind=MODEL&category=voice',
    description: 'Clone voices, generate music, and create realistic speech',
  },
  tradingAI: {
    title: 'Best for Trading',
    viewAllHref: '/explore?kind=MODEL&category=trading',
    description: 'AI models for algorithmic trading, quant strategies, and market analysis',
  },
  datasets: {
    title: 'Training Datasets',
    viewAllHref: '/explore?kind=DATASET',
    description: 'The datasets that power AI - from ImageNet to Common Crawl',
  },
  popularModels: {
    title: 'Popular Models',
    viewAllHref: '/explore?kind=MODEL', // Keep - static category
    description: 'Most capable AI models for your projects',
  },
  topConnectors: {
    title: 'Top Connectors',
    viewAllHref: '/explore?kind=CONNECTOR', // Keep - static category
    description: 'Connect to your favorite tools and services',
  },
  featuredDatasets: {
    title: 'Featured Datasets',
    viewAllHref: '/explore?kind=DATASET', // Keep - static category
    description: 'High-quality training data for your models',
  },
  newThisWeek: {
    title: 'New This Week',
    // No viewAllHref - dynamic content, changes weekly
    description: 'Latest additions to the marketplace',
  },
  trendingNow: {
    title: 'Trending Now',
    // No viewAllHref - dynamic content, changes constantly
    description: 'Most popular assets right now',
  },
  topEdenAIModels: {
    title: 'Top Models from EdenAI',
    viewAllHref: '/explore?kind=MODEL&provider=EdenAI', // Filter by provider
    description: 'Best models available through the EdenAI platform',
  },
  topReplicateModels: {
    title: 'Top Models from Replicate',
    viewAllHref: '/explore?kind=MODEL&provider=Replicate', // Filter by provider
    description: 'Best models available through the Replicate platform',
  },
  featuredAgents: {
    title: 'Featured Agents',
    viewAllHref: '/explore?kind=AGENT',
    description: 'Pre-built AI agents for customer support, coding, research & more',
  },
} as const;

/**
 * Get section configuration by key
 */
export function getSectionConfig(key: keyof typeof CURATED_SECTIONS) {
  return CURATED_SECTIONS[key];
}

/**
 * Get section metadata by key
 */
export function getSectionMetadata(key: keyof typeof SECTION_METADATA) {
  return SECTION_METADATA[key];
}
