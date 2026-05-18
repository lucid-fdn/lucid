"""Sprint 1 — MVP: docs.json + core pages + delete starter kit"""
import os, json, shutil

DOCS = r'c:\docs'

# ============================================================
# 1. docs.json — 5-tab navigation with Option A OpenAPI
# ============================================================
docs_json = {
    "$schema": "https://mintlify.com/docs.json",
    "theme": "mint",
    "name": "Lucid Documentation",
    "colors": {
        "primary": "#6366F1",
        "light": "#818CF8",
        "dark": "#4F46E5",
        "background": { "dark": "#0B0F1A" }
    },
    "favicon": "/favicon.svg",
    "logo": {
        "light": "/logo/light.svg",
        "dark": "/logo/dark.svg"
    },
    "navigation": {
        "tabs": [
            {
                "tab": "Overview",
                "groups": [
                    {
                        "group": "Getting Started",
                        "pages": ["index", "quickstart", "authentication", "sdk-installation"]
                    },
                    {
                        "group": "Core Concepts",
                        "pages": [
                            "concepts/passports",
                            "concepts/inference",
                            "concepts/receipts",
                            "concepts/epochs",
                            "concepts/agents",
                            "concepts/mmr",
                            "concepts/solana-programs",
                            "concepts/session-signer"
                        ]
                    },
                    {
                        "group": "Architecture",
                        "pages": ["architecture", "glossary"]
                    }
                ]
            },
            {
                "tab": "Guides",
                "groups": [
                    {
                        "group": "Beginner",
                        "pages": [
                            "guides/first-inference",
                            "guides/passport-management",
                            "guides/error-handling"
                        ]
                    },
                    {
                        "group": "Intermediate",
                        "pages": [
                            "guides/verifiable-receipts",
                            "guides/epoch-verification",
                            "guides/agent-orchestration",
                            "guides/streaming"
                        ]
                    },
                    {
                        "group": "Advanced",
                        "pages": [
                            "guides/compute-providers",
                            "guides/hf-passport-sync",
                            "guides/n8n-integration",
                            "guides/nango-oauth",
                            "guides/crewai-integration",
                            "guides/self-hosting",
                            "guides/webhooks"
                        ]
                    }
                ]
            },
            {
                "tab": "API Reference",
                "groups": [
                    {
                        "group": "API Documentation",
                        "pages": [
                            "api-reference/introduction",
                            "api-reference/errors",
                            "api-reference/rate-limits"
                        ]
                    },
                    {
                        "group": "API Endpoints",
                        "openapi": "https://raw.githubusercontent.com/raijinlabs/lucid-ai-sdk/main/openapi-with-code-samples.yaml"
                    }
                ]
            },
            {
                "tab": "SDKs & Tools",
                "groups": [
                    {
                        "group": "SDKs",
                        "pages": [
                            "sdks/typescript",
                            "sdks/typescript-passports",
                            "sdks/typescript-inference",
                            "sdks/typescript-receipts",
                            "sdks/typescript-agents",
                            "sdks/python",
                            "sdks/rest"
                        ]
                    },
                    {
                        "group": "AI Tools",
                        "pages": [
                            "ai-tools/cursor",
                            "ai-tools/claude-code",
                            "ai-tools/windsurf",
                            "sdks/mcp-server"
                        ]
                    }
                ]
            },
            {
                "tab": "Platform",
                "groups": [
                    {
                        "group": "Platform",
                        "pages": [
                            "platform/billing",
                            "platform/api-keys",
                            "platform/metering",
                            "platform/quotas",
                            "platform/organizations",
                            "platform/dashboard",
                            "platform/security",
                            "platform/sla"
                        ]
                    }
                ]
            }
        ],
        "global": {
            "anchors": [
                {
                    "anchor": "API Status",
                    "href": "https://api.lucid.foundation/health",
                    "icon": "signal"
                },
                {
                    "anchor": "GitHub",
                    "href": "https://github.com/raijinlabs",
                    "icon": "github"
                },
                {
                    "anchor": "SDK",
                    "href": "https://www.npmjs.com/package/raijin-labs-lucid-ai",
                    "icon": "npm"
                }
            ]
        }
    },
    "navbar": {
        "links": [
            { "label": "Support", "href": "mailto:support@lucid.foundation" }
        ],
        "primary": {
            "type": "button",
            "label": "Dashboard",
            "href": "https://app.lucid.foundation"
        }
    },
    "contextual": {
        "options": ["copy", "view", "chatgpt", "claude", "perplexity", "mcp", "cursor", "vscode"]
    },
    "feedback": {
        "thumbsRating": True,
        "suggestEdit": True
    },
    "footer": {
        "socials": {
            "x": "https://x.com/raijinlabs",
            "github": "https://github.com/raijinlabs"
        }
    }
}

