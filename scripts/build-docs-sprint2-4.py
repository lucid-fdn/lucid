"""Sprints 2-4: Guides + SDKs + Platform pages"""
import os

DOCS = r'c:\docs'
pages = {}

# ============================================================
# SPRINT 2: GUIDE PAGES
# ============================================================

pages['guides/first-inference.mdx'] = '''---
title: "Your First Inference"
description: "Run your first AI inference with a cryptographic receipt"
---

import { Steps, CodeGroup, Tip } from 'mintlify/components'

# Your First Inference

This guide walks you through running an AI inference and verifying the cryptographic receipt.

## Prerequisites

- A Lucid API key ([get one here](https://app.lucid.foundation))
- Node.js 18+ installed
- `raijin-labs-lucid-ai` SDK installed

## Steps

<Steps>
  <Step title="Initialize the SDK">
    ```typescript
    import { LucidAI } from "raijin-labs-lucid-ai";

    const lucid = new LucidAI({
      bearerAuth: process.env.LUCID_API_KEY,
    });
    ```
  </Step>

  <Step title="Send a chat completion">
    ```typescript
    const response = await lucid.chat.completions({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is verifiable AI inference?" }
      ],
      temperature: 0.7,
    });

    console.log(response.choices[0].message.content);
    ```
  </Step>

  <Step title="Get the receipt">
    ```typescript
    // The receipt ID is returned in the response
    const receiptId = response.receiptId;
    const receipt = await lucid.receipts.get(receiptId);

    console.log("Receipt ID:", receipt.id);
    console.log("Input hash:", receipt.inputHash);
    console.log("Output hash:", receipt.outputHash);
    console.log("Epoch:", receipt.epochId);
    ```
  </Step>

  <Step title="Verify the receipt">
    ```typescript
    const verification = await lucid.receipts.verify(receiptId);

    console.log("Signature valid:", verification.signatureValid);
    console.log("MMR proof valid:", verification.proofValid);
    console.log("Overall valid:", verification.valid);
    ```
  </Step>
</Steps>

<Tip>
  The receipt is created automatically — no extra API call needed during inference.
</Tip>

## What Happened

1. Your request was **matched** to the best available model
2. The LLM processed your request
3. A **cryptographic receipt** was generated with SHA-256 hashes of input/output
4. The receipt was **signed** by the session signer (Ed25519)
5. The receipt was added to the current **epoch's MMR**
6. The epoch will be **anchored on Solana** when it closes

## Next Steps

- [Passport Management](/guides/passport-management) — Create and manage identities
- [Verifiable Receipts](/guides/verifiable-receipts) — Deep-dive into the receipt system
- [Streaming](/guides/streaming) — Use server-sent events for real-time responses
'''

pages['guides/passport-management.mdx'] = '''---
title: "Passport Management"
description: "Create, update, and manage passports for models, agents, and more"
---

import { Steps, CodeGroup } from 'mintlify/components'

# Passport Management

Passports are the universal identity layer in Lucid. This guide covers CRUD operations.

## Create a Passport

<CodeGroup>
  ```typescript TypeScript SDK
  const passport = await lucid.passports.create({
    name: "my-gpt4o-model",
    type: "model",
    metadata: {
      provider: "openai",
      model: "gpt-4o",
      maxTokens: 128000,
      capabilities: ["chat", "function-calling", "vision"]
    },
    tags: ["production", "gpt-4o"]
  });

  console.log("Created:", passport.id);
  ```
  ```bash curl
  curl -X POST "https://api.lucid.foundation/v1/passports" \\
    -H "Authorization: Bearer $LUCID_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "name": "my-gpt4o-model",
      "type": "model",
      "metadata": { "provider": "openai" },
      "tags": ["production"]
    }'
  ```
</CodeGroup>

## List Passports

```typescript
// List all passports
const all = await lucid.passports.list();

// Filter by type
const models = await lucid.passports.list({ type: "model" });
const agents = await lucid.passports.list({ type: "agent" });

// Filter by tags
const prod = await lucid.passports.list({ tags: ["production"] });
```

## Update a Passport

```typescript
await lucid.passports.update(passportId, {
  metadata: { ...existingMetadata, maxTokens: 256000 },
  tags: ["production", "upgraded"]
});
```

## Delete a Passport

```typescript
await lucid.passports.delete(passportId);
```

## Sync to Solana

```typescript
// Sync a passport to the on-chain registry
await lucid.passports.sync(passportId);

// Check pending syncs
const pending = await lucid.passports.pendingSync();
```

## Passport Stats

```typescript
const stats = await lucid.passports.stats();
console.log("Total:", stats.total);
console.log("By type:", stats.byType);
```
'''

