# Quick Start Guide

Get Lucid running in 5 minutes.

## Prerequisites

- Docker 24+ with Docker Compose v2
- An LLM API key (Lucid Gateway, OpenAI, Anthropic, Groq, or Ollama)

## 1. Clone and Configure

```bash
git clone https://github.com/lucid-fdn/lucid.git
cd lucid
./scripts/generate-env.sh
```

This copies `.env.example` to `.env` and generates all required secrets (JWT, encryption keys, Supabase keys). File permissions are set to 600 (owner-only read/write).

## 2. Add Your AI Provider Keys

Edit `.env` and configure the capabilities you need.

For text, structured generation, and AI agent/project generation, pick one option:

### Option A: Lucid Gateway (recommended — Lucid-first default)

Sign up at [lucid.foundation](https://lucid.foundation), copy your API key:

```bash
TRUSTGATE_API_KEY=your-lucid-gateway-key
```

### Option B: Bring your own text model key

```bash
OPENAI_API_KEY=sk-your-key-here
# or
ANTHROPIC_API_KEY=sk-ant-your-key-here
# or
GROQ_API_KEY=gsk_your-key-here
```

### Option C: Self-hosted inference (Ollama, vLLM, LM Studio)

```bash
FALLBACK_PROVIDER_URL=http://host.docker.internal:11434/v1
FALLBACK_PROVIDER_MODEL=llama3.1
```

Make sure Ollama is running on your host machine.

### Optional: image generation

If you want image generation, configure the Lucid/TrustGate image gateway:

```bash
TRUSTGATE_BASE_URL=https://api.lucid.foundation
TRUSTGATE_API_KEY=lk_your_key
IMAGE_PROVIDER=auto
IMAGE_MODEL=gpt-image-2
AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED=false
```

Provider model:
- text / structured / agent generation: Lucid-first, BYOK-capable
- voice / transcription: shared provider policy, also Lucid-first across web and worker flows
- image: TrustGate/Lucid-first via the AI generation control plane

Practical precedence:
- if `TRUSTGATE_API_KEY` is set, Lucid is the default path
- if Lucid is not configured, shared BYOK fallbacks are used where supported
- you do not need to wire separate provider logic for project generation vs worker media vs chat

## 3. Start

```bash
docker compose up
```

First build takes 5-10 minutes. Subsequent starts are fast.

Wait for all services to be healthy:
```
db-1        | LOG:  database system is ready to accept connections
migrate-1   | All migrations applied
postgrest-1 | Listening on port 3000
gotrue-1    | GoTrue API started on: 0.0.0.0:9999
web-1       | Ready on http://0.0.0.0:3000
worker-1    | Worker started on port 8080
```

The Docker worker already runs the compiled entrypoint. If you run the worker manually outside Docker for local debugging, use the same pattern:

```bash
cd worker
npm run start:local
```

Prefer that over `npm run dev` for end-to-end local validation.

## 4. Create Your First Agent

1. Open [http://localhost:3000](http://localhost:3000)
2. Sign up with email and password (local auth via GoTrue — no external provider needed)
3. Click **New Agent**
4. Give it a name and system prompt
5. Select your model
6. Start chatting

## 5. Verify

Run the diagnostic:

```bash
npm run selfhost:doctor
```

All checks should pass.

## Network Architecture

Only port 3000 (web) is exposed to the host by default. All other services communicate on an isolated Docker bridge network (`lucid`).

| Service | Internal Port | Exposed to Host | Purpose |
|---------|---------------|-----------------|---------|
| Web | 3000 | **Yes** (3000) | Next.js app (UI + API) |
| PostgREST | 3000 | No | REST API for database |
| GoTrue | 9999 | No | Auth (email/password) |
| Redis | 6379 | No | Cache + rate limiting |
| Worker | 8080 | No | Agent processing |
| PostgreSQL | 5432 | No | Database + pgvector |

To expose debug ports for local development, use the full compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up
```

This exposes db:5432, postgrest:3001, gotrue:9999, redis:6379, worker:8080.

## Custom Port

To run the web app on a different port:

```bash
LUCID_PORT=8080 docker compose up
```

## Next Steps

- [Self-Hosting Guide](SELF_HOSTING.md) — Production setup, TLS, scaling
- [Environment Reference](ENV_REFERENCE.md) — All configuration options
- Enable channels: set `TELEGRAM_HOSTED_BOT_TOKEN` for Telegram
- Add more LLM providers via Settings → Provider Keys in the web UI

## Troubleshooting

### Build fails with "out of memory"
Increase Docker's memory limit to 8GB in Docker Desktop settings.

### "Connection refused" errors
Services are still starting. Wait 30 seconds and refresh.

### "No models available"
Check that at least one text-generation provider is set in `.env` (`TRUSTGATE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, or `FALLBACK_PROVIDER_URL`).

### "Image generation provider is not configured"
Set `TRUSTGATE_API_KEY`, `TRUSTGATE_BASE_URL`, and `IMAGE_PROVIDER=auto` in `.env`. Direct OpenAI image fallback requires `OPENAI_API_KEY` and `AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED=true`.

### Worker not processing messages
Check worker logs: `docker compose logs worker`

If you are running the worker manually instead of through Docker, use the compiled runtime path:

```bash
cd worker
npm run start:local
```

### Which provider path is the worker using?
Worker media/runtime flows now follow the same Lucid-first provider policy as the app. Check:
- `TRUSTGATE_API_KEY`
- `LUCID_API_BASE_URL` / `LUCID_API_KEY`
- `OPENAI_API_KEY`

in that order, plus capability-specific speech/STT overrides if you set them.