with open(os.path.join(DOCS, 'docs.json'), 'w') as f:
    json.dump(docs_json, f, indent=2)
print("✅ docs.json")

# ============================================================
# 2. Create all MDX pages
# ============================================================
pages = {}

# --- INDEX ---
pages['index.mdx'] = '''---
title: "Lucid Documentation"
description: "The verifiable AI inference protocol — cryptographic receipts, on-chain anchoring, and policy-based routing for 100+ LLM models."
---

import { Card, CardGroup, Steps, Tip } from 'mintlify/components'

# Welcome to Lucid

**Lucid** is a verifiable AI inference protocol. Every AI call gets a cryptographic receipt, anchored on Solana, with full auditability.

<CardGroup cols={3}>
  <Card title="Passports" icon="id-card" href="/concepts/passports">
    Identity layer for models, compute nodes, tools, datasets, and agents
  </Card>
  <Card title="Inference" icon="bolt" href="/concepts/inference">
    OpenAI-compatible chat completions with policy-based routing
  </Card>
  <Card title="Receipts" icon="receipt" href="/concepts/receipts">
    Cryptographic receipts with Merkle Mountain Range proofs
  </Card>
  <Card title="Epochs" icon="clock" href="/concepts/epochs">
    Batch anchoring to Solana with verifiable transaction proofs
  </Card>
  <Card title="Agents" icon="robot" href="/concepts/agents">
    Autonomous agent orchestration with plan → accomplish → execute
  </Card>
  <Card title="Payouts" icon="coins" href="/api-reference/introduction">
    Automatic payout calculation and verification
  </Card>
</CardGroup>

## Get Started in 2 Minutes

<Steps>
  <Step title="Install the SDK">
    ```bash
    npm install raijin-labs-lucid-ai
    ```
  </Step>
  <Step title="Run your first inference">
    ```typescript
    import { LucidAI } from "raijin-labs-lucid-ai";

    const lucid = new LucidAI({ bearerAuth: "your-api-key" });

    const result = await lucid.chat.completions({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello from Lucid!" }]
    });
    ```
  </Step>
  <Step title="Verify your receipt">
    Every inference generates a cryptographic receipt anchored on Solana.
    [Learn more →](/concepts/receipts)
  </Step>
</Steps>

<Tip>
  **65+ API endpoints** are auto-documented in the [API Reference](/api-reference/introduction) tab with interactive playground.
</Tip>

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Your App  │────▶│  Lucid API   │────▶│  LLM Model  │
│  (SDK/REST) │     │  (Routing)   │     │  (100+)     │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────▼───────┐
                    │   Receipt    │──── Cryptographic proof
                    │   (MMR)      │──── Merkle Mountain Range
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Solana     │──── On-chain anchor
                    │   (Epoch)    │──── Batch verification
                    └──────────────┘
```

## Why Lucid?

| Feature | Traditional API | Lucid Protocol |
|---------|----------------|----------------|
| Auditability | Logs (mutable) | Cryptographic receipts (immutable) |
| Verification | Trust the provider | Verify on-chain |
| Multi-model | One provider | 100+ models, policy-based routing |
| Cost tracking | Approximate | Exact, per-receipt |
| Agent proofs | None | Full execution trace on-chain |
'''