pages['guides/error-handling.mdx'] = '''---
title: "Error Handling"
description: "Best practices for handling Lucid API errors"
---

# Error Handling

All Lucid API errors follow a consistent format with actionable error codes.

## Error Format

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please retry after 30 seconds.",
    "status": 429,
    "details": { "retryAfter": 30 }
  }
}
```

## SDK Error Handling

```typescript
import { LucidAI } from "raijin-labs-lucid-ai";

const lucid = new LucidAI({ bearerAuth: process.env.LUCID_API_KEY });

try {
  const result = await lucid.chat.completions({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }]
  });
} catch (error) {
  switch (error.status) {
    case 401:
      console.error("Invalid API key");
      break;
    case 429:
      // Rate limited — exponential backoff
      const delay = error.details?.retryAfter || 30;
      await new Promise(r => setTimeout(r, delay * 1000));
      break;
    case 503:
      // Model unavailable — try fallback
      console.error("Model unavailable, trying fallback...");
      break;
    default:
      console.error(`Error ${error.status}: ${error.message}`);
  }
}
```

## Retry Pattern

```typescript
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

const result = await withRetry(() =>
  lucid.chat.completions({ model: "gpt-4o", messages: [...] })
);
```

See the full [Error Reference](/api-reference/errors) for all error codes.
'''

pages['guides/verifiable-receipts.mdx'] = '''---
title: "Verifiable Receipts"
description: "Deep-dive into the cryptographic receipt system"
---

# Verifiable Receipts

Every AI inference in Lucid produces a **cryptographic receipt** — an immutable, verifiable proof.

## Receipt Anatomy

```typescript
interface Receipt {
  id: string;              // Unique receipt ID
  runId: string;           // Inference run ID
  inputHash: string;       // SHA-256 of input
  outputHash: string;      // SHA-256 of output
  modelPassport: string;   // Model's passport ID
  signature: string;       // Ed25519 signature
  mmrPosition: number;     // Position in Merkle Mountain Range
  epochId: string;         // Epoch this receipt belongs to
  timestamp: string;       // ISO 8601 timestamp
}
```

## Verification Flow

```
1. Get receipt → API returns receipt with signature + proof
2. Verify signature → Ed25519 verify with signer's public key
3. Verify MMR proof → Check inclusion in epoch's MMR root
4. Verify on-chain → Compare MMR root with Solana anchor
```

## Full Verification Example

```typescript
// Step 1: Get the receipt
const receipt = await lucid.receipts.get(receiptId);

// Step 2: Verify via API (does all checks)
const result = await lucid.receipts.verify(receiptId);
console.log("Signature OK:", result.signatureValid);
console.log("MMR proof OK:", result.proofValid);
console.log("On-chain OK:", result.onChainValid);

// Step 3: Get raw proof for independent verification
const proof = await lucid.receipts.proof(receiptId);
console.log("Leaf:", proof.leaf);
console.log("Path:", proof.path);
console.log("Root:", proof.root);
```

## Batch Verification

```typescript
const receiptIds = ["receipt_1", "receipt_2", "receipt_3"];
const results = await Promise.all(
  receiptIds.map(id => lucid.receipts.verify(id))
);

const allValid = results.every(r => r.valid);
```
'''

pages['guides/epoch-verification.mdx'] = '''---
title: "Epoch Verification"
description: "Verify epochs on the Solana blockchain"
---

# Epoch Verification

Epochs batch receipts and anchor them on Solana. This guide shows how to verify epoch integrity.

## Check Current Epoch

```typescript
const current = await lucid.epochs.current();
console.log("Epoch:", current.id);
console.log("Status:", current.status); // "open", "anchoring", "anchored"
console.log("Receipts:", current.receiptCount);
```

## List Anchored Epochs

```typescript
const epochs = await lucid.epochs.list({ status: "anchored" });

for (const epoch of epochs) {
  console.log(`Epoch ${epoch.id}: ${epoch.receiptCount} receipts`);
  console.log(`  Solana TX: ${epoch.transactionHash}`);
  console.log(`  MMR Root: ${epoch.mmrRoot}`);
}
```

## Verify an Epoch On-Chain

```typescript
const verification = await lucid.epochs.verify(epochId);

console.log("On-chain:", verification.onChain);
console.log("Root matches:", verification.rootMatches);
console.log("TX confirmed:", verification.transactionConfirmed);
console.log("Solana slot:", verification.slot);
```

## Retry Failed Anchoring

```typescript
// If an epoch failed to anchor, retry it
await lucid.epochs.retryAnchor(epochId);
```

## Epoch Statistics

```typescript
const stats = await lucid.epochs.stats();
console.log("Total:", stats.total);
console.log("Anchored:", stats.anchored);
console.log("Pending:", stats.pending);
console.log("Failed:", stats.failed);
```
'''

