# ⚠️ TEMPORARY FIX: Lucid-L2 Endpoint Workaround

**Status:** ACTIVE (using `/invoke/model/` endpoint)  
**Date Applied:** 2026-02-03  
**Reason:** `/v1/chat/completions` requires Solana wallet for passport registration

---

## 🔍 **What This Fix Does**

We're temporarily using the `/proxy/invoke/model/{model_id}` endpoint instead of the OpenAI-compatible `/v1/chat/completions` endpoint.

### Why?
- ✅ **Works immediately** with Eden AI credits
- ❌ The proper `/v1/chat/completions` endpoint requires:
  - Valid Solana wallet address
  - Registering models as passports
  - Passport ownership verification

---

## 📝 **What Changed**

**File:** `worker/src/processors/inbound.ts`  
**Function:** `callLucidL2()`

### BEFORE (Proper OpenAI-compatible):
```typescript
POST ${config.LUCID_API_BASE_URL}/v1/chat/completions
Body: { model, messages, temperature, max_tokens }
Response: { choices: [{ message: { content } }], usage }
```

### AFTER (Temporary workaround):
```typescript
POST ${proxyUrl}/proxy/invoke/model/${assistant.lucid_model}
Body: { prompt, parameters: { max_tokens, temperature } }
Response: { output, usage, metadata }
```

---

## 🔄 **How to Revert (When Ready)**

### Option 1: Apply the revert patch
```bash
cd c:/LucidMerged
git apply worker/lucid-l2-revert.patch
```

### Option 2: Manual revert
See `worker/lucid-l2-openai-compatible.patch` for the proper implementation.

---

## ✅ **When to Revert**

Revert this fix when you:
1. ✅ Have a Solana wallet address
2. ✅ Register models as passports (run `scripts/register-model-passports.ts` with `PASSPORT_OWNER` env var)
3. ✅ Test that `/v1/chat/completions` works

---

## 📋 **Prerequisites for Reverting**

1. **Get Solana Wallet:**
   - Install Phantom: https://phantom.app
   - Create wallet
   - Copy public key (format: `7xKX...abc123`)

2. **Set Environment Variable:**
   ```bash
   export PASSPORT_OWNER="YOUR_SOLANA_WALLET_ADDRESS"
   ```

3. **Register Models:**
   ```bash
   npx tsx scripts/register-model-passports.ts
   ```

4. **Test:**
   ```bash
   npx tsx scripts/test-llama-passport.ts
   ```

5. **Apply Revert Patch:**
   ```bash
   git apply worker/lucid-l2-revert.patch
   ```

6. **Deploy and Verify**

---

## 📊 **Trade-offs**

### Current (Temporary Fix):
- ✅ Works immediately
- ✅ No Solana wallet needed
- ✅ Direct to Eden AI
- ❌ Not OpenAI-compatible
- ❌ No passport provenance tracking

### After Revert:
- ✅ OpenAI-compatible endpoint
- ✅ Passport provenance tracking
- ✅ Standard format
- ⚠️ Requires Solana wallet setup

---

## 🔗 **Related Files**

- `worker/src/processors/inbound.ts` - Modified file
- `worker/lucid-l2-invoke-model.patch` - Current implementation (applied)
- `worker/lucid-l2-revert.patch` - Revert to OpenAI-compatible
- `scripts/register-model-passports.ts` - Passport registration script
- `scripts/test-llama-passport.ts` - Test script

---

**REMEMBER: This is a temporary workaround. Plan to revert once Solana wallet is set up!**