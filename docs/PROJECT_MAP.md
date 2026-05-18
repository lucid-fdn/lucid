# PROJECT MAP — LucidMerged

> Navigation index for the LucidMerged codebase. Keep this short (~300 lines).
> For detailed docs, see `docs/` or `memory-bank/`.
> For new feature work, start with `docs/NEW_FEATURE_DEVELOPMENT_CHECKLIST.md`.

## High-Level Architecture

```
src/app/
  (marketing)/    → Public pages (/, /blog, /contact, /company)
  (app)/          → Authenticated workspace (dashboard, AI, settings)
  (workflow)/     → Workflow editor routes
  api/            → REST + streaming endpoints

worker/           → Separate deploy (runtime execution, channel relay/native handling, memory pipeline)
contracts/        → Shared types between app, worker, runtimes, and generated apps
migrations/       → legacy numbered SQL migrations
supabase/migrations/ → canonical Supabase migrations used by current cloud/self-host bootstrap
memory-bank/      → Project context (read at session start)
```

## Module Map

### Authentication & Authorization
- `src/lib/auth/session.ts` — `requireUserId()`, JIT user creation via `resolveInternalUserId()`
- `src/lib/auth/server-utils.ts` — `requireServerAuth()` for API routes
- `src/ports/auth.ts` — Auth facade (Privy abstraction)
- `src/middleware.ts` — Lightweight auth + maintenance mode routing

### Database (Service Layer)
- `src/lib/db/index.ts` — **ALL database CRUD** (ESLint enforces no direct Supabase imports)
- `src/lib/db/provider-keys.ts` — BYOK provider key CRUD, encryption, safe reads, TrustGate sync/disable
- `src/lib/db/key-templates.ts` — Gateway key template CRUD
- `src/lib/db/engine-home.ts` — EHV snapshot/candidate state for assistant detail and review surfaces
- `src/ports/db.ts` — DB facade (Supabase abstraction)

### AI System
- `src/lib/ai/providers.ts` — Lucid-L2 provider (OpenAI-compatible), `getLucidModel()`
- `src/lib/ai/control-plane/` — shared AI generation governance wrapper: feature flags, policy, receipts/events, observability, modality adapters
- `src/lib/ai/images/` — TrustGate/OpenAI-compatible image provider resolution and generation/edit client; no Replicate prediction polling
- `src/lib/ai/agent-avatar/` — composable agent avatar specs, style presets, prompt compiler, durable job/progress helpers, generation service, and asset storage
- `src/lib/ai/byok-models.ts` — BYOK model catalog projection from active provider keys
- `src/lib/ai/sdk.ts` — Official `raijin-labs-lucid-ai` SDK singleton
- `src/lib/ai/models.ts` — Model registry (cached from Lucid-L2 API)
- `src/lib/ai/service.ts` — Conversations, messages, documents, usage tracking
- `src/lib/ai/context.ts` — Context pruning, system prompt builder
- `src/lib/ai/rag.ts` — RAG pipeline (embed + search)
- `src/lib/ai/embeddings.ts` — Vector embedding generation
- `src/lib/ai/tools.ts` — AI SDK tool definitions
- `src/lib/ai/schemas.ts` — Zod schemas for structured output
- `src/lib/ai/middleware.ts` — AI middleware layer
- `src/lib/ai/attachments.ts` — File/image handling for chat

### AI API Routes
- `src/app/api/ai/chat/route.ts` — **Streaming chat**; assistant mode proxies to the worker with runtime context and TrustGate policy, non-agent simple chat keeps legacy BYOK-first fallback, GET loads messages
- `src/app/api/ai/image/route.ts` — generic image generation through the AI control plane and TrustGate/OpenAI-compatible image adapter
- `src/app/api/agents/avatar/generate/route.ts` — draft/create-agent avatar generation with Lucid Studio defaults
- `src/app/api/ai/avatar-jobs/[jobId]/route.ts` — authenticated avatar job status and SSE progress snapshots for partial previews
- `src/app/api/assistants/[id]/avatar/generate/route.ts` — existing-assistant avatar generation/regeneration using current avatar identity references when requested
- `src/app/api/assistants/[id]/avatar/accept/route.ts` — promotes a generated avatar asset to the current assistant/launched-agent avatar
- `src/app/api/ai/generate-workflow/route.ts` — Workflow generation (streamText)
- `src/app/api/ai/models/route.ts` — Model listing
- `src/app/api/ai/conversations/route.ts` — Conversation CRUD
- `src/app/api/ai/rag/documents/route.ts` — RAG document management