pages['guides/agent-orchestration.mdx'] = '''---
title: "Agent Orchestration"
description: "Build autonomous agents with verifiable execution traces"
---

# Agent Orchestration

Lucid agents follow a **plan → accomplish → execute → validate** lifecycle, with every step generating verifiable receipts.

## Initialize an Agent

```typescript
const agent = await lucid.agents.init({
  name: "research-agent",
  passportId: "passport_agent_123",
  capabilities: ["web-search", "summarization", "code-generation"]
});
```

## Plan a Goal

```typescript
const plan = await lucid.agents.plan({
  agentId: agent.id,
  goal: "Research the latest advances in quantum computing and summarize the top 5 breakthroughs"
});

console.log("Steps:", plan.steps.length);
plan.steps.forEach((step, i) => console.log(`  ${i + 1}. ${step.description}`));
```

## Execute the Plan

```typescript
const execution = await lucid.agents.execute({
  agentId: agent.id,
  planId: plan.id
});

console.log("Status:", execution.status);
console.log("Results:", execution.results);
console.log("Receipts:", execution.receiptIds); // Every step has a receipt!
```

## Validate Results

```typescript
const validation = await lucid.agents.validate({
  agentId: agent.id,
  executionId: execution.id
});

console.log("Valid:", validation.valid);
console.log("Score:", validation.qualityScore);
```

## Verify Agent History

```typescript
// Full audit trail
const history = await lucid.agents.history(agent.id);

// MMR root for all agent receipts
const root = await lucid.agents.root(agent.id);
```
'''

pages['guides/streaming.mdx'] = '''---
title: "Streaming"
description: "Real-time streaming responses with server-sent events"
---

# Streaming

Lucid supports SSE (Server-Sent Events) streaming for real-time responses.

## TypeScript SDK

```typescript
const stream = await lucid.chat.completions({
  model: "gpt-4o",
  messages: [
    { role: "user", content: "Write a short poem about AI" }
  ],
  stream: true
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

## curl

```bash
curl -X POST "https://api.lucid.foundation/v1/chat/completions" \\
  -H "Authorization: Bearer $LUCID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

## Next.js Integration

```typescript
// app/api/chat/route.ts
import { LucidAI } from "raijin-labs-lucid-ai";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lucid = new LucidAI({ bearerAuth: process.env.LUCID_API_KEY });

  const stream = await lucid.chat.completions({
    model: "gpt-4o",
    messages,
    stream: true,
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```
'''

pages['guides/compute-providers.mdx'] = '''---
title: "Compute Providers"
description: "Register and manage compute nodes in the Lucid network"
---

# Compute Providers

Register your GPU infrastructure as a compute node in the Lucid network.

## Register a Node

```typescript
const passport = await lucid.passports.create({
  name: "my-gpu-node",
  type: "compute",
  metadata: {
    gpu: "NVIDIA A100",
    vram: "80GB",
    region: "us-east-1",
    capabilities: ["inference", "fine-tuning"]
  }
});
```

## Heartbeat

Send regular heartbeats to maintain active status:

```typescript
// Send every 30 seconds
setInterval(async () => {
  await lucid.compute.heartbeat({
    passportId: passport.id,
    status: "healthy",
    load: 0.45, // 45% utilization
    availableModels: ["llama-3-70b", "mistral-7b"]
  });
}, 30000);
```

## Health Check

```typescript
const health = await lucid.compute.health(passport.id);
console.log("Status:", health.status);
console.log("Uptime:", health.uptimeSeconds);
console.log("Jobs completed:", health.jobsCompleted);
```
'''

pages['guides/hf-passport-sync.mdx'] = '''---
title: "HuggingFace Passport Sync"
description: "Sync HuggingFace models as Lucid passports"
---

# HuggingFace Passport Sync

Automatically import HuggingFace models as Lucid passports with full metadata.

## Sync a Model

```typescript
const passport = await lucid.passports.sync({
  source: "huggingface",
  modelId: "meta-llama/Llama-3-70b",
  tags: ["llama", "open-source"]
});

console.log("Passport:", passport.id);
console.log("Metadata:", passport.metadata);
// Includes: downloads, likes, pipeline_tag, library_name, etc.
```

## Bulk Sync

```typescript
const models = [
  "meta-llama/Llama-3-70b",
  "mistralai/Mistral-7B-v0.1",
  "google/gemma-2-9b"
];

const passports = await Promise.all(
  models.map(modelId =>
    lucid.passports.sync({ source: "huggingface", modelId })
  )
);
```
'''

