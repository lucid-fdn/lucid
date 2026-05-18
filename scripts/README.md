__Smoke test the full flow__

- Set `LUCIDGATEWAY_PROXY_URL` and `LUCIDGATEWAY_MASTER_KEY` env vars
- Test create → rotate → revoke → audit timeline as Pro admin
- Test upgrade CTA as free plan user
# LucidMerged Logging Scripts

Quick helper scripts for capturing and searching logs during development.

## Quick Start

### Unix/Mac/Linux (Bash)

```bash
# Make scripts executable (one-time setup)
chmod +x scripts/capture-logs.sh
chmod +x scripts/search-logs.sh

# Start log capture
./scripts/capture-logs.sh

# Search logs (in another terminal)
./scripts/search-logs.sh error
./scripts/search-logs.sh "assistant.*abc123"
./scripts/search-logs.sh error --context 5
```

### Windows (PowerShell)

```powershell
# Start log capture
.\scripts\capture-logs.ps1

# Search logs (in another terminal)
.\scripts\search-logs.ps1 error
.\scripts\search-logs.ps1 "assistant.*abc123"
.\scripts\search-logs.ps1 error -Context 5
.\scripts\search-logs.ps1 error -CaseSensitive
```

## Scripts

| Script | Purpose |
|--------|---------|
| `capture-logs.sh` / `.ps1` | Starts both Worker and Next.js with log capture |
| `search-logs.sh` / `.ps1` | Quick search across all captured logs |
| `audit-hosted-channel-envs.mjs` | Audit hosted Slack / Discord / Teams / WhatsApp env completeness |

## Hosted Channel Env Audit

Use this when a hosted channel rollout is blocked and you need one fast answer about whether Vercel has the required control-plane env vars.

```bash
# Production
npm run env:audit:channels

# Or target a different Vercel environment
node scripts/audit-hosted-channel-envs.mjs preview
node scripts/audit-hosted-channel-envs.mjs development
```

The script exits non-zero when any required hosted Slack / Discord / Teams / WhatsApp env var is missing for the requested environment.

Current WhatsApp checks include:

- `FEATURE_WHATSAPP_HOSTED`
- `WHATSAPP_HOSTED_PHONE_NUMBER`
- `WHATSAPP_HOSTED_PHONE_NUMBER_ID`
- `WHATSAPP_HOSTED_ACCESS_TOKEN`
- `WHATSAPP_HOSTED_APP_SECRET`
- `WHATSAPP_HOSTED_VERIFY_TOKEN`
- `FEATURE_OPENCLAW_CHANNELS_WHATSAPP_MANAGED`

## Manual Log Capture

If you prefer manual control:

### Worker Only
```bash
cd worker
npm run dev 2>&1 | tee ../logs/worker-$(date +%Y%m%d-%H%M%S).log
```

### Next.js Only
```bash
npm run dev 2>&1 | tee logs/nextjs-$(date +%Y%m%d-%H%M%S).log
```

### Both (Manual)
```bash
# Terminal 1: Worker
cd worker && npm run dev 2>&1 | tee ../logs/worker.log

# Terminal 2: Next.js
npm run dev 2>&1 | tee logs/nextjs.log
```

## Search Examples

```bash
# Find all errors
./scripts/search-logs.sh error

# Find warnings or errors
./scripts/search-logs.sh "warning|error"

# Find specific assistant
./scripts/search-logs.sh "assistantId.*abc123"

# Find with context (5 lines before/after)
./scripts/search-logs.sh error --context 5

# Search JSON logs with jq (if installed)
./scripts/search-logs.sh error --json
```

## Production Logs

For production environments, see `docs/LOGGING_GUIDE.md` for:
- Railway log access
- Vercel log access
- Log aggregation services (Sentry, Datadog, etc.)

## Troubleshooting

### "Permission denied" on Unix/Mac
```bash
chmod +x scripts/*.sh
```

### "Cannot be loaded because running scripts is disabled" on Windows
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Logs directory doesn't exist
```bash
mkdir -p logs
```

### Want to clear old logs
```bash
# Remove logs older than 7 days
find logs -name "*.log" -mtime +7 -delete
```

## Configuration

### Change Log Level
```bash
# In worker/.env.local
LOG_LEVEL=debug  # trace, debug, info, warn, error, fatal
```

### Custom Log Location
```bash
# Edit scripts to change output directory
# Default: ./logs/
```

### Log Rotation
See `docs/LOGGING_GUIDE.md` for log rotation setup with logrotate or pino-roll.
