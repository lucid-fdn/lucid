# 🚂 Railway Deployment Troubleshooting Guide

**Last Updated:** 2026-02-03  
**Issue:** Railway not auto-rebuilding after git push

---

## ✅ **Verified: Your Changes ARE Pushed**

```bash
commit a947306 (HEAD -> main, origin/main, origin/HEAD)
Date: Tue Feb 3 16:15:49 2026 +0100
Files:
  - worker/LUCID_L2_TEMPORARY_FIX.md
  - worker/src/processors/inbound.ts
```

**✅ Your code is committed and pushed to GitHub**  
**❌ Railway didn't automatically rebuild**

---

## 🔍 **Why Railway Should Have Rebuilt**

According to `railway.json`:

```json
{
  "watchPatterns": [
    "worker/**",      // ← Your changes match this!
    "contracts/**",
    "package.json"
  ]
}
```

Both modified files match `worker/**`, so Railway should have triggered.

---

## 🚨 **ROOT CAUSE: No Auto-Deploy on Your Plan**

**Your Railway plan does NOT include auto-deploy.** You must manually trigger deployments.

**Available Deploy Options:**
- Custom Start Command
- Pre-deploy steps
- Teardown
- Cron Schedule
- Healthcheck Path
- Serverless
- Restart Policy

**Missing:**
- ❌ Auto-Deploy toggle (not available on your plan)

### Manual Deploy is Required
**Check Railway Logs:**
1. Go to Railway dashboard
2. Click **Deployments** tab
3. Look for the deployment triggered at ~16:15 (4:15 PM)
4. Check status: Building, Failed, Success, Queued?

### 3. Build Trigger Failed
**Possible causes:**
- Railway webhook not configured correctly
- GitHub push didn't trigger webhook
- Railway experiencing service issues

### 4. Dockerfile Issues
**Check if Dockerfile is valid:**
```bash
cd c:/LucidMerged
docker build -f worker/Dockerfile -t test-build .
```

If this fails locally, Railway will fail too.

---

## 🔧 **How to Deploy (Required Every Time)**

Since auto-deploy is not available on your plan, you MUST manually deploy after every code change.

### Option 1: Railway CLI (Recommended - Fastest)
```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Trigger manual deployment
railway up
```

### Option 2: Railway Dashboard (Easiest)
1. Go to Railway dashboard
2. Select your project
3. Click on your service
4. Click **Deployments** tab
5. Click **"Deploy Latest"** button (top right)
6. Or click **"New Deployment"** → Select `main` branch

### Option 3: Force Re-Deploy via Git
```bash
cd c:/LucidMerged

# Create empty commit to trigger rebuild
git commit --allow-empty -m "chore: Trigger Railway rebuild"
git push origin main
```

### Option 4: Re-Push Last Commit
```bash
cd c:/LucidMerged

# Force push (use with caution!)
git push origin main --force
```

---

## 📋 **Verification Checklist**

After manual rebuild:

```bash
# 1. Check Railway deployment status
# Go to Railway dashboard → Deployments

# 2. Check Railway logs for errors
# Railway dashboard → View Logs

# 3. Verify service is running
# Railway dashboard → Service should show "Active"

# 4. Test health endpoint (if configured)
curl https://your-worker-domain.railway.app/health

# 5. Check worker logs for Lucid-L2 calls
# Should see: [lucid-l2] API call logs
```

---

## 🐛 **Debugging Steps**

### Step 1: Verify Railway Configuration
```bash
cd c:/LucidMerged
cat railway.json
```

Expected output:
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "worker/Dockerfile",
    "watchPatterns": ["worker/**", "contracts/**", "package.json"]
  }
}
```

### Step 2: Check Railway Environment Variables
Required env vars in Railway:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `LUCID_API_BASE_URL` (should be `https://api.lucid.foundation`)
- `WORKER_ID`
- `TELEGRAM_BOT_TOKEN` (if using Telegram)

### Step 3: Check Dockerfile
```bash
cd c:/LucidMerged
cat worker/Dockerfile
```

Verify:
- Base image exists
- Dependencies install correctly
- Entry point is configured

### Step 4: Check Railway Build Logs
Look for errors like:
- ❌ `Dockerfile not found`
- ❌ `npm install failed`
- ❌ `TypeScript compilation failed`
- ❌ `Health check failed`

---

## 🎯 **Your Deployment Workflow (Every Time)**

### Since You Don't Have Auto-Deploy:

**After every git push, you MUST manually deploy:**

**1. Manual Deploy (Primary Method)**
```
Railway Dashboard → Deployments → Deploy Latest
```

**3. Empty Commit (Force Trigger)**
```bash
cd c:/LucidMerged
git commit --allow-empty -m "chore: Trigger Railway rebuild"
git push origin main
```

---

## 📊 **Expected Results After Successful Deploy**

### In Railway Logs:
```
[worker] Starting event loop...
[worker] Worker ID: worker-xxx
[worker] Polling for inbound events...
[processor] Processing inbound abc123 (attempt 1)
[lucid-l2] Calling https://api.lucid.foundation/proxy/invoke/model/openai-gpt35-turbo
[lucid-l2] Response: 200 OK
[processor] ✅ Inbound abc123 done
```

### In Supabase `assistant_messages`:
- User message with `role='user'`
- Assistant response with `role='assistant'`
- `tokens_prompt` and `tokens_completion` populated

---

## 🔗 **Useful Links**

- Railway Dashboard: https://railway.app/project/YOUR_PROJECT_ID
- Railway Docs: https://docs.railway.app
- Railway Status: https://status.railway.app
- GitHub Repository: https://github.com/daishizenSensei/LucidMerged

---

## 📝 **Next Steps**

1. **Try Manual Deploy** (Railway Dashboard → Deploy Latest)
2. **Check Deployment Logs** for errors
3. **Verify Service is Running**
4. **Test with Telegram** (send message to bot)
5. **Monitor Railway Logs** for Lucid-L2 API calls

---

## ⚠️ **If All Else Fails**

**Create New Railway Service:**
1. In Railway dashboard, create new service
2. Connect to GitHub repo
3. Set root directory to `worker/`
4. Configure environment variables
5. Deploy

**OR Contact Railway Support:**
- Railway Discord: https://discord.gg/railway
- Railway Support: https://railway.app/help

---

## 🔄 **Your Standard Workflow**

**Every time you change code:**

Last worker deploy trigger note: 2026-05-09 Slack command acknowledgement hotfix.

```bash
# 1. Make changes to code
# 2. Commit changes
git add .
git commit -m "feat: Your change description"
git push origin main

# 3. MANUALLY DEPLOY (Required!)
# Option A: Railway Dashboard
# Go to Railway → Deployments → Click "Deploy Latest"

# Option B: Railway CLI
railway up

# Option C: Empty commit to trigger (if you upgrade to auto-deploy plan)
# git commit --allow-empty -m "deploy: Trigger rebuild"
# git push origin main
```

---

**IMPORTANT:** Without auto-deploy, Railway will NEVER automatically rebuild. You must manually deploy every time!