pages['guides/n8n-integration.mdx'] = '''---
title: "n8n Integration"
description: "Use Lucid with n8n workflow automation"
---

# n8n Integration

Lucid provides n8n nodes for visual workflow automation.

## Available Nodes

| Node | Description |
|------|-------------|
| **Lucid Inference** | Run chat completions |
| **Lucid Passport** | CRUD passport operations |
| **Lucid Receipt** | Get and verify receipts |
| **Lucid Epoch** | Query epoch status |

## Setup

1. Install the Lucid n8n community node
2. Add your API key in n8n credentials
3. Drag Lucid nodes into your workflow

## Example Workflow

```
[Webhook Trigger] → [Lucid Inference] → [Lucid Receipt Verify] → [Slack Notification]
```

This workflow:
1. Receives a webhook with a user question
2. Runs inference through Lucid
3. Verifies the receipt
4. Sends the verified result to Slack
'''

pages['guides/nango-oauth.mdx'] = '''---
title: "OAuth Connections"
description: "Connect third-party services via Nango OAuth"
---

# OAuth Connections

Lucid uses Nango for managing OAuth connections to third-party services.

## Supported Providers

- GitHub, GitLab, Bitbucket
- Google (Drive, Sheets, Calendar)
- Slack, Discord
- HuggingFace
- Twitter/X

## Connect a Provider

```typescript
// Initiate OAuth flow
const connection = await lucid.oauth.connect({
  provider: "github",
  redirectUrl: "https://app.lucid.foundation/callback"
});

// Open connection.authUrl in browser
```

## List Connections

```typescript
const connections = await lucid.oauth.list();
connections.forEach(c => {
  console.log(`${c.provider}: ${c.status}`);
});
```
'''

pages['guides/crewai-integration.mdx'] = '''---
title: "CrewAI Integration"
description: "Multi-agent systems with CrewAI and Lucid"
---

# CrewAI Integration

Build multi-agent systems using CrewAI with Lucid's verifiable infrastructure.

## Setup

```python
from crewai import Agent, Task, Crew
from lucid import LucidProvider

# Use Lucid as the LLM provider
provider = LucidProvider(api_key="your-key")

researcher = Agent(
    role="Researcher",
    goal="Find accurate information",
    llm=provider.get_model("gpt-4o")
)

writer = Agent(
    role="Writer",
    goal="Create compelling content",
    llm=provider.get_model("claude-3-sonnet")
)
```

## Verifiable Crews

Every agent action generates a Lucid receipt, creating a full audit trail of the multi-agent collaboration.
'''

pages['guides/self-hosting.mdx'] = '''---
title: "Self-Hosting"
description: "Deploy Lucid infrastructure on your own servers"
---

# Self-Hosting

Deploy the Lucid stack on your own infrastructure.

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  API Server  │  │Anchor Worker│  │  GPU Worker  │
│  (Node.js)   │  │  (Node.js)  │  │  (Python)    │
└──────┬───────┘  └──────┬──────┘  └──────┬───────┘
       │                 │                 │
       └─────────┬───────┘                 │
           ┌─────▼──────┐           ┌──────▼──────┐
           │  Supabase   │           │   vLLM /    │
           │ (Postgres)  │           │  Inference  │
           └─────────────┘           └─────────────┘
```

## Docker Compose

```yaml
version: "3.8"
services:
  api:
    build: ./offchain
    ports: ["3001:3001"]
    environment:
      DATABASE_URL: postgresql://...
      SOLANA_RPC_URL: https://api.mainnet-beta.solana.com
  
  anchor-worker:
    build: ./workers/anchor-worker
    environment:
      DATABASE_URL: postgresql://...
      SIGNER_PRIVATE_KEY: ...
  
  inference-worker:
    build: ./workers/inference-worker
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
```

## Requirements

- PostgreSQL 15+ (or Supabase)
- Solana RPC endpoint
- Ed25519 keypair for session signer
- GPU (optional, for self-hosted inference)
'''

