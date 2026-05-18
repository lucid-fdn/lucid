# Logging Guide: Capture, Store, and Search Logs

## Overview

LucidMerged has two logging contexts:
1. **Worker (Railway)** - Structured JSON logging with Pino
2. **Next.js App (Vercel)** - Standard Next.js logging

This guide covers both local development (file-based) and production (platform-based) log capture.

---

## Worker Logging (Railway)

### Local Development - File-Based Logging

#### 1. Install Dependencies
```bash
cd worker
npm install pino pino-pretty pino-roll
```

#### 2. Capture Logs to File
```bash
# Option A: Redirect stdout to file (simple)
npm run start:local 2>&1 | tee logs/worker-$(date +%Y%m%d-%H%M%S).log

# Option B: JSON logs with pretty printing
npm run start:local | pino-pretty -c -t SYS:standard > logs/worker-$(date +%Y%m%d-%H%M%S).log

# Option C: Raw JSON logs (best for parsing)
npm run start:local > logs/worker-$(date +%Y%m%d-%H%M%S).json 2>&1
```

#### 3. Search Logs Locally
```bash
# Search for error messages
grep "error" logs/worker-*.log

# Search for specific assistant
grep "assistantId.*abc123" logs/worker-*.json

# Search for user ID
grep "userId.*user_xyz" logs/worker-*.log

# Count error occurrences
grep -c "level.*error" logs/worker-*.json

# Get last 100 error lines
grep "error" logs/worker-*.log | tail -n 100

# Use jq for structured JSON search (if raw JSON)
cat logs/worker-*.json | jq 'select(.level == "error")'
cat logs/worker-*.json | jq 'select(.assistantId == "abc123")'
```

### Production (Railway) - Platform Logging

#### Railway CLI Commands
```bash
# Install Railway CLI (if not installed)
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Stream live logs
railway logs

# Download last 1000 lines
railway logs --limit 1000 > railway-logs-$(date +%Y%m%d-%H%M%S).log

# Filter by time
railway logs --since 1h > logs-last-hour.log
railway logs --since 2024-02-10 > logs-today.log

# Follow logs in real-time
railway logs --follow
```

#### Railway Dashboard
1. Go to [railway.app/dashboard](https://railway.app/dashboard)
2. Select your project → Worker service
3. Click "Logs" tab
4. Use built-in search/filter
5. Click "Download" for full log export

---

## Next.js App Logging (Vercel)

### Local Development
```bash
# Capture dev server logs
npm run dev 2>&1 | tee logs/nextjs-$(date +%Y%m%d-%H%M%S).log

# Build logs
npm run build 2>&1 | tee logs/build-$(date +%Y%m%d-%H%M%S).log
```

### Production (Vercel)

#### Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Stream logs from production
vercel logs --follow

# Get last 100 logs
vercel logs --output=raw > vercel-logs-$(date +%Y%m%d-%H%M%S).log

# Filter by deployment
vercel logs [deployment-url]
```

#### Vercel Dashboard
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click "Logs" → "Runtime Logs"
4. Use search filters (by function, status code, etc.)
5. Export logs (JSON format)

---

## Automated Log Rotation (Production-Ready)

### Add Log Rotation to Worker

Update `worker/src/logging/logger.ts`:

```typescript
import pino from 'pino'
import { multistream } from 'pino'

// File rotation setup
const streams = [
  // Console output
  { stream: process.stdout },
  
  // File output with rotation (if LOG_FILE_PATH set)
  ...(process.env.LOG_FILE_PATH
    ? [
        {
          stream: pino.destination({
            dest: process.env.LOG_FILE_PATH,
            sync: false,
            minLength: 4096,
          }),
        },
      ]
    : []),
]

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
  },
  multistream(streams)
)
```

Then set env var:
```bash
# .env.local
LOG_FILE_PATH=./logs/worker.log
```

---

## Log Aggregation Services (Recommended for Production)

### Option 1: Sentry (Already Integrated)
- Error logs already going to Sentry
- View at [sentry.io](https://sentry.io)
- Full context, stack traces, breadcrumbs

### Option 2: Datadog (Enterprise)
```bash
# Install Datadog agent
npm install dd-trace

# Update worker/src/index.ts
import tracer from 'dd-trace'
tracer.init({
  service: 'lucid-personal-worker',
  env: process.env.NODE_ENV,
})
```

### Option 3: LogTail (Simple)
```bash
# Install
npm install @logtail/node @logtail/pino

