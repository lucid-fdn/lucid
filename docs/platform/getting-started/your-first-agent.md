# Your First Agent

This guide walks you through creating, configuring, and deploying your first AI agent on Lucid.

## Creating an Agent

1. Navigate to **Assistants** in the sidebar
2. Click the **+ New Assistant** button
3. Fill in the basics:
   - **Name** — What your agent is called (visible to you and your team)
   - **Description** — A brief summary of what this agent does
   - **System Prompt** — The core instructions that define your agent's behavior
   - **Model** — Select an AI model (e.g., GPT-4o, Claude Sonnet, Gemini Pro)

## Writing a Good System Prompt

Your system prompt is the most important configuration. It tells the agent who it is, what it should do, and how it should behave. Tips:

- **Be specific** — "You are a customer support agent for an e-commerce store" is better than "You are helpful"
- **Define boundaries** — Tell the agent what it should and shouldn't do
- **Set the tone** — Formal? Casual? Technical? Match your brand
- **Include context** — Mention your product, common questions, or domain knowledge

### Example System Prompt

```
You are the support assistant for Acme Store. You help customers with:
- Order status and tracking
- Returns and refunds (within 30-day policy)
- Product recommendations

Be friendly but concise. If you don't know something, say so honestly.
Never make up order numbers or tracking information.
Always ask for the customer's order number before looking up order details.
```

## Testing Your Agent

After creating your agent, use the **Test Chat** panel on the agent detail page. This lets you:

- Send messages and see responses in real time
- Verify your system prompt produces the right behavior
- Test tool calls and plugin interactions
- Iterate quickly before deploying to a live channel

## Configuring Advanced Settings

On your agent's detail page, explore the tabs:

| Tab | What It Controls |
|-----|-----------------|
| **General** | Name, description, system prompt, model |
| **Channels** | Connect messaging platforms (Telegram, Discord, etc.) |
| **Plugins** | Install and activate tool packages |
| **Memory** | Configure long-term memory settings |
| **Guardrails** | Set cost limits and approval requirements |

## Deploying to a Channel

Once you're happy with your agent's behavior in test chat:

1. Go to the **Channels** tab
2. Click **Add Channel**
3. Choose your platform (Telegram, Discord, Slack, WhatsApp, Microsoft Teams, iMessage, or Web)
4. Follow the platform-specific setup instructions
5. Your agent starts responding to real messages automatically

## Next Steps

- [Learn about memory](../agents/memory.md) — How agents remember information across conversations
- [Add plugins](../plugins/overview.md) — Give your agent tools like web search, trading, or analytics
- [Set up guardrails](../mission-control/cost-controls.md) — Control costs and require approvals for sensitive actions