pages['guides/webhooks.mdx'] = '''---
title: "Webhooks"
description: "Receive real-time notifications for events"
---

# Webhooks

Configure webhooks to receive notifications when events occur.

## Events

| Event | Description |
|-------|-------------|
| `receipt.created` | New receipt generated |
| `epoch.anchored` | Epoch anchored on Solana |
| `passport.synced` | Passport synced on-chain |
| `agent.completed` | Agent execution finished |

## Setup

```typescript
// Register a webhook endpoint
await lucid.webhooks.create({
  url: "https://your-app.com/webhooks/lucid",
  events: ["receipt.created", "epoch.anchored"]
});
```

## Verify Webhook Signatures

```typescript
import { verify } from "crypto";

function verifyWebhook(payload, signature, secret) {
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```
'''

# ============================================================
# SPRINT 3: SDK & TOOLS PAGES
# ============================================================

pages['sdks/typescript.mdx'] = '''---
title: "TypeScript SDK"
description: "Official TypeScript SDK for the Lucid API"
---

import { Tip } from 'mintlify/components'

# TypeScript SDK

The official SDK is generated by [Speakeasy](https://speakeasyapi.dev/) with full type safety.

## Installation

```bash
npm install raijin-labs-lucid-ai
```

## Quick Start

```typescript
import { LucidAI } from "raijin-labs-lucid-ai";

const lucid = new LucidAI({
  bearerAuth: process.env.LUCID_API_KEY,
});

// List passports
const passports = await lucid.passports.list();

// Run inference
const response = await lucid.chat.completions({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }]
});
```

## Method Groups

The SDK is organized into logical method groups matching the API:

| Group | Import | Description |
|-------|--------|-------------|
| `passports` | `lucid.passports.*` | Passport CRUD + sync |
| `chat` | `lucid.chat.*` | Chat completions |
| `inference` | `lucid.inference.*` | Direct inference |
| `match` | `lucid.match.*` | Model matching |
| `receipts` | `lucid.receipts.*` | Receipt operations |
| `epochs` | `lucid.epochs.*` | Epoch management |
| `agents` | `lucid.agents.*` | Agent orchestration |
| `payouts` | `lucid.payouts.*` | Payout calculations |
| `compute` | `lucid.compute.*` | Compute management |
| `signer` | `lucid.signer.*` | Session signer |
| `health` | `lucid.health.*` | Health checks |

<Tip>
  All methods return typed responses. Use your IDE's autocomplete to explore available fields.
</Tip>

## Error Handling

```typescript
try {
  await lucid.passports.get("invalid-id");
} catch (error) {
  console.error(error.status);  // 404
  console.error(error.code);    // "NOT_FOUND"
  console.error(error.message); // "Passport not found"
}
```

## Configuration

```typescript
const lucid = new LucidAI({
  bearerAuth: "your-key",
  serverURL: "https://staging.api.lucid.foundation", // Custom URL
  timeoutMs: 30000, // Request timeout
});
```
'''

pages['sdks/typescript-passports.mdx'] = '''---
title: "Passports SDK"
description: "TypeScript SDK methods for passport operations"
---

# Passports SDK Reference

## `passports.list(options?)`

List all passports with optional filtering.

```typescript
const passports = await lucid.passports.list({
  type: "model",      // Filter by type
  tags: ["production"], // Filter by tags
  limit: 50,           // Pagination
  offset: 0
});
```

## `passports.create(data)`

```typescript
const passport = await lucid.passports.create({
  name: "my-model",
  type: "model",
  metadata: { provider: "openai" },
  tags: ["production"]
});
```

## `passports.get(id)`

```typescript
const passport = await lucid.passports.get("passport_abc123");
```

## `passports.update(id, data)`

```typescript
await lucid.passports.update("passport_abc123", {
  tags: ["production", "v2"]
});
```

## `passports.delete(id)`

```typescript
await lucid.passports.delete("passport_abc123");
```

## `passports.sync(id)`

```typescript
await lucid.passports.sync("passport_abc123");
```

## `passports.stats()`

```typescript
const stats = await lucid.passports.stats();
// { total: 150, byType: { model: 50, agent: 30, ... } }
```
'''

pages['sdks/typescript-inference.mdx'] = '''---
title: "Inference SDK"
description: "TypeScript SDK methods for inference operations"
---

# Inference SDK Reference

## `chat.completions(options)`

OpenAI-compatible chat completions.

```typescript
const response = await lucid.chat.completions({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hello" }
  ],
  temperature: 0.7,
  max_tokens: 1000,
  stream: false
});
```

## `match.match(requirements)`

Find the best model for your requirements.

```typescript
const match = await lucid.match.match({
  requirements: {
    capabilities: ["chat", "vision"],
    maxLatency: 2000,
    costTier: "standard"
  }
});
```

## `match.explain(requirements)`

Get a detailed explanation of model selection.

```typescript
const explanation = await lucid.match.explain({
  requirements: { capabilities: ["function-calling"] }
});
```
'''

