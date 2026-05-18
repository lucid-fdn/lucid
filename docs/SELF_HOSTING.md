# Self-Hosting Guide

Production deployment guide for Lucid.

## System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 10 GB | 50 GB (SSD) |
| Docker | 24+ | Latest |
| Docker Compose | v2 | Latest |

## Architecture

Lucid self-hosted runs 6 services on an isolated Docker bridge network (`lucid`):

- **PostgreSQL 15** — Primary database with pgvector for memory embeddings
- **PostgREST** — REST API layer (what `@supabase/supabase-js` talks to)
- **GoTrue** — Auth service (JWT generation, email/password)
- **Redis** — Caching, rate limiting, pub/sub
- **Web** — Next.js standalone (UI + API routes)
- **Worker** — Node.js agent processor (polling, tool execution, memory)

Only port 3000 (web) is exposed to the host. All other services communicate internally via the `lucid` bridge network.

### Worker runtime mode

The canonical worker runtime is the compiled Node entrypoint:

```bash
cd worker
npm run start:local
```

That uses the compiled worker runtime. For full local end-to-end testing, prefer that over `npm run dev`.

`npm run dev` still exists for source-level iteration, but it is not the authoritative production-like path for self-hosted validation.

### Auth

Auth uses a provider-agnostic adapter pattern. The default is `local` (GoTrue email/password), which requires no external service. Optionally set `AUTH_PROVIDER=privy` to use Privy.

Both providers route through a shared user resolution module (`resolve-user.ts`) that handles identity lookup and JIT user creation via the `@/lib/db` layer.

### Feature Matrix

A feature matrix (`src/lib/self-host/feature-matrix.ts`) controls what's available per deployment mode. Self-hosted mode auto-disables billing, launchpad, and cloud-only channels while enabling all core features.

## Initial Setup

```bash
git clone https://github.com/lucid-fdn/lucid.git
cd lucid
./scripts/generate-env.sh
```

The script copies `.env.example` to `.env`, generates all secrets, and sets file permissions to 600.

Edit `.env`:
1. Add a text-generation provider key
2. Optionally add image generation
3. Set `NEXT_PUBLIC_APP_URL` to your domain (if not localhost)

Recommended:
- `TRUSTGATE_API_KEY` for Lucid-first text / structured / agent generation
- `OPENAI_API_KEY` only when running a fully self-hosted direct-provider fallback; SaaS BYOK routes through TrustGate provider-key sync
- `TRUSTGATE_API_KEY` plus `IMAGE_PROVIDER=auto` for Lucid-first image generation

Provider precedence in self-hosted mode:
1. Lucid / TrustGate when `TRUSTGATE_*` is configured
2. explicit Lucid config via `LUCID_API_BASE_URL` / `LUCID_API_KEY`
3. self-host-only capability fallbacks such as `OPENAI_API_KEY`

That applies across web generation flows and worker media/runtime paths. The point is Lucid-first defaults without hard lock-in.

### TrustGate and BYOK

In Lucid Cloud/SaaS, BYOK is centralized at the TrustGate boundary:

- users add provider keys from Settings -> Provider Keys
- provider-key API responses return safe metadata only, never plaintext keys
- writes require owner/admin access and sync the key to TrustGate
- assistant detail stores routing mode in `policy_config.trustgate.inference_mode`
- supported modes are Auto, Lucid managed, and BYOK only

For self-hosted installs, direct provider environment variables remain available as a local fallback, but they are not the SaaS control-plane path.

```bash
docker compose up -d
```

### Custom Port

Override the web port with `LUCID_PORT`:

```bash
LUCID_PORT=8080 docker compose up -d
```

## TLS / HTTPS

For production, put a reverse proxy in front:

