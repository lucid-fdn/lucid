# Plugins Overview

Plugins extend your agents with new tools and capabilities. Out of the box, agents can converse and use basic tools like web search. Plugins add specialized actions — trading, analytics, content creation, SEO, and more.

For the current internal manifest contract and tool-schema lifecycle, see [Tool Manifest Pipeline](./tool-manifests.md).

## What Is a Plugin?

A plugin is a package of tools that an agent can call during conversations. Each plugin provides one or more tools with defined inputs and outputs. For example:

- **lucid-trade** — Tools for cryptocurrency trading (swaps, quotes, portfolio)
- **lucid-seo** — SEO analysis and keyword research tools
- **lucid-metrics** — Business metrics and analytics tools
- **lucid-invoice** — Invoice generation and management

## Plugin vs Integration vs Skill

| Type | What It Is | Executable? |
|------|-----------|-------------|
| **Plugin** | Package of tools, no external auth needed | Yes |
| **Integration** | Plugin connected to external SaaS via OAuth/API key | Yes |
| **Skill** | Prompt guidance that teaches the agent strategy | No (guidance only) |

## Trust Levels

Plugins have trust levels that determine how they execute:

| Trust Level | Meaning | Execution |
|-------------|---------|-----------|
| **Internal** | Built and maintained by Lucid | Runs in-process (~1-5ms) |
| **Verified** | Reviewed by Lucid, partner-built | Runs in-process |
| **Community** | Unreviewed, third-party | Runs in isolated sandbox |

## 3-Tier Governance

Plugins follow a governance model to prevent accidental tool exposure:

1. **Catalog** — The global registry of available plugins
2. **Installation** — An org admin installs a plugin into the workspace
3. **Activation** — A plugin is activated on a specific agent with selected tools

This means a plugin must be explicitly installed AND activated before an agent can use it. No agent gets tools it wasn't configured to have.

## Tool Manifests

Every plugin or integration exposes tools through the same canonical manifest contract:

- `name`
- `description`
- `parameters` as JSON Schema

Lucid normalizes and validates those schemas before they are stored or sent to a runtime. The same prepared manifest is then used across:

- shared workers
- dedicated runtimes
- BYO runtimes
- OpenClaw and Hermes adapters

That keeps tool behavior consistent even when deployment or engine changes.

## Available Plugins

Lucid ships with 19+ first-party plugins covering:

- **Trading** — Token swaps, portfolio management, price quotes
- **Analytics** — SEO, competitive analysis, metrics
- **Communication** — Meeting scheduling, proposals, invoicing
- **Content** — Video generation, feedback collection
- **Intelligence** — Market prediction, hype detection, auditing
- **Operations** — Observability, tax reporting, recruiting

See [Built-in Plugins](./built-in-plugins.md) for the full list.

## Plan Limits

| Plan | Max Plugins per Agent | Max Tool Calls |
|------|----------------------|----------------|
| Starter | 2 per agent | Unlimited |
| Growth | 10 per agent | Unlimited |
| Scale | Unlimited | Unlimited |

Important:

- the hard per-agent cap is for **plugins**
- OAuth/API-key **integrations** are governed separately and do not consume the legacy active-plugin cap