pages['sdks/typescript-receipts.mdx'] = '''---
title: "Receipts SDK"
description: "TypeScript SDK methods for receipt operations"
---

# Receipts SDK Reference

## `receipts.get(id)`

```typescript
const receipt = await lucid.receipts.get("receipt_abc123");
```

## `receipts.create(data)`

```typescript
const receipt = await lucid.receipts.create({
  runId: "run_abc",
  inputHash: "sha256:...",
  outputHash: "sha256:...",
  modelPassport: "passport_xyz"
});
```

## `receipts.verify(id)`

Full verification (signature + MMR proof + on-chain).

```typescript
const result = await lucid.receipts.verify("receipt_abc123");
// { valid: true, signatureValid: true, proofValid: true, onChainValid: true }
```

## `receipts.proof(id)`

Get the raw MMR inclusion proof.

```typescript
const proof = await lucid.receipts.proof("receipt_abc123");
// { leaf: "...", path: [...], root: "...", position: 42 }
```
'''

pages['sdks/typescript-agents.mdx'] = '''---
title: "Agents SDK"
description: "TypeScript SDK methods for agent orchestration"
---

# Agents SDK Reference

## `agents.init(options)`

```typescript
const agent = await lucid.agents.init({
  name: "research-agent",
  passportId: "passport_agent_123",
  capabilities: ["web-search", "summarization"]
});
```

## `agents.plan(options)`

```typescript
const plan = await lucid.agents.plan({
  agentId: agent.id,
  goal: "Research quantum computing breakthroughs"
});
```

## `agents.accomplish(options)`

```typescript
const result = await lucid.agents.accomplish({
  agentId: agent.id,
  planId: plan.id
});
```

## `agents.execute(options)`

```typescript
const execution = await lucid.agents.execute({
  agentId: agent.id,
  planId: plan.id,
  steps: result.steps
});
```

## `agents.validate(options)`

```typescript
const validation = await lucid.agents.validate({
  agentId: agent.id,
  executionId: execution.id
});
```

## `agents.history(agentId)`

```typescript
const history = await lucid.agents.history(agent.id);
```

## `agents.root(agentId)`

```typescript
const root = await lucid.agents.root(agent.id);
// MMR root for all agent receipts
```
'''

pages['sdks/python.mdx'] = '''---
title: "Python SDK"
description: "Python SDK for the Lucid API"
---

import { Warning } from 'mintlify/components'

# Python SDK

<Warning>
  The Python SDK is **coming soon**. Use the REST API in the meantime.
</Warning>

## Planned Usage

```python
from lucid import LucidAI

lucid = LucidAI(api_key="your-api-key")

# List passports
passports = lucid.passports.list()

# Run inference
response = lucid.chat.completions(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Verify receipt
verification = lucid.receipts.verify(receipt_id)
```

## REST Alternative

Until the Python SDK is available, use the `requests` library:

```python
import requests

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

response = requests.get(
    "https://api.lucid.foundation/v1/passports",
    headers=headers
)

passports = response.json()
```
'''

pages['sdks/rest.mdx'] = '''---
title: "REST API"
description: "Direct HTTP access — works with any language"
---

# REST API

Use the Lucid API directly with any HTTP client.

## Base URL

```
https://api.lucid.foundation
```

## Authentication

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.lucid.foundation/v1/passports
```

## Common Operations

### List Passports

```bash
curl https://api.lucid.foundation/v1/passports \\
  -H "Authorization: Bearer $LUCID_API_KEY"
```

### Chat Completion

```bash
curl -X POST https://api.lucid.foundation/v1/chat/completions \\
  -H "Authorization: Bearer $LUCID_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Verify Receipt

```bash
curl https://api.lucid.foundation/v1/receipts/RECEIPT_ID/verify \\
  -H "Authorization: Bearer $LUCID_API_KEY"
```

See the full [API Reference](/api-reference/introduction) for all endpoints.
'''

