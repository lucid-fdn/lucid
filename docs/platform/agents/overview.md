# Agents Overview

Agents are the core of Lucid. An agent is an AI-powered assistant that can converse with users, execute tools, remember context, and operate autonomously across messaging channels.

## What Is an Agent?

An agent combines:

Model default: new agents use `lucid-auto` unless the user or template explicitly selects a provider model. This keeps creation consistent while preserving advanced model choice.

- **A language model** — The AI brain (GPT-4o, Claude, Gemini, Mistral, etc.)
- **A system prompt** — Instructions defining personality, capabilities, and boundaries
- **Channels** — Where the agent talks (Telegram, Discord, WhatsApp, Slack, Web)
- **Plugins** — Tools the agent can use (web search, trading, analytics, etc.)
- **Memory and Knowledge** — Long-term recall of user preferences plus governed workspace, project, team, and document knowledge through Lucid Knowledge
- **Guardrails** — Cost limits, approval requirements, and safety policies

## Agent Lifecycle

1. **Create** — Define name, prompt, model, and basic settings
2. **Configure** — Add plugins, set up memory, define guardrails
3. **Test** — Use the built-in test chat to verify behavior
4. **Deploy** — Connect one or more messaging channels
5. **Monitor** — Track performance, costs, and health via Mission Control
6. **Iterate** — Update prompts, swap models, adjust settings without downtime

## Key Concepts

### Multi-Channel Deployment

A single agent can be connected to multiple channels simultaneously. A support agent could respond on Telegram, Discord, and your website — all from the same configuration. Each channel maintains its own conversation threads.

### User-Scoped Conversations

When users message your agent on any channel, Lucid creates a scoped conversation thread. The agent remembers context within that thread and can recall long-term memories specific to each user. There's no cross-user data leakage.

### Autonomous Operation

Agents don't just respond to messages — they can:

- **Schedule tasks** — Run actions on a cron schedule or at a specific time
- **Call other agents** — Send messages to other agents in your fleet for collaboration
- **Execute multi-step workflows** — Chain tool calls to accomplish complex goals
- **Run Agent Ops checks** — QA URLs, canary deployments, review changes, and collect browser evidence
- **Self-monitor** — Detect stuck loops and escalate when needed

### Fleet Management

When you have multiple agents, Mission Control gives you a single dashboard to monitor, pause, approve actions, and optimize costs across your entire fleet.

### Identity and Operating Context

Agent identity is agent-scoped. Versioned identity documents use the canonical agent document types `SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, and `CURRENT_CONTEXT`. These documents describe the agent itself. Web3 identity is optional; passport and wallet anchors are attached when available, but ordinary agents do not require them.

Workspace, project, team, agent, and user context is stored separately as shared context records. The supported record types are `thesis`, `signal`, `feedback`, `daily_intel`, `memory`, `decision`, `policy`, `risk`, and `open_question`. Runtime prompt assembly resolves an inherited context ladder from workspace to project to team to agent to user, then injects that shared operating context after agent identity. This is how company beliefs, reference intel, feedback, policy, decisions, and Daily Intel reach the agent without turning the workspace or team into a fake agent.

Heartbeat naming is intentionally namespaced: Pulse is orchestration, runtime heartbeat is infrastructure liveness, and agent heartbeat is the agent's operating-state cadence.

In the app, use **Workspace Brain** on the workspace dashboard, **Project Brain** in project settings, **Team Context** on project team detail, and **Operating Context** in the agent command center. These surfaces let operators add shared context at the right scope, inspect inherited context, preview policy inheritance, and manage agent-only identity and heartbeat where appropriate.

For the complete user and API guide, see [Agent Identity And Operating Context](operating-context.md).

## Agent Settings Reference

| Setting | Description | Default |
|---------|-------------|---------|
| `name` | Display name | Required |
| `description` | Brief summary | Optional |
| `system_prompt` | Core instructions | Required |
| `model` | AI model ID | Required |
| `temperature` | Response randomness (0-1) | 0.7 |
| `memory_enabled` | Long-term memory | Enabled |
| `memory_strategy` | Extraction frequency | `auto` |
| `is_active` | Whether agent processes messages | Active |