# --- QUICKSTART ---
pages['quickstart.mdx'] = '''---
title: "Quickstart"
description: "Get up and running with Lucid in under 2 minutes"
---

import { Steps, CodeGroup, Tip, Warning } from 'mintlify/components'

# Quickstart

<Steps>
  <Step title="Get your API key">
    Sign up at [app.lucid.foundation](https://app.lucid.foundation) and create an API key from the dashboard.
  </Step>

  <Step title="Install the SDK">
    <CodeGroup>
      ```bash npm
      npm install raijin-labs-lucid-ai
      ```
      ```bash yarn
      yarn add raijin-labs-lucid-ai
      ```
      ```bash pnpm
      pnpm add raijin-labs-lucid-ai
      ```
    </CodeGroup>
  </Step>

  <Step title="Initialize the client">
    ```typescript
    import { LucidAI } from "raijin-labs-lucid-ai";

    const lucid = new LucidAI({
      bearerAuth: process.env.LUCID_API_KEY,
    });
    ```
  </Step>

  <Step title="List your passports">
    ```typescript
    const passports = await lucid.passports.list();
    console.log(`Found ${passports.length} passports`);
    ```
  </Step>

  <Step title="Run an inference">
    ```typescript
    const response = await lucid.chat.completions({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is verifiable AI?" }
      ]
    });

    console.log(response.choices[0].message.content);
    // Receipt ID is in response headers
    ```
  </Step>

  <Step title="Verify the receipt">
    ```typescript
    const receipt = await lucid.receipts.get(receiptId);
    const verification = await lucid.receipts.verify(receiptId);

    console.log("Verified:", verification.valid);
    console.log("Merkle proof:", verification.proof);
    ```
  </Step>
</Steps>

<Tip>
  The SDK is generated by [Speakeasy](https://speakeasyapi.dev/) and includes full TypeScript types for every endpoint.
</Tip>

## What just happened?

1. **Passport lookup** — Your API key resolved to a passport identity
2. **Policy matching** — Lucid matched your request to the best available model
3. **Inference** — The LLM processed your request
4. **Receipt creation** — A cryptographic receipt was generated with an MMR proof
5. **Epoch anchoring** — The receipt will be batched and anchored on Solana

## Next Steps

- [Passport Management](/guides/passport-management) — Create and manage passports
- [Verifiable Receipts](/guides/verifiable-receipts) — Deep-dive into the receipt system
- [API Reference](/api-reference/introduction) — Explore all 65+ endpoints
'''

# --- AUTHENTICATION ---
pages['authentication.mdx'] = '''---
title: "Authentication"
description: "How to authenticate with the Lucid API"
---

import { CodeGroup, Warning, Tip } from 'mintlify/components'

# Authentication

All API requests require a Bearer token in the `Authorization` header.

## API Key

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.lucid.foundation/v1/passports
```

## SDK Authentication

<CodeGroup>
  ```typescript TypeScript SDK
  import { LucidAI } from "raijin-labs-lucid-ai";

  const lucid = new LucidAI({
    bearerAuth: process.env.LUCID_API_KEY,
  });
  ```
  ```bash curl
  export LUCID_API_KEY="your-api-key"
  curl -H "Authorization: Bearer $LUCID_API_KEY" \\
    https://api.lucid.foundation/v1/passports
  ```
  ```python Python (coming soon)
  from lucid import LucidAI

  lucid = LucidAI(api_key="your-api-key")
  ```
</CodeGroup>

## Owner Address Header

For passport ownership operations, include the `X-Owner-Address` header:

```typescript
// The owner address links passports to a Solana wallet
const passport = await lucid.passports.create({
  name: "my-model",
  type: "model",
}, {
  headers: { "X-Owner-Address": "YOUR_SOLANA_ADDRESS" }
});
```

## Base URL

| Environment | URL |
|------------|-----|
| Production | `https://api.lucid.foundation` |
| Staging | `https://staging.api.lucid.foundation` |

<Warning>
  Never expose your API key in client-side code. Use environment variables or a backend proxy.
</Warning>

## Rate Limits

See [Rate Limits](/api-reference/rate-limits) for detailed information.
'''