### With Caddy (recommended)
```
# Caddyfile
lucid.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### With nginx
```nginx
server {
    listen 443 ssl;
    server_name lucid.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Update `.env`:
```bash
NEXT_PUBLIC_APP_URL=https://lucid.yourdomain.com
```

## Security

### Network Isolation

By default, only the web service (port 3000) is exposed to the host. Database, PostgREST, GoTrue, Redis, and worker are only accessible within the Docker network.

For local development, use the full compose file to expose debug ports:

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up
```

This exposes: db:5432, postgrest:3001, gotrue:9999, redis:6379, worker:8080. **Do not use in production.**

### Secret Management

- `generate-env.sh` creates secrets with `openssl rand` and sets `.env` to 600 permissions
- Secrets are passed to JWT generation via environment variables (not shell interpolation)
- Migrations use dollar-quoting for SQL parameters (no injection risk)
- Local auth uses timing-safe JWT signature comparison

### Rate Limiting

The local login endpoint is rate-limited to 5 attempts per 5 minutes per IP.

Rate limiting requires Redis. If Redis is unavailable, the login endpoint falls back to an in-memory rate limiter (safe for single-instance deployments). For multi-instance deployments, ensure Redis is always available.

### Secret Rotation

**JWT_SECRET**: Generate a new secret, then restart GoTrue, PostgREST, and Web. All existing user sessions will be invalidated and users must log in again.

```bash
# Generate a new JWT secret
openssl rand -base64 32
# Update JWT_SECRET in .env, then:
docker compose restart gotrue postgrest web
```

**ENCRYPTION_KEY**: This key encrypts stored data (messages, memories). It **cannot** be rotated without re-encrypting all existing data. If you must change it, you will need to decrypt all data with the old key and re-encrypt with the new key. There is no automated migration for this.

**POSTGRES_PASSWORD**: Change the password in `.env`, then bring the stack down and back up:

```bash
docker compose down
docker compose up -d
```

**INTERNAL_SERVICE_SECRET**: Update in `.env` and restart the web and worker services:

```bash
docker compose restart web worker
```

## Upgrading

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically on startup via the `migrate` init container. Each migration is applied in a single transaction and tracked idempotently in the `schema_migrations` table.

### Canonical bootstrap path

Lucid self-hosted uses a Docker-first schema bootstrap:

- base schema: `docker/bootstrap/000_base_schema.sql`
- migration runner image/script: `docker/migrate/Dockerfile` + `docker/migrate/run.sh`
- incremental migrations: `supabase/migrations/`
- legacy numbered migrations may exist under `migrations/` for historical evidence or alternate runners, but cloud/self-host bootstrap should use the Supabase timestamped path

If you are testing a fresh database locally, validate that path instead of assuming a `supabase/config.toml` bootstrap exists for this repo.

### Realtime / logical replication

Some migrations create publications used by Supabase Realtime-style flows. On a plain PostgreSQL container, those warnings are expected unless Postgres starts with:

```bash
wal_level=logical
```

Without `wal_level=logical`, publication creation will warn and logical-replication-backed realtime behavior will remain inactive even if the rest of the schema migrates successfully.

## Backup

### Database
```bash
docker compose exec db pg_dump -U postgres lucid > backup-$(date +%Y%m%d).sql
```

### Restore
```bash
docker compose exec -T db psql -U postgres lucid < backup-20260331.sql
```

### Automated backup (cron)
```bash
0 2 * * * cd /path/to/lucid && docker compose exec -T db pg_dump -U postgres lucid | gzip > /backups/lucid-$(date +\%Y\%m\%d).sql.gz
```

## Data Management

### Stopping services

```bash
# Stop services, keep all data (volumes preserved)
docker compose down

# Stop services AND delete all volumes (WARNING: permanent data loss)
docker compose down -v
```

### Volume inspection

```bash
# List all Lucid-related volumes
docker volume ls | grep lucid

# Inspect a specific volume
docker volume inspect lucid_db-data
```

### Individual volume cleanup

```bash
# Remove a specific volume (service must be stopped)
docker volume rm lucid_db-data
docker volume rm lucid_redis-data
```

## Scaling

### Separate worker
Run the worker on a different machine:

```bash
# On worker machine
docker run -d \
  --name lucid-worker \
  -e SUPABASE_URL=http://your-main-server:3001 \
  -e SUPABASE_SERVICE_ROLE_KEY=your-key \
  -e REDIS_URL=redis://your-main-server:6379 \
  -e OPENAI_API_KEY=your-key \
  -e ENCRYPTION_KEY=your-key \
  -e MESSAGE_ENCRYPTION_MASTER_KEY=your-key \
  lucid-worker
```

### External PostgreSQL
Use a managed PostgreSQL (Supabase, RDS, etc.):

```bash
# Comment out db service in docker-compose.yml
# Set in .env:
DATABASE_URL=postgres://user:pass@host:5432/lucid
SUPABASE_URL=http://your-postgrest:3000
```

### External Redis
```bash
REDIS_URL=redis://user:pass@your-redis:6379
```

## Optional Extras

### Supabase Studio (DB admin)
```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d
```

Access Studio at [http://localhost:3100](http://localhost:3100).

### Kong API Gateway

Included in `docker-compose.full.yml`. Provides a unified API gateway on port 8000/8443. Useful if you need a single entry point for PostgREST + GoTrue + custom routes.

### Channels

**Telegram:**
1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set in `.env`: `TELEGRAM_HOSTED_BOT_TOKEN=your-bot-token`
3. Restart worker

**Discord:**
1. Create a Discord application and bot
2. Set in `.env`: `DISCORD_BOT_TOKEN=your-bot-token`
3. Restart worker

### Nango (OAuth integrations)
For Slack, Google, Notion integrations, self-host [Nango](https://nango.dev):

```bash
NANGO_SECRET_KEY=your-nango-key
NEXT_PUBLIC_OAUTH_API_URL=http://your-nango:3003
```

## Monitoring

### Health check
```bash
npm run selfhost:doctor
```

The doctor checks: required env vars, DB connectivity, PostgREST, GoTrue, Redis, worker health, LLM configuration, auth provider, encryption key validity, and feature matrix alignment.

### Service logs
```bash
docker compose logs web
docker compose logs worker
docker compose logs db
docker compose logs migrate
```

### Worker health

Worker health is only accessible within the Docker network by default. Use:

```bash
docker compose exec worker curl http://localhost:8080/health
```

Or expose debug ports with `docker-compose.full.yml`.

## Connecting to Lucid Cloud

Optional — connect your self-hosted instance to Lucid Cloud services:

```bash
# TrustGate (100+ LLM models via unified gateway)
TRUSTGATE_API_KEY=lk_your_key
LUCID_API_BASE_URL=https://api.lucid.foundation

# L2 Gateway (managed runtime deployment)
LUCID_L2_API_URL=https://l2.lucid.foundation/api
```

Provider architecture in self-hosted mode:
- text / structured / project-generation: Lucid-first when `TRUSTGATE_API_KEY` is configured, otherwise shared BYOK/provider fallback rules apply
- media transcription / speech: shared media provider policy, also Lucid-first by default
- image generation: TrustGate/Lucid-first control-plane modality, with direct OpenAI fallback only when explicitly enabled
- worker ingress, relay, and voice-reply paths follow the same shared provider policy instead of channel-local env fallback logic
- engine compatibility layers may still expose OpenAI-compatible runtime env vars internally, but those are populated from shared worker helpers rather than each engine path deciding provider precedence on its own

## Troubleshooting

### Migration fails
```bash
docker compose logs migrate
# If schema is corrupted, reset:
docker compose down -v  # WARNING: deletes all data
docker compose up
```

If migrations fail on a fresh self-hosted database:

1. Confirm the bootstrap schema in `docker/bootstrap/000_base_schema.sql` was applied.
2. Confirm the migrate container is using `docker/migrate/run.sh` with Unix line endings.
3. If Realtime-related warnings appear, check whether Postgres is running with `wal_level=logical`.

### Services not starting
Check health status:
```bash
docker compose ps
```

PostgREST and GoTrue have healthchecks. Web and worker depend on them via `service_healthy`.

### High memory usage
- Reduce Next.js build workers: add `NEXT_BUILD_WORKERS=2` to web environment
- Reduce PostgreSQL shared_buffers in db environment
- Use external Redis instead of in-container
