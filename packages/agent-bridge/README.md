# @lucid/agent-bridge

Bring Your Own Agent SDK — connect any agent framework to Lucid Mission Control.

Implements the client side of the dedicated/BYO runtime phone-home protocol: heartbeat, events, approvals, costs, capability reports, management command ACKs, and C1 REST message relay. Zero runtime dependencies — uses Node.js built-in `fetch`, `os`, and `crypto`.

The SDK is engine-agnostic. Runtime identity is reported with:
- `engine`
- `runtimeProtocol`
- `engineVersion`
- `runtimeVersion`
- adapter identity
- native capabilities
- runtime services
- probe/parser status
- Engine Home policy

Legacy OpenClaw runtimes may also send `openclawVersion` during the migration window.

## Capability And Command Plane

Runtimes can report a `RuntimeCapabilityReport` in heartbeat payloads. Mission Control persists the latest report on the runtime row and uses it to render Runtime Detail without hardcoding Hermes/OpenClaw feature tables.

Capability heartbeat fields include:

- `adapterIdentity`
- `nativeCapabilities`
- `runtimeServices`
- `adapterProbe`
- `transcriptParser`
- `commandSpec`
- `engineHomePolicy`

The control plane may queue runtime management commands. A runtime should ACK them as one of:

- `accepted`
- `rejected`
- `needs_user_action`
- `applied`
- `failed`

Built-in worker commands currently include:

- `adapter.probe`
- `capability.refresh`
- `runtime.services.inspect`
- `transcript.parser.test`
- `runtime.config.refresh`
- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`

BYO/local runtimes may refuse or request user action according to local policy. Lucid-operated runtimes should keep provider/env/image/internal details server-side and return sanitized responses to the browser.

## Installation

```bash
npm install @lucid/agent-bridge
```

> **Monorepo usage**: The worker consumes this via `"@lucid/agent-bridge": "file:../packages/agent-bridge"`. When published externally, install as `@lucid-fdn/agent-bridge`.

## Quick start

### Full mode — Lucid drives execution

Use when Lucid manages message delivery (channels configured in Mission Control). The SDK polls for inbound messages, dispatches them to your handler, and completes the cycle.

```typescript
import { LucidBridge } from '@lucid/agent-bridge'

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  engine: process.env.LUCID_ENGINE || 'openclaw',
  runtimeProtocol: process.env.LUCID_RUNTIME_PROTOCOL || 'lucid-runtime-v2',
  mode: 'full',
})

bridge.onMessage(async (packet, ctx) => {
  // packet contains the user message, assistant config, conversation history
  const response = await myAgent.invoke({ input: packet.userMessage.text })

  // Report events visible in Mission Control
  ctx.reportEvent({ eventType: 'tool_call', severity: 'info', payload: { tool: 'search' } })

  // Request approval for sensitive operations (blocks until resolved or timeout)
  const approval = await ctx.requestApproval({
    toolName: 'wallet_transfer',
    toolArgs: { amount: 100 },
    runId: 'run-123',
    timeoutMs: 300_000,
  })

  if (approval.decision === 'denied') {
    return { responseText: 'Transfer was denied by the operator.' }
  }

  return {
    responseText: response.output,
    tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
  }
})

await bridge.start()
```

### Observe mode — agent drives, Lucid watches

Use when your agent already handles its own I/O (imported agents, existing bots). The SDK sends heartbeats and events but does not poll for messages.

```typescript
import { LucidBridge } from '@lucid/agent-bridge'

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  engine: process.env.LUCID_ENGINE || 'openclaw',
  runtimeProtocol: process.env.LUCID_RUNTIME_PROTOCOL || 'lucid-runtime-v2',
  mode: 'observe',
})

await bridge.start()

// Wrap existing agent runs for observability
const result = await bridge.trackRun(
  { agentId: 'my-agent' },
  async () => {
    const res = await myExistingBot.handleMessage(userInput)
    return {
      responseText: res,
      tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    }
  },
)