# --- SDK INSTALLATION ---
pages['sdk-installation.mdx'] = '''---
title: "SDK Installation"
description: "Install and configure the Lucid SDK"
---

import { CodeGroup, Card, CardGroup } from 'mintlify/components'

# SDK Installation

<CardGroup cols={3}>
  <Card title="TypeScript" icon="js" href="/sdks/typescript">
    Full SDK with types — **recommended**
  </Card>
  <Card title="Python" icon="python" href="/sdks/python">
    Coming soon
  </Card>
  <Card title="REST" icon="globe" href="/sdks/rest">
    Direct HTTP — any language
  </Card>
</CardGroup>

## TypeScript SDK

The official SDK is generated by Speakeasy with full TypeScript types.

<CodeGroup>
  ```bash npm
  npm install raijin-labs-lucid-ai
  ```
  ```bash yarn
  yarn add raijin-labs-lucid-ai
  ```
  ```bash pnpm
  pnpm add raijin-labs-lucid-ai
  ```
</CodeGroup>

### Basic Setup

```typescript
import { LucidAI } from "raijin-labs-lucid-ai";

const lucid = new LucidAI({
  bearerAuth: process.env.LUCID_API_KEY,
  // Optional: custom base URL
  // serverURL: "https://staging.api.lucid.foundation"
});
```

### SDK Method Groups

| Group | Methods | Description |
|-------|---------|-------------|
| `lucid.passports` | `list`, `create`, `get`, `update`, `delete`, `sync` | Passport management |
| `lucid.chat` | `completions` | OpenAI-compatible chat |
| `lucid.inference` | `run` | Direct inference |
| `lucid.match` | `match`, `explain` | Model matching |
| `lucid.receipts` | `create`, `get`, `verify`, `proof` | Receipt operations |
| `lucid.epochs` | `current`, `list`, `get`, `verify` | Epoch management |
| `lucid.agents` | `init`, `plan`, `accomplish`, `execute` | Agent orchestration |
| `lucid.payouts` | `calculate`, `fromReceipt`, `verify` | Payout calculations |
| `lucid.compute` | `heartbeat`, `health` | Compute node management |

## REST API

No SDK needed — use any HTTP client:

```bash
curl -X GET "https://api.lucid.foundation/v1/passports" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"
```
'''

# --- ARCHITECTURE ---
pages['architecture.mdx'] = '''---
title: "Architecture"
description: "How Lucid works — from request to on-chain anchor"
---

# Architecture

Lucid is a **verifiable AI inference protocol** with three layers:

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR APPLICATION                        │
│  TypeScript SDK  │  REST API  │  MCP Server  │  n8n Nodes   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    LUCID API LAYER                            │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Passports │  │ Matching │  │ Routing  │  │ Receipts │   │
│  │ Registry │  │  Engine  │  │  Engine  │  │  (MMR)   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Epochs  │  │ Payouts  │  │  Agents  │  │ Compute  │   │
│  │Anchoring │  │  Engine  │  │Orchestr. │  │  Nodes   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    ON-CHAIN LAYER                             │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐                     │
│  │ lucid-receipts │  │ lucid-registry │  ← Solana Programs  │
│  │  (Rust/BPF)    │  │  (Rust/BPF)    │                     │
│  └────────────────┘  └────────────────┘                     │
│                                                              │
│  Solana Mainnet — Immutable receipt anchors                  │
└─────────────────────────────────────────────────────────────┘
```

## Request Flow

1. **Client** sends inference request via SDK or REST
2. **Matching Engine** selects optimal model based on policy
3. **Routing Engine** dispatches to the selected LLM provider
4. **LLM** processes the request and returns response
5. **Receipt Service** creates cryptographic receipt with MMR proof
6. **Epoch Service** batches receipts for on-chain anchoring
7. **Anchor Worker** commits epoch to Solana

## Key Components

### Passports
Universal identity for everything in the network: models, compute nodes, tools, datasets, agents. Each passport has metadata, tags, capabilities, and an on-chain representation.

### Merkle Mountain Range (MMR)
An append-only data structure used for receipt proofs. Each receipt is a leaf in the MMR tree. Inclusion proofs allow verification without downloading the entire tree.

### Epoch Anchoring
Receipts are batched into epochs. Each epoch's MMR root is anchored on Solana, creating an immutable proof that the receipts existed at a specific point in time.

### Agent Orchestrator
Autonomous agents follow a plan → accomplish → execute → validate lifecycle. Each step generates receipts, creating a full audit trail of agent behavior.

## Repositories

| Repo | Purpose |
|------|---------|
| [Lucid-L2](https://github.com/raijinlabs/Lucid-L2) | Backend protocol (offchain API + Solana programs) |
| [LucidMerged](https://github.com/daishizenSensei/LucidMerged) | Frontend platform + AI studio |
| [lucid-plateform-core](https://github.com/raijinlabs/lucid-plateform-core) | Platform infrastructure (billing, keys, metering) |
| [lucid-ai-sdk](https://github.com/raijinlabs/lucid-ai-sdk) | TypeScript SDK (Speakeasy-generated) |
| [docs](https://github.com/raijinlabs/docs) | This documentation site |
'''