pages['ai-tools/cursor.mdx'] = '''---
title: "Cursor"
description: "Use Lucid with Cursor IDE via MCP"
---

# Cursor Integration

Connect Lucid to Cursor IDE using the Model Context Protocol (MCP).

## Setup

Add to your Cursor MCP config (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "lucid": {
      "command": "npx",
      "args": ["-y", "@raijinlabs/mcp-server"],
      "env": {
        "LUCID_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

Once connected, Cursor can:
- **Search passports** — Find models, agents, and tools
- **Run inference** — Execute chat completions
- **Verify receipts** — Check receipt integrity
- **Query epochs** — Get anchoring status

## Usage

In Cursor chat, mention Lucid tools naturally:

> "Use the Lucid MCP to list all model passports tagged 'production'"
'''

pages['ai-tools/claude-code.mdx'] = '''---
title: "Claude Code"
description: "Use Lucid with Claude Code via MCP"
---

# Claude Code Integration

Connect Lucid to Claude Code (claude.ai/code) using MCP.

## Setup

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "lucid": {
      "command": "npx",
      "args": ["-y", "@raijinlabs/mcp-server"],
      "env": {
        "LUCID_API_KEY": "your-api-key"
      }
    }
  }
}
```

## What You Can Do

- Query the Lucid API from Claude Code conversations
- Search for models and agents in the passport registry
- Run inferences and verify receipts
- Check epoch anchoring status
'''

pages['ai-tools/windsurf.mdx'] = '''---
title: "Windsurf"
description: "Use Lucid with Windsurf IDE via MCP"
---

# Windsurf Integration

Connect Lucid to Windsurf IDE using MCP.

## Setup

Add to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "lucid": {
      "command": "npx",
      "args": ["-y", "@raijinlabs/mcp-server"],
      "env": {
        "LUCID_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

All Lucid API operations are available as MCP tools:
- Passport management
- Inference execution
- Receipt verification
- Epoch queries
'''

pages['sdks/mcp-server.mdx'] = '''---
title: "MCP Server"
description: "Model Context Protocol server for AI IDE integration"
---

# MCP Server

The Lucid MCP server exposes the full API as tools for AI IDEs.

## Installation

```bash
npx @raijinlabs/mcp-server
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LUCID_API_KEY` | Your API key | Yes |
| `LUCID_BASE_URL` | Custom base URL | No |

## Supported IDEs

- [Cursor](/ai-tools/cursor)
- [Claude Code](/ai-tools/claude-code)
- [Windsurf](/ai-tools/windsurf)
- VS Code (with MCP extension)

## Available Tools

| Tool | Description |
|------|-------------|
| `lucid_passports_list` | List passports |
| `lucid_passports_create` | Create a passport |
| `lucid_chat_completions` | Run chat completions |
| `lucid_receipts_verify` | Verify a receipt |
| `lucid_epochs_current` | Get current epoch |
| `lucid_health` | Check API health |
'''

# ============================================================
# SPRINT 4: PLATFORM PAGES
# ============================================================

pages['platform/billing.mdx'] = '''---
title: "Billing"
description: "Pricing plans and billing management"
---

# Billing

## Plans

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| Requests/month | 1,000 | 10,000 | 100,000 | Custom |
| Models | 10 | 50 | 100+ | All |
| Receipts | ✅ | ✅ | ✅ | ✅ |
| On-chain anchoring | ❌ | ✅ | ✅ | ✅ |
| Agent orchestration | ❌ | ❌ | ✅ | ✅ |
| SLA | — | 99.5% | 99.9% | 99.99% |
| Support | Community | Email | Priority | Dedicated |

## Manage Billing

Billing is managed through Stripe via the [dashboard](https://app.lucid.foundation/settings/billing).

## Usage-Based Pricing

Beyond plan limits, usage is metered per-request with transparent pricing.
'''

pages['platform/api-keys.mdx'] = '''---
title: "API Keys"
description: "Create and manage API keys"
---

# API Keys

## Create a Key

1. Go to [Dashboard → Settings → API Keys](https://app.lucid.foundation/settings/keys)
2. Click **Create Key**
3. Set permissions and expiration
4. Copy the key (shown only once)

## Key Scopes

| Scope | Description |
|-------|-------------|
| `passports:read` | List and get passports |
| `passports:write` | Create, update, delete passports |
| `inference:run` | Run chat completions |
| `receipts:read` | Get and verify receipts |
| `admin` | Full access |

## Rotate Keys

```typescript
// Old key continues working for 24 hours after rotation
await lucid.keys.rotate(keyId);
```

## Best Practices

- Use separate keys for production and development
- Set the minimum required scopes
- Rotate keys regularly
- Never commit keys to source control
'''