console.log(`Run completed in ${result.durationMs}ms`)
```

## Environment variables

```bash
LUCID_RUNTIME_ID=<uuid>               # From Mission Control → System → Add Runtime
LUCID_RUNTIME_KEY=<key>               # Shown once on creation — copy immediately
LUCID_CONTROL_PLANE_URL=<url>         # e.g. https://lucid.foundation
LUCID_ENGINE=openclaw                 # openclaw, hermes, future engines
LUCID_RUNTIME_PROTOCOL=lucid-runtime-v2
```

## Configuration

All options except the three required fields have sensible defaults.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `runtimeId` | `string` | **required** | Runtime UUID from Mission Control |
| `runtimeKey` | `string` | **required** | API key (scrypt-hashed server-side, prefix-indexed for O(1) lookup) |
| `controlPlaneUrl` | `string` | **required** | Control plane base URL |
| `mode` | `'full' \| 'observe'` | `'full'` | `full` = Lucid drives messages via C1 relay. `observe` = agent drives I/O |
| `generation` | `number` | `1` | Deployment generation — prevents stale heartbeats after re-provisioning |
| `engine` | `string` | `'openclaw'` | Engine key reported to Mission Control |
| `runtimeProtocol` | `string` | `'lucid-runtime-v2'` | Runtime protocol identifier |
| `engineVersion` | `string` | `agent-bridge/0.1.0` | Engine implementation version in heartbeats |
| `runtimeVersion` | `string` | `agent-bridge/0.1.0` | Runtime/container/package version in heartbeats |
| `heartbeatIntervalMs` | `number` | `30000` | Heartbeat frequency (ms) |
| `eventFlushIntervalMs` | `number` | `5000` | Event batch flush frequency (ms) |
| `messagePollIntervalMs` | `number` | `5000` | Message claim polling frequency, full mode only (ms) |
| `offlineBufferCapacity` | `number` | `1000` | Ring buffer capacity for offline telemetry |
| `adapterIdentity` | `object` | `undefined` | Adapter type/version/source reported in capability heartbeat |
| `nativeCapabilities` | `array` | `undefined` | Engine-native feature descriptors surfaced in Runtime Detail |
| `runtimeServices` | `array` | `undefined` | Local services and health reported by the runtime |
| `adapterProbe` | `object` | `undefined` | Latest environment/probe summary |
| `transcriptParser` | `object` | `undefined` | Parser support/status summary |
| `commandSpec` | `object` | `undefined` | Runtime management command surface |
| `engineHomePolicy` | `object` | `undefined` | Engine Home read/write/review policy |
| `logger` | `BridgeLogger` | console | Custom logger implementing `{ info, warn, error }` |

## API reference

### `LucidBridge`

The main entry point. Orchestrates all subsystems.

```typescript
import { LucidBridge } from '@lucid/agent-bridge'
```

#### Constructor

```typescript
const bridge = new LucidBridge(config: BridgeConfig)
```

Validates config lazily — throws `BridgeConfigError` on `start()` if required fields are missing or invalid.

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `onMessage` | `(handler: MessageHandler) => void` | Register the message handler. Required before `start()` in full mode. |
| `onManagementCommand` | `(handler: RuntimeManagementCommandHandler) => void` | Execute queued runtime management commands delivered on heartbeat and ACK lifecycle states back to Lucid. |
| `start` | `() => Promise<void>` | Start heartbeat, event reporter, and (in full mode) message relay. Registers SIGINT/SIGTERM handlers. |
| `stop` | `() => Promise<void>` | Graceful shutdown: stop relay → flush events → send shutdown heartbeat → clean up timers. Idempotent. |
| `trackRun` | `(meta: { agentId: string }, fn: () => Promise<MessageResponse>) => Promise<RunResult>` | Wrap a function for observability (observe mode). Emits `run_started`/`run_finished`/`error` events and reports costs. |
| `reportEvent` | `(event: FeedEvent) => void` | Report a custom feed event (both modes). Batched and flushed on interval. |
| `reportCost` | `(cost: CostPayload) => void` | Report cost data for a run. Fire-and-forget. |

#### Diagnostic properties

| Property | Type | Description |
|----------|------|-------------|
| `isRunning` | `boolean` | Whether the bridge is currently started |
| `pendingEvents` | `number` | Events buffered, waiting to be flushed |
| `offlineBufferDepth` | `number` | Entries in the offline ring buffer |

### `BridgeConfigError`

Thrown on `start()` for invalid configuration:

```typescript
import { BridgeConfigError } from '@lucid/agent-bridge'