# --- CONCEPTS ---
concepts = {
    'concepts/passports.mdx': '''---
title: "Passports"
description: "Universal identity layer for models, compute nodes, tools, datasets, and agents"
---

import { Tip } from 'mintlify/components'

# Passports

A **Passport** is the universal identity primitive in Lucid. Everything in the network — models, compute nodes, tools, datasets, and agents — has a passport.

## Passport Types

| Type | Description | Example |
|------|-------------|---------|
| `model` | LLM or AI model | GPT-4o, Claude 3.5 Sonnet |
| `compute` | Compute node provider | GPU worker, inference server |
| `tool` | External tool or API | Web search, calculator |
| `dataset` | Training or reference data | Knowledge base, embeddings |
| `agent` | Autonomous agent | Planning agent, research agent |

## Lifecycle

```
Created → Active → Deprecated → Revoked
              │
              └──→ Synced (on-chain)
```

## Create a Passport

```typescript
const passport = await lucid.passports.create({
  name: "my-gpt4o",
  type: "model",
  metadata: {
    provider: "openai",
    maxTokens: 128000,
    capabilities: ["chat", "function-calling", "vision"]
  },
  tags: ["production", "gpt-4o"]
});
```

## List & Filter

```typescript
// List all model passports
const models = await lucid.passports.list({
  type: "model",
  tags: ["production"]
});

// Get passport stats
const stats = await lucid.passports.stats();
```

## On-Chain Sync

Passports can be synced to Solana for on-chain verification:

```typescript
await lucid.passports.sync(passportId);
```

<Tip>
  Passport sync is batched — use `GET /v1/passports/pending-sync` to check the queue.
</Tip>
''',

    'concepts/inference.mdx': '''---
title: "Inference"
description: "OpenAI-compatible chat completions with policy-based routing"
---

# Inference

Lucid provides an **OpenAI-compatible** chat completions endpoint that routes to 100+ models with policy-based matching.

## Chat Completions

```typescript
const response = await lucid.chat.completions({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain quantum computing" }
  ],
  temperature: 0.7,
  max_tokens: 1000
});
```

## Policy-Based Matching

Instead of specifying a model directly, let Lucid match the best model for your request:

```typescript
const match = await lucid.match.match({
  requirements: {
    capabilities: ["chat", "function-calling"],
    maxLatency: 2000,
    costTier: "standard"
  }
});

// Use the matched model
const response = await lucid.chat.completions({
  model: match.passportId,
  messages: [...]
});
```

## Match Explain

Get a detailed explanation of why a model was selected:

```typescript
const explanation = await lucid.match.explain({
  requirements: { capabilities: ["vision"] }
});

console.log(explanation.reasoning);
console.log(explanation.alternatives);
```

## Streaming

```typescript
const stream = await lucid.chat.completions({
  model: "gpt-4o",
  messages: [...],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

## Receipt Generation

Every inference automatically generates a cryptographic receipt:
- **Receipt ID** — Unique identifier
- **MMR proof** — Merkle Mountain Range inclusion proof
- **Signature** — Cryptographic signature from the session signer
- **Epoch** — Batch anchor reference
''',

    'concepts/receipts.mdx': '''---
title: "Receipts"
description: "Cryptographic receipts with Merkle Mountain Range proofs"
---

# Receipts

Every AI inference in Lucid generates a **cryptographic receipt** — an immutable proof that the computation happened.

## What's in a Receipt?

| Field | Description |
|-------|-------------|
| `id` | Unique receipt identifier |
| `run_id` | The inference run that generated this receipt |
| `input_hash` | SHA-256 hash of the input |
| `output_hash` | SHA-256 hash of the output |
| `model_passport` | Passport ID of the model used |
| `signature` | Ed25519 signature from session signer |
| `mmr_position` | Position in the Merkle Mountain Range |
| `epoch_id` | The epoch this receipt belongs to |

## Create & Verify

```typescript
// Receipts are created automatically during inference
// You can also create them manually:
const receipt = await lucid.receipts.create({
  runId: "run_abc123",
  inputHash: "sha256:...",
  outputHash: "sha256:...",
  modelPassport: "passport_xyz"
});

// Verify a receipt
const verification = await lucid.receipts.verify(receipt.id);
console.log("Valid:", verification.valid);
console.log("Signature verified:", verification.signatureValid);
console.log("MMR proof verified:", verification.proofValid);
```

## Merkle Proof

Get the inclusion proof for a receipt:

```typescript
const proof = await lucid.receipts.proof(receiptId);
console.log("Root:", proof.root);
console.log("Path:", proof.path);
console.log("Position:", proof.position);
```

## Verify by Hash

```typescript
const result = await lucid.verify.byHash("sha256:abc123...");
```
''',

    'concepts/epochs.mdx': '''---
title: "Epochs"
description: "Batch anchoring to Solana with verifiable transaction proofs"
---

# Epochs

An **Epoch** is a batch of receipts anchored to Solana as a single transaction. This is how Lucid achieves on-chain verification without per-receipt transaction costs.

## Epoch Lifecycle

```
Open → Anchoring → Anchored
         │
         └──→ Failed (retry available)
```

## How It Works

1. Receipts accumulate in the current **open** epoch
2. When the epoch closes (time-based or size-based), the MMR root is computed
3. The **anchor worker** commits the MMR root to Solana
4. The epoch status becomes **anchored** with a transaction hash

## API

```typescript
// Get current epoch
const current = await lucid.epochs.current();
console.log("Epoch:", current.id, "Status:", current.status);

// List epochs
const epochs = await lucid.epochs.list();

// Verify an epoch on-chain
const verification = await lucid.epochs.verify(epochId);
console.log("On-chain:", verification.onChain);
console.log("Tx hash:", verification.transactionHash);

// Get the Solana transaction
const tx = await lucid.epochs.transaction(epochId);
```

## Statistics

```typescript
const stats = await lucid.epochs.stats();
console.log("Total epochs:", stats.total);
console.log("Anchored:", stats.anchored);
console.log("Pending:", stats.pending);
```
''',

    'concepts/agents.mdx': '''---
title: "Agents"
description: "Autonomous agent orchestration with verifiable execution traces"
---

# Agents

Lucid Agents are autonomous AI systems with **verifiable execution traces**. Every agent action generates receipts anchored on-chain.

## Agent Lifecycle

```
Init → Plan → Accomplish → Execute → Validate
  │      │        │           │          │
  └──────┴────────┴───────────┴──────────┘
          Each step = Receipt + MMR proof
```

## Initialize an Agent

```typescript
const agent = await lucid.agents.init({
  name: "research-agent",
  capabilities: ["web-search", "summarization"],
  passportId: "passport_agent_123"
});
```

## Plan → Accomplish → Execute

```typescript
// 1. Plan a goal
const plan = await lucid.agents.plan({
  agentId: agent.id,
  goal: "Research the latest advances in quantum computing"
});

// 2. Accomplish the goal (breaks into steps)
const result = await lucid.agents.accomplish({
  agentId: agent.id,
  planId: plan.id
});

// 3. Execute the plan
const execution = await lucid.agents.execute({
  agentId: agent.id,
  planId: plan.id,
  steps: result.steps
});

// 4. Validate execution
const validation = await lucid.agents.validate({
  agentId: agent.id,
  executionId: execution.id
});
```

## Verify Agent History

```typescript
const history = await lucid.agents.history(agentId);
const stats = await lucid.agents.stats(agentId);
const root = await lucid.agents.root(agentId); // MMR root
```
''',

    'concepts/mmr.mdx': '''---
title: "Merkle Mountain Range"
description: "The cryptographic data structure behind Lucid's receipt proofs"
---

# Merkle Mountain Range (MMR)

The **Merkle Mountain Range** is an append-only data structure that powers Lucid's receipt verification system.

## Why MMR?

| Feature | Standard Merkle Tree | MMR |
|---------|---------------------|-----|
| Append | Requires rebuild | O(log n) |
| Proof size | O(log n) | O(log n) |
| Append-only | No | Yes |
| Streaming | No | Yes |

## How It Works

```
Height 3:            15
                   /    \\
Height 2:        7        14
               /   \\    /    \\
Height 1:    3      6   10     13
            / \\   / \\  / \\   / \\
Height 0: 1   2 4   5 8  9  11  12
          R1  R2 R3 R4 R5 R6 R7  R8

Ri = Receipt i (leaf node)
Internal nodes = hash(left || right)
```

Each receipt is a **leaf** in the MMR. Internal nodes are the hash of their children. The **root** of the MMR is what gets anchored on Solana.

## Inclusion Proof

To prove receipt R3 is in the MMR, you need:
1. R3's hash (the leaf)
2. R4's hash (sibling)
3. Node 3's hash (uncle)
4. Node 14's hash (uncle)

This path lets anyone verify R3 is included without downloading all receipts.

## API

```typescript
// Get the current MMR root
const root = await lucid.mmr.root();

// Get a receipt's inclusion proof
const proof = await lucid.receipts.proof(receiptId);

// Verify the proof
const valid = verifyMMRProof(proof.leaf, proof.path, root.hash);
```

## Signer

The session signer creates Ed25519 signatures for each receipt:

```typescript
const pubkey = await lucid.signer.pubkey();
// Use this to verify receipt signatures offline
```
''',

    'concepts/solana-programs.mdx': '''---
title: "Solana Programs"
description: "On-chain programs for receipt anchoring and passport registry"
---

# Solana Programs

Lucid has two Solana programs written in Rust:

## lucid-receipts

Stores epoch MMR roots on-chain. Each anchored epoch creates a Solana account containing:

- **Epoch ID** — Sequential identifier
- **MMR Root** — The Merkle Mountain Range root hash
- **Timestamp** — When the epoch was anchored
- **Receipt Count** — Number of receipts in the epoch

### Verification

Anyone can verify a receipt by:
1. Getting the receipt's MMR proof from the API
2. Fetching the epoch's on-chain MMR root from Solana
3. Verifying the proof against the root

## lucid-registry

Manages passport registration on-chain:

- **Passport accounts** — On-chain representation of passports
- **Ownership** — Links passports to Solana wallets
- **Metadata** — Type, capabilities, status

## Program IDs

| Program | Devnet | Mainnet |
|---------|--------|---------|
| lucid-receipts | `LRec...` | TBD |
| lucid-registry | `LReg...` | TBD |

## Gas Utils

The `gas-utils` program handles CPI (Cross-Program Invocation) for gas-efficient operations across both programs.
''',

    'concepts/session-signer.mdx': '''---
title: "Session Signer"
description: "Cryptographic signing for receipt authenticity"
---

# Session Signer

The **Session Signer** is a server-side Ed25519 keypair that signs every receipt, providing cryptographic authenticity.

## How It Works

1. When a receipt is created, the signer generates an Ed25519 signature
2. The signature covers: `receipt_id || input_hash || output_hash || timestamp`
3. Anyone can verify the signature using the signer's public key

## Get the Public Key

```typescript
const { publicKey } = await lucid.signer.pubkey();
// Use this to verify signatures offline
```

## Verify a Signature

```typescript
import { verify } from "@noble/ed25519";

const receipt = await lucid.receipts.get(receiptId);
const { publicKey } = await lucid.signer.pubkey();

const message = Buffer.concat([
  Buffer.from(receipt.id),
  Buffer.from(receipt.inputHash),
  Buffer.from(receipt.outputHash),
  Buffer.from(receipt.timestamp)
]);

const valid = await verify(receipt.signature, message, publicKey);
```

## Security Model

- The signer key is managed server-side (not exposed to clients)
- Key rotation is supported (old signatures remain valid with the old key)
- The public key is always available via the API
'''
}

