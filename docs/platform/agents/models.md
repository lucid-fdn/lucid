# AI Models

Lucid gives you access to 100+ AI models from leading providers. Choose the right model for your agent's needs based on capability, speed, and cost.

## Available Providers

| Provider | Models | Strengths |
|----------|--------|-----------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4 Turbo, o1 | Broad tool use, strong reasoning |
| **Anthropic** | Claude Opus, Claude Sonnet, Claude Haiku | Long context, careful analysis |
| **Google** | Gemini 2.5 Pro, Gemini 2.5 Flash | Multimodal, fast, cost-effective |
| **Mistral** | Mistral Large, Mixtral, Mistral Small | Multilingual, efficient |
| **Meta** | Llama 3.1, Llama 3.2 | Open-source, customizable |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | Reasoning, code generation |
| **Qwen** | Qwen 2.5 | Multilingual, strong in Chinese |

## Choosing a Model

### By Use Case

| Use Case | Recommended | Why |
|----------|-------------|-----|
| Customer support | GPT-4o-mini, Claude Haiku | Fast, cost-effective, good enough |
| Complex analysis | GPT-4o, Claude Sonnet | Strong reasoning, tool chaining |
| Trading/finance | GPT-4o, Claude Sonnet | Precision matters, multi-step |
| Content creation | Claude Sonnet, GPT-4o | Creative, nuanced writing |
| Simple Q&A | GPT-4o-mini, Gemini Flash | Speed and cost over depth |
| Code generation | Claude Sonnet, DeepSeek V3 | Technical accuracy |

### Cost vs Quality Trade-off

Models range from ~$0.10 to ~$15 per million input tokens. For most agents:

- **Start with a capable model** (GPT-4o or Claude Sonnet) to get the behavior right
- **Downgrade to a faster model** (GPT-4o-mini, Gemini Flash) once you've validated the system prompt works
- Use **Mission Control cost controls** to set spending limits

## Changing Models

You can change an agent's model at any time:

1. Go to the agent's detail page
2. Click the model selector
3. Choose a new model
4. Save

The change takes effect immediately for new messages. No conversation history is lost.

## BYOK (Bring Your Own Key)

When your workspace has provider API keys configured:

- Lucid stores provider key metadata in your workspace and syncs the key to TrustGate.
- Assistant routing can run in **Auto**, **Lucid managed**, or **BYOK only** mode.
- **Auto** chooses the safe available route.
- **Lucid managed** uses Lucid-managed provider routing.
- **BYOK only** requires an active workspace provider key for the selected provider/model.
- Configure keys in **Workspace Settings > Provider Keys**.
- Key UI supports invalid-key validation, save, active/inactive toggle, delete, and TrustGate sync failure states.

Runtime choice does not bypass TrustGate. Shared, dedicated, and BYO runtimes all use the same assistant inference policy and audit path.

## Model Routing

For advanced deployments, Lucid can automatically route simple queries (like "what's my balance?") to a faster, cheaper model while keeping complex analysis on the primary model. This is configured per-agent and can significantly reduce costs without sacrificing quality for complex tasks.

## Agent Avatar Generation

Agent profile pictures use the same AI generation governance model as text, voice, and transcription. Avatar generation enters through the app-side AI generation control plane, records an `ai_generation_events` receipt, stores the generated asset, and uses TrustGate/OpenAI-compatible image routes instead of legacy Replicate prediction polling.

### Default Visual System

The default avatar preset is **Lucid Studio**:

- polished 3D/editorial portrait for premium SaaS agents
- front three-quarter camera angle by default
- head-and-shoulders crop with safe circular-avatar margins
- visible eyes, balanced shoulders, clean non-busy background
- no text, logos, watermarks, badges, or copyrighted characters

First generation creates a new face in the selected style. Regeneration can enable **Keep same face**; when a reference avatar exists, Lucid sends it through the image edit path so the model preserves the face/identity while applying requested style, angle, expression, lighting, or background changes.

### Composable Styles

Avatar styles are code-level presets, not separate engines. New visual systems can be added by extending:

- `src/lib/ai/agent-avatar/types.ts` — style id/type
- `src/lib/ai/agent-avatar/styles.ts` — label, normalization, and prompt direction
- create-agent and assistant-detail UI style lists when the style should be user-selectable
- prompt/UI/API tests for the new preset

The provider pipeline remains the same for every style: normalize request, compile prompt, run the centralized image adapter, store the asset, and emit usage/observability metadata.