### Worker Channel Delivery
- `worker/src/channels/ChannelOutput.ts` — Channel output lifecycle contract
- `worker/src/channels/ChannelAdapter.ts` — centralized channel output adapter boundary; OpenClaw/Hermes are engine adapters behind shared channel contracts
- `docs/CHANNEL_ADAPTER_ARCHITECTURE.md` — Centralized adapter architecture + safety invariants
- `tests/integration/channel-adapter.test.ts` — Adapter hardening integration tests

### Runtime / Engine Parity
- `packages/runtime-compat/` — engine/runtime/channel compatibility source for OpenClaw, Hermes, shared, dedicated, and BYO
- `packages/agent-bridge/` — BYO runtime bridge SDK and packet contracts
- `packages/bridge-cli/` — `lucid-runtime` CLI for BYO adapter setup/run/probes
- `packages/hermes-runtime/`, `packages/openclaw-runtime/` — first-party runtime adapter packages
- `packages/runtime-adapter-sdk/`, `packages/runtime-adapters/` — adapter authoring contract and built-in Hermes/OpenClaw manifests
- `packages/engine-home/` and `contracts/engine-home.ts` — EHV snapshot/diff/archive contracts
- `src/lib/mission-control/runtime-client-sanitize.ts` — client-facing redaction for Lucid-operated runtime records
- `src/app/api/runtimes/` — runtime deploy/config/heartbeat/probe/log/domain/detail APIs
- `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md` — latest parity, re-home, TrustGate/BYOK, command, and UI verification record

### AI Chat UI
- `src/components/ai-chat/ai-chat-interface.tsx` — Main chat component (useChat + DefaultChatTransport)
- `src/components/ai-chat/model-selector.tsx` — Model picker
- `src/components/ai-chat/message-list.tsx` — Message rendering
- `src/components/ai-chat/chat-input.tsx` — Input with file upload
- `src/components/ai-chat/conversation-sidebar.tsx` — Conversation history

### Gateway & BYOK
- `src/app/api/orgs/[id]/lucidgateway-keys/` — Gateway key management API
- `src/app/api/orgs/[id]/lucidgateway-keys/spend/` — Spend analytics API (per-key + per-model)
- `src/app/api/orgs/[id]/provider-keys/` — BYOK provider key API; safe fields only, admin writes, TrustGate sync
- `src/components/gateway/` — Gateway UI (keys client, multi-model selector, provider keys, spend analytics)
- `src/components/assistants/assistant-detail-client.tsx` — assistant inference mode selector: Auto, Lucid managed, BYOK only
- `src/app/(app)/[workspace-slug]/settings/gateway/` — Gateway settings page
- `src/lib/crypto/encryption.ts` — AES-256-GCM for key storage

### Access Control
- `src/lib/access-control/types.ts` — **Single source of truth** (PlanLimits, PLAN_LIMITS, ROLE_PERMISSIONS)
- `src/components/access-control/` — FeatureGate, UpgradeBadge, hooks
- `src/lib/workspace/capabilities.ts` — Server-side capability resolver

### Marketplace & Search
- `src/lib/marketplace/marketplace-service.ts` — High-level marketplace API
- `src/lib/search/orchestrator.ts` — Multi-source parallel search
- `src/lib/search/adapters/` — SearchAdapter interface + implementations

### Workspace
- `src/lib/workspace/utils.ts` — URL builders (use instead of manual construction)
- `src/contexts/` — React contexts (auth, profile, workspace, notification)

### Error Handling
- `src/lib/errors/error-service.ts` — ErrorService with Sentry integration
- **Rule:** Never use bare `console.error` in production code

### Feature Flags
- `src/lib/feature-flags.ts` — Env-var based flags

## Key Flows