pages.update(concepts)

# --- API REFERENCE ---
pages['api-reference/introduction.mdx'] = '''---
title: "API Reference"
description: "Complete API reference for the Lucid protocol — 65+ endpoints"
---

# API Reference

**Base URL:** `https://api.lucid.foundation`

**Authentication:** Bearer token in `Authorization` header

## Endpoint Groups

| Group | Endpoints | Description |
|-------|-----------|-------------|
| **Passports** | 8 | Identity management (CRUD, sync, stats) |
| **Inference** | 5 | Chat completions, matching, routing |
| **Receipts** | 9 | Cryptographic receipts, proofs, verification |
| **Epochs** | 8 | Batch anchoring, verification, stats |
| **Payouts** | 4 | Payout calculation and verification |
| **Compute** | 2 | Node heartbeat and health |
| **Agents** | 14+ | Agent orchestration lifecycle |
| **Health** | 7 | System health checks |
| **Aliases** | 5 | Convenience endpoints (models, compute, tools, datasets, agents) |

## Interactive Playground

Every endpoint below has an **interactive playground** — click "Try It" to send real requests.

## SDK Code Samples

Each endpoint includes TypeScript SDK examples generated from the OpenAPI spec. Install the SDK:

```bash
npm install raijin-labs-lucid-ai
```

## Rate Limits

See [Rate Limits](/api-reference/rate-limits) for details.

## Error Codes

See [Error Reference](/api-reference/errors) for all error codes and solutions.
'''

