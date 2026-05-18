# LiteLLM Temporary Patch for Agent Worker

**Status:** Ready to deploy  
**Impact:** Low risk - simple env var change  
**Rollback:** Instant - revert env var

---

## Summary

Agent worker already uses OpenAI-compatible format. No code changes needed - just point `LUCID_API_BASE_URL` to LiteLLM instead of Lucid-L2.

## Current Architecture

```
Agent Worker (Railway)
  → callProvider({ format: 'openai' })  ✅ Already OpenAI-compatible
    → fetch(LUCID_API_BASE_URL/v1/chat/completions)
      → Lucid-L2 API
        → llmproxy.ts (custom format)
          → Eden AI providers
```

## Target Architecture (Temporary Patch)

```
Agent Worker (Railway)
  → callProvider({ format: 'openai' })  ✅ No change needed
    → fetch(LUCID_API_BASE_URL/v1/chat/completions)
      → LiteLLM (Railway)  ← Just change this URL
        → 100+ providers (OpenAI, Anthropic, etc.)
```

---

## ✅ LiteLLM Already Deployed on Railway!

**Current status (verified via health check):**

```bash
# LiteLLM Production (VERIFIED RUNNING ✅)
https://litellm-proxy-production-0a13.up.railway.app
LITELLM_API_KEY=<redacted-litellm-api-key>

# LucidMerged/.env.local (current config)
LUCID_API_BASE_URL=https://api.lucid.foundation  # ← Change this to LiteLLM
WORKER_URL=https://lucid-production-e9b8.up.railway.app  # ← Worker (deployed)
```

**Health check response (401 = service is alive, just needs API key):**
```json
{"error":{"message":"Authentication Error, No api key passed in.","type":"auth_error","code":"401"}}
```

---

## Deployment Steps (Ready to Deploy Now!)

### Step 1: Update Worker Environment Variable

**In Railway Dashboard → Worker Service → Variables:**

```bash
# Before
LUCID_API_BASE_URL=https://api.lucid.foundation

# After (VERIFIED PRODUCTION URL)
LUCID_API_BASE_URL=https://litellm-proxy-production-0a13.up.railway.app
```

**Important:** 
- Do NOT include `/v1` suffix (worker adds it automatically via `ensureV1Suffix()`)
- Worker will auto-redeploy when you save this change

### Step 2: Monitor Deployment

Railway auto-deploys on env var change. Monitor logs:

```bash
railway logs --service=worker --tail
```

Look for:
```
[agent] ✅ provider=lucid-l2 model=gpt-4 duration=XXXms
```

---

## Testing

### Test 1: Simple Agent Message

Send a message to any assistant and verify response:

```bash
# From LucidMerged
curl -X POST https://lucid-production-e9b8.up.railway.app/api/v1/messages \
  -H "Authorization: Bearer ${WORKER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "asst_xxx",
    "conversation_id": "conv_xxx",
    "user_message": "Hello, this is a test"
  }'
```

Expected: Normal LLM response (via LiteLLM → OpenAI/etc.)

### Test 2: Check Agent Logs

```bash
railway logs --service=worker --filter="provider=lucid-l2"
```

Should show successful calls to LiteLLM.

---

## Rollback

If issues occur:

```bash
# Revert to Lucid-L2
LUCID_API_BASE_URL=https://api.lucid.foundation
```

Railway redeploys automatically. Rollback takes ~2 minutes.

---

## Known Limitations

### ⚠️ Passport Support Unknown

The agent worker previously used Lucid-L2's custom format for passport routing:

```typescript
// Custom fields that may be lost
{
  "model_passport_id": "passport_xxx",
  "model_meta": { ... }
}
```

**LiteLLM may strip these fields.** If passports are critical, test thoroughly before deploying to production.

**Workaround if passports break:**
- Use TrustGate instead (supports custom fields)
- Or keep Lucid-L2 for passport routing, use LiteLLM for everything else

---

## Verification Checklist

- [ ] LiteLLM Railway URL confirmed
- [ ] LiteLLM `/health` endpoint returns 200
- [ ] Worker env var updated (`LUCID_API_BASE_URL`)
- [ ] Worker redeployed successfully
- [ ] Test agent message sent
- [ ] Agent logs show successful LLM calls
- [ ] Passport routing tested (if used)

---

## Next Steps (Post-Patch)

Once stable:

1. **Add unified metering:** Route LiteLLM events to OpenMeter
2. **Replace llm-proxy permanently:** Update Lucid-L2 to use LiteLLM or TrustGate
3. **Centralize all inference:** Point chat UI to same LiteLLM instance

This patch proves the concept. Once validated, we can make it permanent.