### AI Chat (BYOK-aware)
```
User types message → assistant/chat UI (useChat)
  → POST /api/ai/chat
  → if assistantId is present, load assistant runtime + policy_config.trustgate.inference_mode
  → Auto / Lucid managed / BYOK only is sent to the worker/engine TrustGate path
    → BYOK only requires an active synced org provider key
    → Lucid managed uses Lucid-managed provider routing
    → Auto lets TrustGate choose the safe available path
  → if assistantId is absent, use the legacy simple-chat BYOK helper with Lucid fallback
  → pruneForModel() → streamText() → toUIMessageStreamResponse()
  → onFinish: save messages + track usage
```

### Agent Avatar Generation
```
Create-agent or assistant detail UI
  → POST /api/agents/avatar/generate or /api/assistants/[id]/avatar/generate
  → resolve auth/org context and normalize avatar spec
  → buildAgentAvatarPrompt() with style, angle, crop, expression, background, lighting, and identity-lock rules
  → runAIGeneration(feature: "agent-avatar-generation", modality: "image")
  → src/lib/ai/images/provider.ts resolves TrustGate first; direct OpenAI only if explicitly enabled
  → agent_avatar_generation_jobs stores durable queue state, progress stage/percent, and partial preview asset refs
  → GET /api/ai/avatar-jobs/[jobId]?stream=1 streams same-origin SSE snapshots; UI falls back to centralized polling
  → storeAgentAvatarAsset() writes image bytes to the avatars bucket and metadata to agent_avatar_assets
  → avatar accept route marks the selected asset current and updates launched-agent rendering URLs where needed
```

### Runtime Execution
```
Assistant config/runtime row
  → packages/runtime-compat resolves engine/runtime/channel/bridge support
  → shared worker, dedicated runtime, or BYO runtime receives RuntimeExecutionContext
  → OpenClaw/Hermes adapters consume the same channels, skills/plugins, memory, TrustGate, and EHV contracts
  → Mission Control shows sanitized runtime state, mutations, probes, parser status, services, and EHV diffs
```

### Authentication
```
Login → Privy → resolveInternalUserId() → identity_links → internal UUID
API route → requireServerAuth() → { userId }
```

### Multi-Tenancy
```
Organization → Project → Environment
setWorkspaceScope(orgId, projectId, envId) → RLS scoped queries
```

## Where to Change Common Things

| Task | File(s) |
|------|---------|
| Add DB operation | `src/lib/db/index.ts` |
| Add AI model support | `src/lib/ai/models.ts`, `src/lib/ai/byok-models.ts`, and legacy simple-chat `src/lib/ai/byok-provider.ts` when needed |
| Add plan limit | `src/lib/access-control/types.ts` (PlanLimits + PLAN_LIMITS) |
| Add feature flag | `src/lib/feature-flags.ts` |
| Add API route | `src/app/api/` (follow existing patterns) |
| Add UI component | Check `src/components/ui/` (shadcn) first |
| Add migration | `supabase/migrations/YYYYMMDDHHMMSS_description.sql`; keep timestamps unique and align remote-history placeholders |
| Add error handling | Use `ErrorService.captureException()` |
| Add workspace URL | `src/lib/workspace/utils.ts` |
| Add runtime compatibility | `packages/runtime-compat/src/index.ts` + tests |
| Add runtime/client redaction | `src/lib/mission-control/runtime-client-sanitize.ts` |
| Add BYO CLI behavior | `packages/bridge-cli/src/cli/commands.ts` |

## Glossary

- **BYOK** — Bring Your Own Key (user's provider API keys)
- **TrustGate** — centralized inference gateway for Lucid managed and BYOK model routing
- **Lucid-L2** — deployment/control layer and legacy unified AI endpoint references
- **LucidGateway** — Managed API key system (LiteLLM proxy, Pro+ only)
- **EHV** — Engine Home Virtualization: engine-home snapshots, diffs, commits, rollback, export/import
- **HHV/OHV** — Hermes/OpenClaw implementations of EHV
- **FlowSpec** — Structured workflow definition (Zod schema)
- **RLS** — Row-Level Security (Supabase/PostgreSQL)
- **JIT** — Just-In-Time (user creation on first login)