pages['api-reference/errors.mdx'] = '''---
title: "Error Reference"
description: "All error codes and how to handle them"
---

# Error Reference

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INVALID_PASSPORT",
    "message": "Passport not found or has been revoked",
    "status": 404,
    "details": {}
  }
}
```

## Error Codes

| Code | Status | Description | Solution |
|------|--------|-------------|----------|
| `UNAUTHORIZED` | 401 | Invalid or missing API key | Check your `Authorization` header |
| `FORBIDDEN` | 403 | Insufficient permissions | Verify your API key has the required scopes |
| `NOT_FOUND` | 404 | Resource not found | Check the ID or path |
| `INVALID_PASSPORT` | 404 | Passport not found or revoked | Verify the passport ID and status |
| `RATE_LIMITED` | 429 | Too many requests | Implement exponential backoff |
| `MODEL_UNAVAILABLE` | 503 | Selected model is temporarily unavailable | Use a different model or retry |
| `EPOCH_ANCHORING_FAILED` | 500 | Solana anchoring failed | Will be retried automatically |
| `RECEIPT_VERIFICATION_FAILED` | 422 | Receipt verification failed | Check the receipt ID and proof |
| `INVALID_REQUEST` | 400 | Malformed request body | Check required fields |
| `QUOTA_EXCEEDED` | 402 | Usage quota exceeded | Upgrade your plan |

## Handling Errors

```typescript
try {
  const result = await lucid.chat.completions({ ... });
} catch (error) {
  if (error.status === 429) {
    // Rate limited — wait and retry
    await sleep(error.retryAfter * 1000);
    return retry();
  }
  if (error.status === 503) {
    // Model unavailable — try alternative
    return lucid.chat.completions({ model: "claude-3-sonnet", ... });
  }
  throw error;
}
```
'''

