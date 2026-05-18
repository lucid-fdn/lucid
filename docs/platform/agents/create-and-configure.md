# Create and Configure Agents

## Creating an Agent

Navigate to **Assistants** in the sidebar and click **+ New Assistant**.

### Required Fields

- **Name** — A descriptive name (e.g., "Customer Support", "Trading Analyst")
- **System Prompt** — The instructions that define your agent's behavior
- **Model** — Choose from 100+ available AI models

### Optional Fields

- **Description** — Brief summary shown in lists and search
- **Avatar** — Upload a custom avatar image
- **Temperature** — Controls randomness (0 = deterministic, 1 = creative). Default: 0.7

## Choosing a Model

Lucid supports models from multiple providers:

| Provider | Popular Models | Best For |
|----------|---------------|----------|
| OpenAI | GPT-4o, GPT-4o-mini | General purpose, tool use |
| Anthropic | Claude Sonnet, Claude Haiku | Analysis, long context |
| Google | Gemini Pro, Gemini Flash | Multimodal, fast responses |
| Mistral | Mistral Large, Mixtral | Multilingual, cost-effective |
| Meta | Llama 3 | Open-source, self-hosted |

You can change the model at any time without losing conversation history or configuration.

### BYOK (Bring Your Own Key)

If your workspace has provider API keys configured, agents route directly to that provider. This gives you:
- Direct billing with the provider
- Custom rate limits
- No Lucid gateway overhead

## Configuring Agent Behavior

### System Prompt Best Practices

Your system prompt shapes everything about your agent's behavior. Structure it as:

1. **Identity** — Who is the agent?
2. **Capabilities** — What can it do?
3. **Constraints** — What should it avoid?
4. **Tone** — How should it communicate?
5. **Procedures** — Step-by-step workflows for common scenarios

### Temperature Guide

| Temperature | Behavior | Use Case |
|-------------|----------|----------|
| 0.0 - 0.2 | Highly deterministic, factual | Data queries, calculations |
| 0.3 - 0.5 | Balanced | Customer support, Q&A |
| 0.6 - 0.8 | Creative but grounded | Content creation, brainstorming |
| 0.9 - 1.0 | Maximum creativity | Creative writing, ideation |

## Managing Agents

### Pausing an Agent

From Mission Control or the agent detail page, you can pause an agent. Paused agents stop processing inbound messages — messages queue until the agent is resumed.

### Duplicating an Agent

To create a similar agent, you can duplicate an existing one. This copies the system prompt, model, and plugin configuration but creates fresh channels and conversation history.

### Deleting an Agent

Deleting an agent removes it permanently along with its conversation history, memories, and channel connections. This action cannot be undone.

## Agent Status

| Status | Meaning |
|--------|---------|
| **Active** | Processing messages normally |
| **Paused** | Temporarily stopped — messages queue |
| **Error** | Encountered a critical issue — check Mission Control |