# Update logger
import { LogtailTransport } from '@logtail/pino'
const logtail = new LogtailTransport(process.env.LOGTAIL_TOKEN)
```

### Option 4: AWS CloudWatch (Railway → CloudWatch)
Railway has built-in CloudWatch export:
1. Railway Dashboard → Project Settings
2. Integrations → AWS CloudWatch
3. Enable log streaming

---

## Quick Commands Reference

### Capture All Logs (Local Development)

Create a script `scripts/capture-logs.sh`:
```bash
#!/bin/bash

# Create logs directory
mkdir -p logs

# Timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "📝 Capturing logs to logs/$TIMESTAMP-*.log"

# Worker logs
echo "Starting worker log capture..."
cd worker && npm run start:local 2>&1 | tee ../logs/$TIMESTAMP-worker.log &
WORKER_PID=$!

# Next.js logs
echo "Starting Next.js log capture..."
cd .. && npm run dev 2>&1 | tee logs/$TIMESTAMP-nextjs.log &
NEXTJS_PID=$!

echo "✅ Logging to:"
echo "   - logs/$TIMESTAMP-worker.log"
echo "   - logs/$TIMESTAMP-nextjs.log"
echo ""
echo "Press Ctrl+C to stop and save logs"

# Wait for Ctrl+C
trap "kill $WORKER_PID $NEXTJS_PID; exit" INT
wait
```

Make executable:
```bash
chmod +x scripts/capture-logs.sh
```

Run:
```bash
./scripts/capture-logs.sh
```

### Search Across All Logs
```bash
# Search all log files
grep -r "error" logs/

# Search with context (5 lines before/after)
grep -r -C 5 "error" logs/

# Search multiple patterns
grep -rE "error|warning|fatal" logs/

# Case-insensitive search
grep -ri "assistant" logs/

# Search JSON logs with jq
find logs -name "*.json" -exec cat {} \; | jq 'select(.level == "error")'
```

---

## Windows-Specific Commands

### PowerShell Log Capture
```powershell
# Worker logs
cd worker
npm run start:local *>&1 | Tee-Object -FilePath "..\logs\worker-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# Next.js logs
npm run dev *>&1 | Tee-Object -FilePath "logs\nextjs-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# Search logs
Select-String -Path "logs\*.log" -Pattern "error"

# Search with context
Select-String -Path "logs\*.log" -Pattern "error" -Context 2,2
```

### Windows Terminal Split Panes Setup
1. Open Windows Terminal
2. Split pane (Alt+Shift+D)
3. Top pane: Run worker with log capture
4. Bottom pane: `tail -f logs/worker-*.log` (using Git Bash or WSL)

---

## Troubleshooting

### Issue: "Logs scrolling too fast, can't see errors"
**Solution**: Use log level filtering
```bash
# Only show warnings and errors
LOG_LEVEL=warn npm run dev

# Only show errors
LOG_LEVEL=error npm run dev
```

### Issue: "Log files getting too large"
**Solution**: Implement log rotation (see above) or use logrotate:
```bash
# Install logrotate (Linux/Mac)
sudo apt-get install logrotate  # Ubuntu
brew install logrotate           # Mac

# Create config: /etc/logrotate.d/lucid-worker
/path/to/logs/worker-*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### Issue: "Can't find specific error in thousands of lines"
**Solution**: Use structured search with jq (JSON) or advanced grep:
```bash
# Install jq
brew install jq  # Mac
sudo apt-get install jq  # Ubuntu

# Search structured logs
cat logs/worker.json | jq 'select(.level == "error" and .assistantId == "abc123")'

# Get error summary
cat logs/worker.json | jq 'select(.level == "error") | {time, message, error}'
```

---

## Best Practices

1. **Always log to files in production** - Console logs can be lost
2. **Use structured logging** - JSON format enables powerful search
3. **Include context** - userId, requestId, assistantId in every log
4. **Rotate logs** - Prevent disk space issues
5. **Monitor log volume** - High volume = potential issues
6. **Set up alerts** - Get notified on error spikes
7. **Centralize logs** - Use Sentry/Datadog for aggregation

---

## Summary

| Environment | Method | Search Command |
|-------------|--------|----------------|
| **Local Worker** | `npm run start:local \| tee logs/worker.log` | `grep "error" logs/worker.log` |
| **Local Next.js** | `npm run dev \| tee logs/nextjs.log` | `grep "error" logs/nextjs.log` |
| **Railway Production** | `railway logs > logs/railway.log` | `grep "error" logs/railway.log` |
| **Vercel Production** | `vercel logs > logs/vercel.log` | `grep "error" logs/vercel.log` |
| **Sentry (Errors)** | Dashboard | Built-in search/filters |

Start with file-based logging for local development, then graduate to Railway/Vercel dashboards + Sentry for production monitoring.