try {
  await bridge.start()
} catch (err) {
  if (err instanceof BridgeConfigError) {
    console.error('Config issue:', err.message)
    // e.g. "runtimeId is required — create a runtime in Mission Control first"
    // e.g. "controlPlaneUrl must be a valid URL"
  }
}
```

### `MessageHandler`

The callback you provide in full mode. Receives a `RunPacket` with everything needed to process a message.

```typescript
type MessageHandler = (packet: RunPacket, ctx: MessageContext) => Promise<MessageResponse>
```

**`RunPacket`** contains:
- `eventId` — unique event ID (for idempotency)
- `userMessage` — `{ text, externalMessageId, externalUserId, messageData }`
- `assistantConfig` — `{ id, name, systemPrompt, modelId, temperature, maxTokens, enabledTools, policyConfig, memoryEnabled, approvalRequiredTools }`
- `channelMeta` — `{ channelType, channelId, externalUserId, externalChatId, threadId? }`
- `recentMessages` — array of `{ role, content, createdAt }`
- `memoryInjection` — long-term memory strings
- `conversationSummary` — rolling summary of older conversation
- `skills` — prompt guidance `{ slug, content }[]`
- `plugins` — tool packages `{ slug, tools: { name, description, parameters }[] }[]`

**`MessageContext`** provides:
- `reportEvent(event)` — report a feed event (agentId auto-injected)
- `requestApproval(request)` — block until owner approves/denies/timeout expires
- `reportCost(cost)` — report token usage (agentId auto-injected)

**`MessageResponse`** return value:
- `responseText` — the agent's response (required)
- `outputArtifacts?` — `{ toolName, result }[]` for tool outputs
- `tokenUsage?` — `{ inputTokens, outputTokens, estimatedCostUsd }` for cost tracking

### `RunResult`

Returned by `trackRun()` in observe mode. Extends `MessageResponse` with `durationMs`.

### Wire types

These types are shared with the control plane. The worker re-exports them from this package (single source of truth).

```typescript
import type {
  HeartbeatPayload,
  FeedEvent,
  ApprovalRequest,
  ApprovalResolution,
  HealthScorePayload,
  CostPayload,
  NativeChannelStatus,
  RunPacket,
  CompleteInboundPayload,
  CompleteResult,
} from '@lucid/agent-bridge'
```

## Framework examples

### LangChain

```typescript
import { LucidBridge } from '@lucid/agent-bridge'
import { ChatOpenAI } from '@langchain/openai'
import { AgentExecutor, createReactAgent } from 'langchain/agents'

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  mode: 'full',
})

const llm = new ChatOpenAI({ model: 'gpt-4o' })
const agent = await createReactAgent({ llm, tools: myTools, prompt: myPrompt })
const executor = new AgentExecutor({ agent, tools: myTools })

bridge.onMessage(async (packet) => {
  const result = await executor.invoke({ input: packet.userMessage.text })
  return { responseText: result.output }
})

await bridge.start()
```

### CrewAI

```typescript
import { LucidBridge } from '@lucid/agent-bridge'

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  mode: 'observe',
})

await bridge.start()

const result = await bridge.trackRun({ agentId: 'my-crew' }, async () => {
  const crewResult = await myCrew.kickoff({ inputs: { query: userMessage } })
  return { responseText: crewResult.raw }
})
```

### OpenAI SDK (direct)

```typescript
import { LucidBridge } from '@lucid/agent-bridge'
import OpenAI from 'openai'