pages['platform/metering.mdx'] = '''---
title: "Usage Metering"
description: "Track API usage and costs"
---

# Usage Metering

Lucid uses OpenMeter for precise usage tracking.

## What's Metered

| Metric | Description |
|--------|-------------|
| `requests` | Total API requests |
| `tokens_in` | Input tokens processed |
| `tokens_out` | Output tokens generated |
| `receipts` | Receipts created |
| `epochs_anchored` | Epochs anchored on Solana |

## View Usage

```typescript
const usage = await lucid.usage.current();
console.log("Requests this month:", usage.requests);
console.log("Tokens used:", usage.tokensIn + usage.tokensOut);
```

## Dashboard

View real-time usage at [Dashboard → Usage](https://app.lucid.foundation/settings/usage).
'''

pages['platform/quotas.mdx'] = '''---
title: "Quotas"
description: "Rate limits and usage quotas"
---

# Quotas

## Rate Limits

| Plan | Requests/min | Concurrent |
|------|-------------|------------|
| Free | 60 | 5 |
| Starter | 300 | 20 |
| Pro | 1,000 | 50 |
| Enterprise | Custom | Custom |

## Monthly Quotas

Quotas reset on the 1st of each month. When exceeded:
- Free plan: Requests blocked until reset
- Paid plans: Overage billing at per-request rate

## Check Quota

```typescript
const quota = await lucid.usage.quota();
console.log("Limit:", quota.limit);
console.log("Used:", quota.used);
console.log("Remaining:", quota.remaining);
```
'''

pages['platform/organizations.mdx'] = '''---
title: "Organizations"
description: "Multi-tenancy and team management"
---

# Organizations

Lucid supports multi-tenant organizations for team collaboration.

## Hierarchy

```
Organization
  └── Projects
       └── Environments (prod, staging, dev)
            └── Resources (passports, keys, etc.)
```

## Create an Organization

Via the [dashboard](https://app.lucid.foundation/settings/org) or API.

## Invite Members

```typescript
await lucid.organizations.invite({
  email: "teammate@company.com",
  role: "developer" // "admin" | "developer" | "viewer"
});
```

## Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access, billing, member management |
| Developer | API access, passport management |
| Viewer | Read-only access |
'''

pages['platform/dashboard.mdx'] = '''---
title: "Dashboard"
description: "Navigate the Lucid dashboard"
---

# Dashboard

The [Lucid Dashboard](https://app.lucid.foundation) provides a visual interface for managing your account.

## Sections

| Section | Description |
|---------|-------------|
| **Overview** | Usage stats, recent activity |
| **Passports** | Browse and manage passports |
| **Receipts** | Search and verify receipts |
| **Epochs** | Anchoring status and history |
| **Settings** | API keys, billing, team |

## Quick Actions

- **Create Passport** — Register a new model/agent
- **Run Inference** — Test chat completions
- **Verify Receipt** — Check a receipt's validity
- **View Epochs** — See anchoring history
'''

pages['platform/security.mdx'] = '''---
title: "Security"
description: "Security practices and compliance"
---

# Security

## Authentication

- Bearer token authentication (API keys)
- Ed25519 signatures on all receipts
- HMAC webhook signatures

## Data Protection

- All data encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- Input/output hashes stored (not raw content)

## On-Chain Verification

- MMR roots anchored on Solana (immutable)
- Anyone can verify receipts independently
- No single point of trust

## Key Management

- API keys hashed before storage
- Key rotation with 24-hour grace period
- Session signer keys managed in HSM

## Compliance

- SOC 2 Type II (in progress)
- GDPR compliant
- No raw inference data stored by default
'''

pages['platform/sla.mdx'] = '''---
title: "SLA"
description: "Service Level Agreement and uptime guarantees"
---

# Service Level Agreement

## Uptime Guarantees

| Plan | Uptime SLA |
|------|------------|
| Free | Best effort |
| Starter | 99.5% |
| Pro | 99.9% |
| Enterprise | 99.99% |

## Status Page

Monitor real-time status at: [status.lucid.foundation](https://status.lucid.foundation)

## Health Endpoints

```bash
# Basic health
curl https://api.lucid.foundation/health

# Detailed health (includes DB, Solana, services)
curl https://api.lucid.foundation/health/detailed
```

## Incident Response

- **P0** (total outage): 15-minute response
- **P1** (partial outage): 1-hour response
- **P2** (degraded): 4-hour response
'''

# ============================================================
# WRITE ALL PAGES
# ============================================================
for path, content in pages.items():
    full_path = os.path.join(DOCS, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ {path}")

print(f"\n{'='*60}")
print(f"Sprints 2-4 complete: {len(pages)} pages created")
print(f"{'='*60}")