pages['api-reference/rate-limits.mdx'] = '''---
title: "Rate Limits"
description: "API rate limits and quotas"
---

# Rate Limits

| Plan | Requests/min | Requests/day | Concurrent |
|------|-------------|-------------|------------|
| Free | 60 | 1,000 | 5 |
| Starter | 300 | 10,000 | 20 |
| Pro | 1,000 | 100,000 | 50 |
| Enterprise | Custom | Custom | Custom |

## Headers

Every response includes rate limit headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 295
X-RateLimit-Reset: 1708300800
```

## Handling Rate Limits

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  return retry();
}
```
'''

# --- GLOSSARY ---
pages['glossary.mdx'] = '''---
title: "Glossary"
description: "Key terms and definitions"
---

# Glossary

| Term | Definition |
|------|-----------|
| **Passport** | Universal identity for models, compute nodes, tools, datasets, and agents |
| **Receipt** | Cryptographic proof of an AI inference, including input/output hashes and signature |
| **MMR** | Merkle Mountain Range — append-only data structure for receipt proofs |
| **Epoch** | A batch of receipts anchored to Solana as a single transaction |
| **Anchoring** | The process of committing an epoch's MMR root to the Solana blockchain |
| **Session Signer** | Server-side Ed25519 keypair that signs receipts |
| **Inclusion Proof** | Merkle proof showing a receipt is part of an epoch's MMR |
| **Policy** | Rules for model matching (capabilities, cost, latency requirements) |
| **Matching Engine** | Service that selects the optimal model based on policy |
| **Routing Engine** | Service that dispatches requests to the selected LLM provider |
| **Agent Orchestrator** | Service managing the plan → accomplish → execute → validate lifecycle |
| **Payout** | Revenue split calculation between model provider, compute provider, and platform |
| **FlowSpec** | Visual workflow specification format (n8n-compatible) |
| **BYOK** | Bring Your Own Key — use your own provider API keys through Lucid |
'''

# ============================================================
# 3. Write all pages
# ============================================================
for path, content in pages.items():
    full_path = os.path.join(DOCS, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ {path}")

# ============================================================
# 4. Delete starter kit files
# ============================================================
delete_items = [
    'essentials',
    'snippets',
    'development.mdx',
    'api-reference/openapi.json'
]

for item in delete_items:
    full_path = os.path.join(DOCS, item)
    if os.path.isdir(full_path):
        shutil.rmtree(full_path)
        print(f"🗑️  Deleted {item}/")
    elif os.path.isfile(full_path):
        os.remove(full_path)
        print(f"🗑️  Deleted {item}")

print(f"\n{'='*60}")
print(f"Sprint 1 complete: {len(pages)} pages created")
print(f"{'='*60}")