const openai = new OpenAI()

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  mode: 'full',
})

bridge.onMessage(async (packet) => {
  const completion = await openai.chat.completions.create({
    model: packet.assistantConfig.modelId,
    messages: [
      { role: 'system', content: packet.assistantConfig.systemPrompt ?? '' },
      ...packet.recentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: packet.userMessage.text },
    ],
  })

  const usage = completion.usage
  return {
    responseText: completion.choices[0].message.content ?? '',
    tokenUsage: usage
      ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, estimatedCostUsd: 0 }
      : undefined,
  }
})

await bridge.start()
```

### AutoGen

```typescript
import { LucidBridge } from '@lucid/agent-bridge'

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  mode: 'observe',
})

await bridge.start()

const result = await bridge.trackRun({ agentId: 'autogen-team' }, async () => {
  const chatResult = await groupChat.initiate_chat(userProxy, { message: userInput })
  return { responseText: chatResult.summary }
})
```

### Claude / Anthropic SDK

```typescript
import { LucidBridge } from '@lucid/agent-bridge'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const bridge = new LucidBridge({
  runtimeId: process.env.LUCID_RUNTIME_ID!,
  runtimeKey: process.env.LUCID_RUNTIME_KEY!,
  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
  mode: 'full',
})

bridge.onMessage(async (packet) => {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: packet.assistantConfig.maxTokens,
    system: packet.assistantConfig.systemPrompt ?? undefined,
    messages: [
      ...packet.recentMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: packet.userMessage.text },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? ''
  return {
    responseText: text,
    tokenUsage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      estimatedCostUsd: 0,
    },
  }
})

await bridge.start()
```

## Architecture

### Subsystems

```
LucidBridge
├── RestClient         HTTP client (Bearer auth, 30s timeout, BridgeError classification)
├── HeartbeatManager   30s heartbeat loop with system metrics (CPU, RAM, uptime)
├── EventReporter      5s batch flush (max 100/batch, 500 buffer cap, retry on failure)
├── MessageRelay       C1 claim/process/complete polling loop (full mode only)
├── ApprovalGate       Submit + 2s poll until approved/denied/expired
└── OfflineBuffer      Ring buffer for telemetry during control plane outages
```

### Protocol endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/runtimes/heartbeat` | POST | System metrics, status, dropped telemetry count |
| `/api/runtimes/events` | POST | Batch feed events (max 100) |
| `/api/runtimes/approvals` | POST | Submit approval request |
| `/api/runtimes/approvals/pending` | GET | Poll approval resolution |
| `/api/runtimes/health-scores` | POST | Health score submission |
| `/api/runtimes/costs` | POST | Per-run token accounting |
| `/api/runtimes/messages/claim-inbound` | POST | Claim pending messages (full mode) |
| `/api/runtimes/messages/complete-inbound` | POST | Complete message processing (full mode) |

### Connection resilience

- **Non-blocking start**: Initial heartbeat is fire-and-forget. If the control plane is unreachable, the offline buffer absorbs telemetry. `start()` never throws on network failure.
- **Offline buffer**: Ring buffer (default 1000 entries). Tail-drops oldest entries on overflow. Reports `_droppedTelemetry` count on reconnect so Mission Control knows data was lost.
- **Exponential backoff**: Message relay backs off on consecutive claim failures: 1s → 2s → 4s → max 30s. Resets on any successful poll.
- **Transient vs permanent errors**: 5xx and network errors are transient (retried with backoff). 429 respects `Retry-After` header. 4xx errors are permanent (logged, not retried).
- **Graceful shutdown**: SIGINT/SIGTERM → stop message relay → final event flush → shutdown heartbeat → clean up timers.

### Error classification

```typescript
import { BridgeError } from '@lucid/agent-bridge' // (internal — not exported)

// BridgeError properties:
error.status        // HTTP status (0 for network errors)
error.endpoint      // Which API endpoint failed
error.isTransient   // true for 429, 5xx, network errors
error.retryAfterMs  // Parsed from Retry-After header (429 only)
```

### Heartbeat payload

Every 30s, the SDK sends system metrics plus runtime identity to Mission Control:

```json
{
  "runtimeId": "rt-abc123",
  "generation": 1,
  "engine": "openclaw",
  "runtimeProtocol": "lucid-runtime-v2",
  "cpuPercent": 45.2,
  "ramPercent": 62.1,
  "diskPercent": 0,
  "pendingEvents": 3,
  "deadLetters": 0,
  "engineVersion": "openclaw/1.12.0",
  "runtimeVersion": "agent-bridge/0.1.0",
  "openclawVersion": "agent-bridge/0.1.0",
  "agentCount": 1,
  "uptimeSeconds": 3600,
  "_droppedTelemetry": 0
}
```

On shutdown, a final heartbeat is sent with `"status": "shutdown"`.

## Custom logger

The default logger writes to console with a `[lucid-bridge]` prefix. Override with any logger that implements `{ info, warn, error }`:

```typescript
import pino from 'pino'

const logger = pino({ name: 'lucid-bridge' })

const bridge = new LucidBridge({
  // ...
  logger: {
    info: (msg, ...args) => logger.info(msg, ...args),
    warn: (msg, ...args) => logger.warn(msg, ...args),
    error: (msg, ...args) => logger.error(msg, ...args),
  },
})
```

## Mission Control setup

1. Go to **Mission Control → System → Add Runtime**
2. Select a provider (Railway, Docker, Manual, etc.) or click **"Connect existing agent"**
3. Copy the environment variables (`LUCID_RUNTIME_ID`, `LUCID_RUNTIME_KEY`, `LUCID_CONTROL_PLANE_URL`)
4. Add them to your agent's environment
5. Start your agent — Mission Control shows "Connected" once the first heartbeat arrives

### Runtime protocol notes

- `lucid-runtime-v2` is the current engine-agnostic runtime protocol.
- Runtime identity should be reported with `engine`, `runtimeProtocol`, `engineVersion`, and `runtimeVersion`.
- `openclawVersion` is still accepted during the migration window for legacy OpenClaw runtimes and should be treated as backward-compatibility metadata rather than the primary runtime identity field.

## Development

```bash
cd packages/agent-bridge

# Typecheck
npm run typecheck

# Run tests (55 tests across 7 files)
npm run test

# Build (emits to dist/)
npm run build

# Watch mode
npm run dev
```

### Package structure

```
packages/agent-bridge/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts              # Barrel: LucidBridge + all public types
    ├── types.ts              # Wire types + SDK types (single source of truth)
    ├── bridge.ts             # LucidBridge orchestrator
    ├── http-client.ts        # RestClient + BridgeError
    ├── heartbeat.ts          # HeartbeatManager (30s loop + system metrics)
    ├── event-reporter.ts     # EventReporter (5s batch flush)
    ├── message-relay.ts      # MessageRelay (C1 claim/process/complete)
    ├── approval-gate.ts      # ApprovalGate (submit + 2s poll)
    ├── offline-buffer.ts     # OfflineBuffer (ring buffer, O(1) push)
    ├── metrics-collector.ts  # CPU/RAM/uptime via node:os
    ├── logger.ts             # BridgeLogger interface + console default
    └── __tests__/
        ├── offline-buffer.test.ts
        ├── http-client.test.ts
        ├── heartbeat.test.ts
        ├── event-reporter.test.ts
        ├── message-relay.test.ts
        ├── approval-gate.test.ts
        └── bridge.test.ts
```

### Worker integration

The worker consumes wire types from this package (no duplication):

```typescript
// worker/src/runtime/data-sink.ts
export type {
  NativeChannelStatus, HeartbeatPayload, FeedEvent, ApprovalRequest,
  ApprovalResolution, HealthScorePayload, CostPayload, RunPacket,
  CompleteInboundPayload, CompleteResult,
} from '@lucid/agent-bridge'
```

## License

Private — Lucid internal package.
